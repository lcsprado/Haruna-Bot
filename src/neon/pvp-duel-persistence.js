// Persistência de homologação para !duelo. NÃO IMPORTAR no runtime até homologação.
// Todas as mutações são transações com SELECT FOR UPDATE e as notificações são outbox.
// O dispatcher/worker WhatsApp e o motor de combate ainda não estão integrados.
import {
  inviteStrategicDuel,acceptStrategicDuel,declineStrategicDuel,
  beginDuelDecision,chooseDuelAction,completeDuelDecision,
  finishStrategicDuel,publicStrategicDuel
} from './pvp-duel-session-prototype.js';
import {newDuelCombatSnapshot} from './pvp-duel-round-engine.js';

const ACTIVE=new Set(['invited','ready','decision','combat']);
const MAX_SESSION_MS=20*60*1000;
const intTime=ms=>{if(!Number.isSafeInteger(ms)||ms<0)throw new Error('invalid database clock');return ms;};
const iso=ms=>new Date(ms).toISOString();
const participant=id=>typeof id==='string'&&id.length>0&&id.length<=200;
const sessionId=id=>typeof id==='string'&&id.length>0&&id.length<=120;

async function transaction(pool,fn){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const value=await fn(client);
    await client.query('COMMIT');
    return value;
  }catch(error){
    try{await client.query('ROLLBACK');}catch{}
    throw error;
  }finally{client.release();}
}
async function dbTime(client){
  const res=await client.query("SELECT floor(extract(epoch from clock_timestamp()) * 1000)::bigint AS now_ms");
  return intTime(Number(res.rows[0]?.now_ms));
}
const dueAt=state=>state.phase==='invited'?iso(state.inviteExpiresAt):
  state.phase==='decision'?iso(state.currentDecision.deadlineAt):null;
const publicState=state=>publicStrategicDuel(state);

async function appendEvent(client,state,kind){
  await client.query(`INSERT INTO pvp_duel_outbox(duel_id,revision,kind,payload)
    VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(duel_id,revision,kind) DO NOTHING`,
    [state.id,state.revision,kind,JSON.stringify(publicState(state))]);
}
async function saveState(client,state,hardExpiry){
  await client.query(`UPDATE pvp_duel_sessions SET phase=$2,revision=$3,
      state=$4::jsonb,next_deadline_at=$5,hard_expires_at=$6,updated_at=clock_timestamp()
    WHERE id=$1`,[state.id,state.phase,state.revision,JSON.stringify(state),dueAt(state),hardExpiry]);
  if(!ACTIVE.has(state.phase)){
    await client.query('DELETE FROM pvp_duel_participants WHERE duel_id=$1',[state.id]);
  }
}
function expire(state,reason,nowMs){
  return {...state,phase:'cancelled',revision:state.revision+1,
    currentDecision:null,result:{reason,expiredAt:nowMs}};
}
async function lockedSession(client,id){
  const r=await client.query('SELECT state,revision,hard_expires_at FROM pvp_duel_sessions WHERE id=$1 FOR UPDATE',[id]);
  if(r.rowCount===0)throw new Error('duel not found');
  const row=r.rows[0],state=row.state;
  if(!state||state.id!==id||state.revision!==row.revision)throw new Error('duel revision integrity failure');
  return {state,hardExpiry:row.hard_expires_at};
}

export async function createPersistentDuel(pool,{id,challenger,opponent,combatSnapshot=null}={}){
  if(!sessionId(id)||!participant(challenger)||!participant(opponent)||challenger===opponent)throw new Error('invalid duel identity');
  return transaction(pool,async client=>{
    const nowMs=await dbTime(client);
    const previous=await client.query('SELECT state FROM pvp_duel_sessions WHERE id=$1 FOR UPDATE',[id]);
    if(previous.rowCount){
      const state=previous.rows[0].state;
      if(state.players[0]!==challenger||state.players[1]!==opponent)throw new Error('duel id collision');
      return publicState(state); // idempotent delivery of identical challenge
    }
    const state=inviteStrategicDuel({id,challenger,opponent,nowMs});
    // O snapshot é produzido pelo servidor, não pelo comando recebido do WhatsApp.
    // Sem snapshot, sessão experimental pode ser testada, mas não pode avançar o combate.
    if(combatSnapshot){
      const combat=newDuelCombatSnapshot(combatSnapshot);
      if(combat.fighters[0].jid!==challenger||combat.fighters[1].jid!==opponent)
        throw new Error('duel snapshot identity mismatch');
      state.combat=combat;
    }
    const hardExpiry=iso(nowMs+MAX_SESSION_MS);
    await client.query(`INSERT INTO pvp_duel_sessions
      (id,player_a,player_b,phase,revision,state,next_deadline_at,hard_expires_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [id,challenger,opponent,state.phase,state.revision,JSON.stringify(state),dueAt(state),hardExpiry]);
    // jid PRIMARY KEY serializes competing challenges across BOTH participant roles.
    await client.query('INSERT INTO pvp_duel_participants(jid,duel_id) VALUES($1,$3),($2,$3)',
      [challenger,opponent,id]);
    await appendEvent(client,state,'invited');
    return publicState(state);
  });
}
function applyCommand(state,command,playerId,args,nowMs){
  switch(command){
    case 'accept':
      if(state.phase==='ready'&&state.players[1]===playerId)return [state,null];
      return [acceptStrategicDuel(state,{playerId,nowMs}),'accepted'];
    case 'decline':return [declineStrategicDuel(state,{playerId,nowMs}),'declined'];
    case 'open':
      if(state.phase==='decision'&&state.round===args.round)return [state,null];
      return [beginDuelDecision(state,{round:args.round,nowMs,timeoutMs:30000}),'decision_opened'];
    case 'choose':{
      const next=chooseDuelAction(state,{playerId,choice:args.choice,nowMs});
      if(next===state)return [state,null];
      // Ambos responderam: resolver AGORA, sem esperar os 30 segundos.
      if(Object.keys(next.currentDecision.hiddenChoices).length===2){
        return [completeDuelDecision(next,{nowMs}),'round_resolved'];
      }
      return [next,'choice_recorded'];
    }
    case 'resolve':
      if(state.phase==='combat'&&state.lastDecisionRound===args.round)return [state,null];
      if(state.round!==args.round)throw new Error('stale resolution round');
      return [completeDuelDecision(state,{nowMs}),'round_resolved'];
    case 'finish':return [finishStrategicDuel(state,{winnerId:args.winnerId,nowMs}),'finished'];
    default:throw new Error('unknown duel action');
  }
}
export async function mutatePersistentDuel(pool,{
  id,command,playerId=null,args={},expectedRevision=null
}={}){
  if(!sessionId(id))throw new Error('invalid duel id');
  return transaction(pool,async client=>{
    const {state,hardExpiry}=await lockedSession(client,id);
    const nowMs=await dbTime(client);
    const automated=new Set(['open','resolve','finish']);
    if(!automated.has(command)&&!state.players.includes(playerId))throw new Error('not a participant');
    if(nowMs>=new Date(hardExpiry).getTime())throw new Error('duel expired; awaiting cleanup');
    if(expectedRevision!==null&&expectedRevision!==state.revision)throw new Error('stale duel revision');
    const [next,kind]=applyCommand(state,command,playerId,args,nowMs);
    if(kind){
      await saveState(client,next,hardExpiry);
      await appendEvent(client,next,kind);
    }
    return publicState(next);
  });
}

// Worker entry point. Safe to run repeatedly or from multiple workers.
// Expired invitations release players; timed-out choices become neutral.
// A resolved round remains in 'combat' until the *future combat worker* advances it.
export async function sweepPersistentDuelDeadlines(pool,{limit=30}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('invalid sweep limit');
  const due=await pool.query(`SELECT id FROM pvp_duel_sessions
    WHERE phase IN ('invited','ready','decision','combat')
    AND (hard_expires_at<=clock_timestamp() OR
      (next_deadline_at IS NOT NULL AND next_deadline_at<=clock_timestamp()))
    ORDER BY COALESCE(next_deadline_at,hard_expires_at),id LIMIT $1`,[limit]);
  const out=[];
  for(const {id} of due.rows){
    const result=await transaction(pool,async client=>{
      const {state,hardExpiry}=await lockedSession(client,id);
      const nowMs=await dbTime(client),expired=nowMs>=new Date(hardExpiry).getTime();
      let next,kind;
      if(!ACTIVE.has(state.phase))return null;
      if(expired){next=expire(state,'session_expired',nowMs);kind='expired';}
      else if(state.phase==='invited'&&nowMs>=state.inviteExpiresAt){
        next=expire(state,'invitation_expired',nowMs);kind='expired';
      }else if(state.phase==='decision'&&nowMs>=state.currentDecision.deadlineAt){
        next=completeDuelDecision(state,{nowMs});kind='round_resolved';
      }else return null;
      await saveState(client,next,hardExpiry);
      await appendEvent(client,next,kind);
      return {id,kind,state:publicState(next)};
    });
    if(result)out.push(result);
  }
  return out;
}
export async function getPublicPersistentDuel(pool,id){
  if(!sessionId(id))throw new Error('invalid duel id');
  const r=await pool.query('SELECT state FROM pvp_duel_sessions WHERE id=$1',[id]);
  return r.rowCount?publicState(r.rows[0].state):null;
}
// Caller must restrict event delivery to trusted workers. Payload never exposes
// hidden choices: choice_recorded publishes only total responses, not who chose what.
export async function getPendingDuelEvents(pool,{limit=30}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('invalid event limit');
  const r=await pool.query(`SELECT event_id,duel_id,revision,kind,payload
    FROM pvp_duel_outbox WHERE delivered_at IS NULL ORDER BY event_id LIMIT $1`,[limit]);
  return r.rows;
}

// Exactly-once DB state advancement for a resolved/accepted event.
// 'advance' MUST be a synchronous, pure function. It receives a cloned state.
// The future canonical combat adapter will process auto rounds up to the next
// decision or terminal result, with no wallet/XP side effects in this callback.
export async function resumePersistentDuelOnce(pool,{id,sourceRevision,advance}={}){
  if(!sessionId(id)||!Number.isInteger(sourceRevision)||sourceRevision<0)throw new Error('invalid resume identity');
  if(typeof advance!=='function')throw new Error('pure combat advance callback required');
  return transaction(pool,async client=>{
    const {state,hardExpiry}=await lockedSession(client,id);
    const nowMs=await dbTime(client);
    if(state.revision>sourceRevision){
      return {applied:false,reason:'already_advanced',state:publicState(state)};
    }
    if(state.revision<sourceRevision)throw new Error('future duel revision');
    if(!['ready','combat'].includes(state.phase))throw new Error('duel not ready to advance');
    if(nowMs>=new Date(hardExpiry).getTime())throw new Error('duel expired');
    const result=advance(structuredClone(state),{nowMs});
    if(!result||typeof result.then==='function')throw new Error('combat reducer must be synchronous');
    if(result.id!==state.id||
       JSON.stringify(result.players)!==JSON.stringify(state.players)||
       result.revision!==state.revision+1||
       !['decision','finished'].includes(result.phase)){
      throw new Error('invalid combat transition');
    }
    if(result.phase==='decision'&&(
       !result.currentDecision||result.currentDecision.deadlineAt>new Date(hardExpiry).getTime()
    ))throw new Error('invalid next decision deadline');
    const kind=result.phase==='decision'?'decision_opened':'finished';
    await saveState(client,result,hardExpiry);
    await appendEvent(client,result,kind);
    return {applied:true,reason:null,state:publicState(result)};
  });
}
