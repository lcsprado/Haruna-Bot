// Cerco ao Castelo: batalhas e escolhas autoritativas no banco, nunca no cliente.
// Recursos reais (dinheiro, HP do jogador e XP) não são alterados.
import {db} from './db.js';
import {ensureWebActionOutbox} from './web-activity-relay.js';
import {grantFirstSiegeInsignias} from './clan-siege-first-prize.js';

const LIMIT_HP=2000, MAX_ROUNDS=6, ROUND_MS=5*60*1000, MAX_REPAIR=2;
const ACTIONS=new Set(['attack','defend','repair','spy']);
const siegeGroup=()=>String(process.env.ALPHA_CLAN_SIEGE_GROUP_JID||'').trim();
const ON=()=>process.env.ALPHA_CLAN_SIEGE_ENABLED==='1'&&/^[0-9-]+@g\.us$/.test(siegeGroup());
const now=()=>Date.now();
let schemaPromise=null;

export const isClanSiegeEnabled=()=>ON();
export async function ensureClanSiegeSchema(){
  if(!schemaPromise)schemaPromise=(async()=>{
    await db.query([
      "CREATE TABLE IF NOT EXISTS alpha_siege_matches(",
      "id BIGSERIAL PRIMARY KEY,chat_jid TEXT NOT NULL,",
      "blue_clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,red_clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,",
      "created_by TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending'",
      "CHECK(status IN ('pending','active','completed','cancelled')),",
      "round INTEGER NOT NULL DEFAULT 1 CHECK(round BETWEEN 1 AND 6),round_ends_at BIGINT NOT NULL DEFAULT 0,",
      "blue_hp INTEGER NOT NULL DEFAULT 2000 CHECK(blue_hp BETWEEN 0 AND 2000),",
      "red_hp INTEGER NOT NULL DEFAULT 2000 CHECK(red_hp BETWEEN 0 AND 2000),",
      "blue_repairs INTEGER NOT NULL DEFAULT 0,red_repairs INTEGER NOT NULL DEFAULT 0,",
      "blue_spy INTEGER NOT NULL DEFAULT 0,red_spy INTEGER NOT NULL DEFAULT 0,",
      "winner_clan_id BIGINT,history JSONB NOT NULL DEFAULT '[]'::jsonb,",
      "created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,ended_at BIGINT);",
      "CREATE UNIQUE INDEX IF NOT EXISTS alpha_siege_one_open_per_group",
      "ON alpha_siege_matches(chat_jid) WHERE status IN ('pending','active');",
      "CREATE TABLE IF NOT EXISTS alpha_siege_roster(",
      "match_id BIGINT NOT NULL REFERENCES alpha_siege_matches(id) ON DELETE CASCADE,",
      "jid TEXT NOT NULL,clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,PRIMARY KEY(match_id,jid));",
      "CREATE TABLE IF NOT EXISTS alpha_siege_moves(",
      "match_id BIGINT NOT NULL REFERENCES alpha_siege_matches(id) ON DELETE CASCADE,",
      "round INTEGER NOT NULL,jid TEXT NOT NULL,",
      "clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,",
      "action TEXT NOT NULL CHECK(action IN ('attack','defend','repair','spy')),",
      "submitted_at BIGINT NOT NULL,PRIMARY KEY(match_id,round,jid));",
      "CREATE TABLE IF NOT EXISTS alpha_siege_first_victory(",
      "chat_jid TEXT PRIMARY KEY,match_id BIGINT NOT NULL,winner_clan_id BIGINT NOT NULL,awarded_at BIGINT NOT NULL);"
    ].join(' '));
    await ensureWebActionOutbox(db);
  })().catch(e=>{schemaPromise=null;throw e});
  return schemaPromise;
}
function group(session){
  const value=String(session?.chatJid||'');
  if(!value.endsWith('@g.us'))throw new Error('Vincule sua sessão ao grupo usando !web.');
  if(ON()&&value!==siegeGroup())throw new Error('Cerco ao Castelo disponível apenas no grupo AlphaBot.');
  return value;
}
function gate(){if(!ON())throw new Error('Cerco ao Castelo ainda está em preparação.');}
async function tx(cb){
  const conn=await db.connect();
  try{await conn.query('BEGIN');const result=await cb(conn);await conn.query('COMMIT');return result;}
  catch(e){await conn.query('ROLLBACK').catch(()=>{});throw e;}
  finally{conn.release();}
}
async function eligible(conn,chat){
  const q=[
    "SELECT c.id,c.name,ARRAY_AGG(cm.jid ORDER BY cm.jid) AS jids,",
    "COUNT(cm.jid)::int AS members,",
    "COUNT(DISTINCT ws.jid)::int AS linked",
    "FROM clans c JOIN clan_members cm ON cm.clan_id=c.id",
    "LEFT JOIN (SELECT DISTINCT jid FROM web_sessions",
    "WHERE chat_jid=$1 AND expires_at>$2) ws ON ws.jid=cm.jid",
    "GROUP BY c.id,c.name HAVING COUNT(cm.jid)=2 AND COUNT(DISTINCT ws.jid)>0 ORDER BY c.id"
  ].join(' ');
  return (await conn.query(q,[chat,now()])).rows.map(r=>({...r,id:String(r.id),jids:r.jids||[]}));
}
// Read-only readiness: no personal JIDs leave the server. Shared with status and logs.
const betaAuthorizedJids=()=>new Set(String(process.env.ALPHA_WEB_BETA_JIDS||'').split(',').map(x=>x.trim()).filter(Boolean));
export function analyzeSiegeEligibility(teams,authorizedJids=[]){
  const allowed=authorizedJids instanceof Set?authorizedJids:new Set(authorizedJids);
  const overview=(Array.isArray(teams)?teams:[]).map(team=>({
    id:String(team.id),name:String(team.name||'Clã'),
    members:Number(team.members)||0,linked:Number(team.linked)||0,
    betaAuthorized:(Array.isArray(team.jids)?team.jids:[]).filter(jid=>allowed.has(String(jid))).length
  }));
  const ready=overview.length===2 && overview.every(t=>
    t.members===2&&t.linked===2&&t.betaAuthorized===2
  );
  return {ready,teams:overview,eligibleClans:overview.length,linkedPlayers:overview.reduce((n,t)=>n+t.linked,0),authorizedPlayers:overview.reduce((n,t)=>n+t.betaAuthorized,0)};
}
export async function clanSiegePreflight(){
  const chat=siegeGroup();
  if(!/^[0-9-]+@g\.us$/.test(chat))return {configured:false,ready:false,teams:[]};
  const teams=await eligible(db,chat);
  return {configured:true,...analyzeSiegeEligibility(teams,betaAuthorizedJids())};
}

async function openMatch(conn,chat,locked=false){
  const q=[
    "SELECT * FROM alpha_siege_matches WHERE chat_jid=$1",
    "AND status IN ('pending','active') ORDER BY id DESC LIMIT 1",
    locked?"FOR UPDATE":""
  ].join(' ');
  return (await conn.query(q,[chat])).rows[0]||null;
}
async function notice(conn,chat,message){
  const r=await conn.query(
    "INSERT INTO alpha_web_action_outbox(chat_jid,kind,payload,created_at_ms) VALUES($1,'message',$2::jsonb,$3) RETURNING id",
    [chat,JSON.stringify({text:message}),now()]
  );
  await conn.query("SELECT pg_notify('alpha_web_action_wakeup_v1',$1)",[String(r.rows[0].id)]);
}
export function resolveSiegeRound(match,moves){
  const sides={blue:[],red:[]};
  for(const m of moves){
    const side=String(m.clan_id)===String(match.blue_clan_id)?'blue':'red';
    sides[side].push(m.action);
  }
  const n=(side,action)=>sides[side].filter(x=>x===action).length;
  const atk={};
  for(const side of ['blue','red']){
    const rival=side==='blue'?'red':'blue';
    atk[side]=Math.round(180*n(side,'attack')*(Number(match[side+'_spy'])?1.2:1)*Math.max(.4,1-.35*n(rival,'defend')));
  }
  const hp={blue:Math.max(0,Number(match.blue_hp)-atk.red),red:Math.max(0,Number(match.red_hp)-atk.blue)};
  const repairs={blue:Number(match.blue_repairs),red:Number(match.red_repairs)};
  for(const side of ['blue','red']){
    const available=Math.max(0,MAX_REPAIR-repairs[side]);
    const used=Math.min(available,n(side,'repair'));
    hp[side]=Math.min(LIMIT_HP,hp[side]+used*140);
    repairs[side]+=used;
  }
  const finished=hp.blue===0||hp.red===0||Number(match.round)>=MAX_ROUNDS;
  const winner=finished&&hp.blue!==hp.red?(hp.blue>hp.red?String(match.blue_clan_id):String(match.red_clan_id)):null;
  const result={
    round:Number(match.round),blueHp:hp.blue,redHp:hp.red,
    blueDamage:atk.blue,redDamage:atk.red,
    blueDefends:n('blue','defend'),redDefends:n('red','defend'),
    blueRepairs:repairs.blue-Number(match.blue_repairs),redRepairs:repairs.red-Number(match.red_repairs),
    blueSpies:n('blue','spy'),redSpies:n('red','spy'),
    blueSubmitted:sides.blue.length,redSubmitted:sides.red.length
  };
  return {hp,repairs,spy:{blue:Number(n('blue','spy')>0),red:Number(n('red','spy')>0)},finished,winner,result};
}
async function advance(conn,match){
  if(!match||match.status!=='active')return match;
  for(let i=0;i<MAX_ROUNDS&&match.status==='active';i++){
    const moves=(await conn.query(
      'SELECT clan_id,action FROM alpha_siege_moves WHERE match_id=$1 AND round=$2',
      [match.id,match.round])).rows;
    if(moves.length<4&&Number(match.round_ends_at)>now())break;
    const r=resolveSiegeRound(match,moves);
    const oldHistory=Array.isArray(match.history)?match.history:JSON.parse(match.history||'[]');
    const history=[...oldHistory,r.result];
    const status=r.finished?'completed':'active';
    const deadline=r.finished?0:(moves.length===4?now()+ROUND_MS:Number(match.round_ends_at)+ROUND_MS);
    const updated=(await conn.query([
      "UPDATE alpha_siege_matches SET status=$2,round=$3,round_ends_at=$4,",
      "blue_hp=$5,red_hp=$6,blue_repairs=$7,red_repairs=$8,",
      "blue_spy=$9,red_spy=$10,winner_clan_id=$11,",
      "history=$12::jsonb,updated_at=$13,ended_at=$14",
      "WHERE id=$1 RETURNING *"
    ].join(' '),[
      match.id,status,r.finished?Number(match.round):Number(match.round)+1,deadline,
      r.hp.blue,r.hp.red,r.repairs.blue,r.repairs.red,
      r.spy.blue,r.spy.red,r.winner,JSON.stringify(history),now(),r.finished?now():null
    ])).rows[0];
    const prize=r.finished&&r.winner?await grantFirstSiegeInsignias(conn,updated):null;
    const winner=r.winner===null?'Empate':r.winner===String(match.blue_clan_id)?'Clã Azul':'Clã Vermelho';
    await notice(conn,match.chat_jid,[
      '🏰 *CERCO AO CASTELO — RODADA '+match.round+'/'+MAX_ROUNDS+'*',
      '🔵 Azul: '+r.hp.blue+'/'+LIMIT_HP+' HP • 🔴 Vermelho: '+r.hp.red+'/'+LIMIT_HP+' HP',
      '⚔️ Dano: azul '+r.result.blueDamage+' • vermelho '+r.result.redDamage,
      '🛡️ Defesas: '+r.result.blueDefends+' / '+r.result.redDefends,
      '🔨 Reparos: '+r.result.blueRepairs+' / '+r.result.redRepairs,
      r.finished?'🏆 *Resultado: '+winner+'*':'⏳ Próxima rodada aberta no Web.',
      prize?'👑 *PREMIAÇÃO HISTÓRICA:* '+prize.name+' entregue aos 2 campeões. Ative em *!reliquias*.':'',
      r.finished&&!r.winner?'🤝 Empate: a insígnia histórica permanece para a próxima guerra com vencedor.':''
    ].join('\n'));
    match=updated;
  }
  return match;
}
export async function settleClanSiege(chat=null){
  if(!ON())return 0;
  await ensureClanSiegeSchema();
  const chats=chat?[chat]:(await db.query(
    "SELECT DISTINCT chat_jid FROM alpha_siege_matches WHERE status IN ('pending','active') LIMIT 50"
  )).rows.map(r=>r.chat_jid);
  let count=0;
  for(const each of chats){
    await tx(async conn=>{
      const m=await openMatch(conn,each,true);
      if(!m)return;
      if(m.status==='pending'&&now()>Number(m.created_at)+30*60*1000){
        await conn.query("UPDATE alpha_siege_matches SET status='cancelled',ended_at=$2,updated_at=$2 WHERE id=$1",[m.id,now()]);
        count++;return;
      }
      if(m.status==='active'){
        const next=await advance(conn,m);
        if(next.status!==m.status||next.round!==m.round)count++;
      }
    });
  }
  return count;
}
async function viewMatch(match,jid){
  if(!match)return null;
  const participants=(await db.query(
    'SELECT jid,clan_id FROM alpha_siege_roster WHERE match_id=$1',[match.id]
  )).rows;
  const mine=participants.find(x=>x.jid===jid);
  const ownAction=match.status==='active'?(await db.query(
    'SELECT action FROM alpha_siege_moves WHERE match_id=$1 AND round=$2 AND jid=$3',
    [match.id,match.round,jid])).rows[0]?.action||null:null;
  const submitted=match.status==='active'?(await db.query(
    'SELECT COUNT(*)::int AS n FROM alpha_siege_moves WHERE match_id=$1 AND round=$2',
    [match.id,match.round])).rows[0]?.n||0:0;
  return {
    id:String(match.id),status:match.status,round:Number(match.round),rounds:MAX_ROUNDS,
    roundEndsAt:Number(match.round_ends_at),
    blueClanId:String(match.blue_clan_id),redClanId:String(match.red_clan_id),
    blueHp:Number(match.blue_hp),redHp:Number(match.red_hp),
    blueRepairs:Number(match.blue_repairs),redRepairs:Number(match.red_repairs),
    mySide:mine?(String(mine.clan_id)===String(match.blue_clan_id)?'blue':'red'):null,
    myMove:ownAction,submitted:Number(submitted),history:match.history,
    winnerClanId:match.winner_clan_id?String(match.winner_clan_id):null,
    createdByMe:match.created_by===jid
  };
}
export async function clanSiegeStatus(session){
  if(!ON()){
    const reason='Partidas reais ainda não foram ativadas no servidor.';
    if(session?.chatJid===siegeGroup()&&/^[0-9-]+@g\.us$/.test(siegeGroup())){
      try{return {enabled:false,reason,preflight:await clanSiegePreflight()};}
      catch(err){console.warn('[Cerco] Preflight indisponível:',String(err?.message||err).slice(0,130));}
    }
    return {enabled:false,reason};
  }
  if(!session?.chatJid)return {enabled:false,reason:'Vincule o Web ao grupo AlphaBot pelo !web.'};
  const chat=group(session);
  await ensureClanSiegeSchema();await settleClanSiege(chat);
  const teams=await eligible(db,chat);
  const mine=(await db.query('SELECT clan_id,role FROM clan_members WHERE jid=$1',[session.jid])).rows[0];
  let match=await openMatch(db,chat);
  if(!match)match=(await db.query("SELECT * FROM alpha_siege_matches WHERE chat_jid=$1 AND status='completed' AND ended_at>$2 ORDER BY id DESC LIMIT 1",[chat,now()-24*60*60*1000])).rows[0]||null;
  const firstReward=(await db.query('SELECT match_id FROM alpha_siege_first_victory WHERE chat_jid=$1',[chat])).rows[0];
  return {
    firstWarPrizeMatchId:firstReward?String(firstReward.match_id):null,
    enabled:true,myClanId:mine?String(mine.clan_id):null,isLeader:mine?.role==='leader',
    clans:teams.map(({id,name,members,linked})=>({id,name,members,linked})),
    match:await viewMatch(match,session.jid)
  };
}
export async function clanSiegeChallenge(session){
  gate();const chat=group(session);await ensureClanSiegeSchema();
  return tx(async conn=>{
    const existing=await openMatch(conn,chat,true);
    if(existing)throw new Error('Já existe uma guerra pendente ou ativa.');
    const teams=await eligible(conn,chat);
    if(!analyzeSiegeEligibility(teams,betaAuthorizedJids()).ready)
      throw new Error('Antes de desafiar: os quatro membros precisam usar !web no AlphaBot e ter autorização no Web beta.');
    const mine=teams.find(x=>x.jids.includes(session.jid));
    const opponent=teams.find(x=>x.id!==mine?.id);
    if(!mine||!opponent)throw new Error('Seu clã não está entre os dois participantes.');
    const member=(await conn.query('SELECT role FROM clan_members WHERE jid=$1 AND clan_id=$2',[session.jid,mine.id])).rows[0];
    if(member?.role!=='leader')throw new Error('Somente o líder pode abrir o desafio.');
    const m=(await conn.query(
      'INSERT INTO alpha_siege_matches(chat_jid,blue_clan_id,red_clan_id,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) RETURNING id',
      [chat,mine.id,opponent.id,session.jid,now()])).rows[0];
    for(const team of teams)for(const jid of team.jids){
      await conn.query('INSERT INTO alpha_siege_roster(match_id,jid,clan_id) VALUES($1,$2,$3)',[m.id,jid,team.id]);
    }
    return {ok:true,status:'pending'};
  });
}
export async function clanSiegeAccept(session){
  gate();const chat=group(session);await ensureClanSiegeSchema();
  return tx(async conn=>{
    const match=await openMatch(conn,chat,true);
    if(!match||match.status!=='pending')throw new Error('Não há desafio pendente.');
    if(now()>Number(match.created_at)+30*60*1000)throw new Error('Desafio expirado.');
    const member=(await conn.query('SELECT clan_id,role FROM clan_members WHERE jid=$1',[session.jid])).rows[0];
    if(member?.role!=='leader'||String(member.clan_id)!==String(match.red_clan_id))
      throw new Error('Somente o líder do clã desafiado pode aceitar.');
    const teams=await eligible(conn,chat);
    const roster=(await conn.query('SELECT jid,clan_id FROM alpha_siege_roster WHERE match_id=$1',[match.id])).rows;
    if(!analyzeSiegeEligibility(teams,betaAuthorizedJids()).ready||roster.length!==4||
       roster.some(r=>!teams.some(t=>t.id===String(r.clan_id)&&t.jids.includes(r.jid))))
      throw new Error('Escalação modificada. Todos devem renovar !web antes de iniciar.');
    await conn.query("UPDATE alpha_siege_matches SET status='active',round_ends_at=$2,updated_at=$3 WHERE id=$1",[match.id,now()+ROUND_MS,now()]);
    await notice(conn,chat,[
      '🏰 *CERCO AO CASTELO INICIADO!*',
      '🔵 Azul × 🔴 Vermelho',
      '⏳ Rodada 1/'+MAX_ROUNDS+' — 5 minutos',
      '🔒 Escolha sua ação secreta na aba Clã do Alpha Web.'
    ].join('\n'));
    return {ok:true,status:'active'};
  });
}
export async function clanSiegeMove(session,action){
  gate();const chat=group(session);await ensureClanSiegeSchema();
  if(!ACTIONS.has(action))throw new Error('Ação de guerra inválida.');
  return tx(async conn=>{
    const match=await openMatch(conn,chat,true);
    if(!match||match.status!=='active')throw new Error('Nenhuma guerra ativa.');
    if(now()>=Number(match.round_ends_at)){
      await advance(conn,match);
      return {ok:false,reason:'Rodada encerrada. Atualize a tela.'};
    }
    const player=(await conn.query('SELECT clan_id FROM alpha_siege_roster WHERE match_id=$1 AND jid=$2',[match.id,session.jid])).rows[0];
    if(!player)throw new Error('Você não pertence a esta guerra.');
    const actual=(await conn.query('SELECT clan_id FROM clan_members WHERE jid=$1',[session.jid])).rows[0];
    if(String(actual?.clan_id)!==String(player.clan_id))throw new Error('Você mudou de clã durante a guerra.');
    if(action==='repair'){
      const side=String(player.clan_id)===String(match.blue_clan_id)?'blue':'red';
      const already=(await conn.query(
        "SELECT COUNT(*)::int AS n FROM alpha_siege_moves WHERE match_id=$1 AND round=$3 AND clan_id=$2 AND action='repair'",
        [match.id,player.clan_id,match.round])).rows[0];
      if(Number(match[side+'_repairs'])+Number(already.n)>=MAX_REPAIR)
        throw new Error('O clã já atingiu o limite de reparos.');
    }
    const inserted=await conn.query(
      'INSERT INTO alpha_siege_moves(match_id,round,jid,clan_id,action,submitted_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(match_id,round,jid) DO NOTHING RETURNING action',
      [match.id,match.round,session.jid,player.clan_id,action,now()]);
    if(!inserted.rowCount)throw new Error('Ação já registrada. Não é possível alterar nesta rodada.');
    await advance(conn,match);
    return {ok:true,registered:true,action};
  });
}
export async function clanSiegeCancel(session){
  gate();const chat=group(session);await ensureClanSiegeSchema();
  return tx(async conn=>{
    const match=await openMatch(conn,chat,true);
    if(!match||match.status!=='pending')throw new Error('Não há desafio pendente.');
    if(match.created_by!==session.jid)throw new Error('Somente o líder que criou pode cancelar.');
    await conn.query("UPDATE alpha_siege_matches SET status='cancelled',updated_at=$2,ended_at=$2 WHERE id=$1",[match.id,now()]);
    return {ok:true,status:'cancelled'};
  });
}
