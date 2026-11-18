// C4h: execução transacional exclusiva da temporada V2.
// Modo V1 retorna indisponível. Não há cron, criação automática nem migração.
import {randomInt} from 'node:crypto';
import {assertRebootDatabaseTarget,classesOnlyRebootEnabled} from './reboot-classes-policy.js';
import {V2_BINGO,assertBingoV2Release,validateBingoV2Edition,
  bingoV2TicketEligibility,planBingoV2Payouts} from './reboot-bingo-policy.js';
import {V2_AUCTION,firstAuctionV2Catalog,assertV2AuctionReward} from './reboot-auction-policy.js';

const BINGO_KEY='alpha_reboot_v2_bingo_active';
const BINGO_CALENDAR='alpha_reboot_v2_bingo_calendar';
const AUCTION_KEY='alpha_reboot_v2_auction_active';
const AUCTION_CALENDAR='alpha_reboot_v2_auction_calendar';
const GLOBAL_LOCK='alpha_reboot_v2_event_finance';
const WEEK=7*86400000;
const LOT_DURATION=5*60000;
const fm=x=>'R$ '+Number(x).toLocaleString('pt-BR');
const keyOk=x=>/^[a-z0-9_]{3,100}$/.test(String(x||''));
const edDate=ms=>new Date(ms).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
function check(env,type){
  if(!classesOnlyRebootEnabled(env))throw Error('Eventos V2 indisponíveis na temporada antiga');
  assertRebootDatabaseTarget(env);
  if(type==='bingo')assertBingoV2Release(env);
  if(type==='auction'&&env.ALPHA_REBOOT_AUCTION_RELEASE!=='approved-isolated-v2')
    throw Error('Leilão V2 não autorizado para o banco isolado');
}
function enabled(env,type){
  if(!classesOnlyRebootEnabled(env))return false;
  check(env,type);
  return true;
}
async function readSetting(q,key,locked=false){
  const sql='SELECT value FROM trevo_settings WHERE key=$1'+(locked?' FOR UPDATE':'');
  return (await q.query(sql,[key])).rows[0]?.value||null;
}
async function writeSetting(c,key,value){
  await c.query(
    'INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',
    [key,JSON.stringify(value)]
  );
}
async function financeTx(pool,env,type,fn){
  check(env,type);
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query("SET LOCAL statement_timeout='12000ms'");
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[GLOBAL_LOCK]);
    const out=await fn(c);
    await c.query('COMMIT');
    return out;
  }catch(e){
    await c.query('ROLLBACK').catch(()=>{});
    throw e;
  }finally{c.release();}
}
function validateTime(now){
  if(!Number.isSafeInteger(now)||now<1)throw Error('Horário inválido');
}
function selectCard(rng=randomInt){
  const pool=Array.from({length:40},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){
    const j=rng(i+1);
    if(!Number.isSafeInteger(j)||j<0||j>i)throw Error('Sorteio inválido');
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  return [...pool.slice(0,4),null,...pool.slice(4,8)];
}
function bingoPublic(state,jid){
  if(!state)return {enabled:true,available:false,stage:'not_scheduled'};
  const mine=state.players?.[jid]||null;
  return {enabled:true,available:true,id:state.id,phase:state.phase,
    startAt:state.startAt,endAt:state.endAt,drawn:[...(state.drawn||[])],
    nextAt:state.nextAt||null,card:mine?[...mine.card]:null,
    prizes:Object.fromEntries(Object.entries(state.prizes||{}).map(([k,v])=>[k,{amount:v.amount}])),
    playerCount:Object.keys(state.players||{}).length,price:V2_BINGO.ticket,
    remainingBudget:V2_BINGO.maxEmission-Object.values(state.prizes||{}).reduce((a,p)=>a+p.amount,0)};
}
export async function bingoV2Status(pool,jid,{env=process.env}={}){
  if(!classesOnlyRebootEnabled(env))return {enabled:false,available:false};
  if(env.ALPHA_REBOOT_BINGO_RELEASE!=='approved-isolated-v2')
    return {enabled:false,available:false,requiresApproval:true};
  check(env,'bingo');
  const s=await readSetting(pool,BINGO_KEY);
  return bingoPublic(s,jid);
}
export async function createBingoV2Edition(pool,{id,startAt,endAt,now=Date.now(),
  env=process.env}={}){
  validateTime(now);
  return financeTx(pool,env,'bingo',async c=>{
    const prior=await readSetting(c,BINGO_KEY,true);
    if(prior&&['registration','running'].includes(prior.phase))
      throw Error('Já existe uma edição do Bingo V2 em andamento');
    const calendar=await readSetting(c,BINGO_CALENDAR,true)||{editions:[]};
    if(!Array.isArray(calendar.editions))throw Error('Calendário do Bingo corrompido');
    validateBingoV2Edition({id,startAt,endAt,now,
      otherStarts:calendar.editions.map(e=>e.startAt)});
    if(calendar.editions.some(e=>e.id===id))throw Error('Identificador de edição já utilizado');
    const next={id,startAt,endAt,phase:'registration',players:{},drawn:[],
      queue:[],prizes:{},nextAt:null,createdAt:now};
    calendar.editions=[...calendar.editions,{id,startAt}].slice(-24);
    await writeSetting(c,BINGO_CALENDAR,calendar);
    await writeSetting(c,BINGO_KEY,next);
    return {id,created:true};
  });
}
export async function buyBingoV2Ticket(pool,jid,{now=Date.now(),env=process.env,rng=randomInt}={}){
  validateTime(now);
  if(typeof jid!=='string'||!jid)throw Error('Jogador inválido');
  return financeTx(pool,env,'bingo',async c=>{
    const state=await readSetting(c,BINGO_KEY,true);
    if(!state)throw Error('Nenhum Bingo V2 agendado');
    if(state.players?.[jid])return {alreadyOwned:true,...bingoPublic(state,jid)};
    bingoV2TicketEligibility({jid,entries:Object.keys(state.players||{}),
      started:state.phase!=='registration'||now>=state.startAt||now>state.endAt});
    const payment=await c.query(
      'UPDATE wallets SET cash=cash-LEAST(cash,$1::bigint),bank=bank-GREATEST(0,$1::bigint-cash),updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2 AND cash>=0 AND bank>=0 AND cash+bank>=$1 RETURNING jid',
      [V2_BINGO.ticket,jid]
    );
    if(payment.rowCount!==1)throw Error('Saldo insuficiente para a cartela V2');
    await c.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'bingo_v2_card',$3)",
      [jid,V2_BINGO.ticket,state.id+':entry:'+jid]
    );
    state.players=state.players||{};
    state.players[jid]={card:selectCard(rng),at:now};
    await writeSetting(c,BINGO_KEY,state);
    return {alreadyOwned:false,...bingoPublic(state,jid)};
  });
}
function marked(card,drawn){
  const done=new Set(drawn);
  return card.map(n=>n==null||done.has(n));
}
function rowsDone(card,drawn){
  const done=marked(card,drawn);
  return [[0,1,2],[3,4,5],[6,7,8]].filter(indices=>indices.every(i=>done[i])).length;
}
export async function stepBingoV2Draw(pool,{now=Date.now(),env=process.env,rng=randomInt}={}){
  validateTime(now);
  return financeTx(pool,env,'bingo',async c=>{
    const state=await readSetting(c,BINGO_KEY,true);
    if(!state)throw Error('Não existe edição V2');
    if(state.phase==='completed'||state.phase==='cancelled')
      return {phase:state.phase,drawn:state.drawn.length,paid:[]};
    if(now>=state.endAt){state.phase='completed';await writeSetting(c,BINGO_KEY,state);
      return {phase:'completed',reason:'deadline',paid:[]};}
    if(now<state.startAt)return {phase:'registration',paid:[]};
    if(state.phase==='registration'){
      if(!Object.keys(state.players||{}).length){
        state.phase='cancelled';await writeSetting(c,BINGO_KEY,state);
        return {phase:'cancelled',paid:[]};
      }
      state.queue=selectCardSequence(rng);
      state.phase='running';state.nextAt=now;
    }
    if(state.phase!=='running')throw Error('Estado de Bingo inválido');
    if(now<state.nextAt)return {phase:'running',dueAt:state.nextAt,paid:[]};
    if(!state.queue?.length)throw Error('Fila de números indisponível');
    const number=state.queue.shift();
    if(!Number.isInteger(number)||state.drawn.includes(number))throw Error('Fila de sorteio inválida');
    state.drawn.push(number);state.nextAt=now+25000;
    const paid=[];
    for(const [milestone,rule] of Object.entries(V2_BINGO.milestones)){
      if(state.prizes[milestone])continue;
      const qualified=Object.entries(state.players).filter(([,p])=>
        milestone==='full'?marked(p.card,state.drawn).every(Boolean):
          rowsDone(p.card,state.drawn)>=rule.target);
      if(!qualified.length)continue;
      const chosen=qualified[rng(qualified.length)];
      if(!chosen)throw Error('Sorteio do vencedor inválido');
      const [winner]=chosen;
      const planned=planBingoV2Payouts({editionId:state.id,
        winners:[{jid:winner,milestone}],
        settled:Object.fromEntries(Object.entries(state.prizes).map(([k,v])=>[k,v.jid]))});
      const payment=planned.payments[0];
      if(!payment)throw Error('Premiação inconsistente');
      // Identificador no mesmo commit dos créditos + estado; constraint PRIMARY KEY.
      const ledger='alpha_reboot_v2_bingo_paid:'+payment.key;
      const unique=await c.query(
        'INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO NOTHING RETURNING key',
        [ledger,JSON.stringify({jid:winner,amount:payment.amount})]
      );
      if(unique.rowCount!==1)throw Error('Prêmio V2 previamente liquidado com estado inconsistente');
      const credit=await c.query(
        'UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2 RETURNING jid',
        [payment.amount,winner]
      );
      if(credit.rowCount!==1)throw Error('Vencedor sem carteira');
      await c.query(
        "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'bingo_v2_reward',$3)",
        [winner,payment.amount,payment.key]
      );
      state.prizes[milestone]={jid:winner,amount:payment.amount,at:now};
      paid.push({milestone,amount:payment.amount});
    }
    if(state.prizes.full||!state.queue.length)state.phase='completed';
    if(Object.values(state.prizes).reduce((s,p)=>s+p.amount,0)>V2_BINGO.maxEmission)
      throw Error('Bingo V2 excedeu orçamento');
    await writeSetting(c,BINGO_KEY,state);
    return {phase:state.phase,number,drawn:state.drawn.length,paid};
  });
}
function selectCardSequence(rng){
  const queue=Array.from({length:40},(_,i)=>i+1);
  for(let i=39;i>0;i--){
    const j=rng(i+1);
    if(!Number.isSafeInteger(j)||j<0||j>i)throw Error('Aleatoriedade inválida');
    [queue[i],queue[j]]=[queue[j],queue[i]];
  }
  return queue;
}
export async function auctionV2Status(pool,{env=process.env}={}){
  if(!classesOnlyRebootEnabled(env))return {enabled:false,available:false};
  if(env.ALPHA_REBOOT_AUCTION_RELEASE!=='approved-isolated-v2')
    return {enabled:false,available:false,requiresApproval:true};
  check(env,'auction');
  const s=await readSetting(pool,AUCTION_KEY);
  if(!s)return {enabled:true,available:false};
  const lot=firstAuctionV2Catalog()[s.lotIndex]||null;
  return {enabled:true,available:true,id:s.id,phase:s.phase,lotIndex:s.lotIndex,
    lot,startsAt:s.startAt,endsAt:s.endsAt||null,serverTime:Date.now(),step:500,
    acceptingBids:['pending','active'].includes(s.phase)&&Date.now()>=s.startAt&&Date.now()<s.endsAt,
    bid:s.high?.amount||null,
    nextMinimum:s.high?s.high.amount+500:lot?.opening||null,
    history:(s.history||[]).map(h=>({lot:h.lot,amount:h.amount||null}))};
}
export async function createAuctionV2Edition(pool,{id,startAt,now=Date.now(),env=process.env}={}){
  validateTime(now);
  if(!/^auction_v2_\d{8}_\d{4}$/.test(String(id||''))||
    !Number.isSafeInteger(startAt)||startAt<=now)throw Error('Edição de leilão inválida');
  return financeTx(pool,env,'auction',async c=>{
    const prev=await readSetting(c,AUCTION_KEY,true);
    if(prev&&prev.phase==='active')throw Error('Leilão V2 já ativo');
    const calendar=await readSetting(c,AUCTION_CALENDAR,true)||{editions:[]};
    if(!Array.isArray(calendar.editions)||calendar.editions.some(e=>e.id===id||
      Math.abs(e.startAt-startAt)<WEEK))throw Error('Limite de um leilão V2 por semana');
    firstAuctionV2Catalog();
    const next={id,startAt,lotIndex:0,endsAt:startAt+LOT_DURATION,high:null,
      phase:'pending',history:[]};
    calendar.editions=[...calendar.editions,{id,startAt}].slice(-24);
    await writeSetting(c,AUCTION_CALENDAR,calendar);
    await writeSetting(c,AUCTION_KEY,next);
    return {id,created:true};
  });
}
export async function bidAuctionV2(pool,jid,amount,{now=Date.now(),env=process.env}={}){
  validateTime(now);
  if(typeof jid!=='string'||!jid||!Number.isSafeInteger(amount))throw Error('Lance inválido');
  return financeTx(pool,env,'auction',async c=>{
    const s=await readSetting(c,AUCTION_KEY,true);
    if(!s)throw Error('Não há leilão V2 agendado');
    if(now<s.startAt||s.phase==='completed'||now>=s.endsAt)
      throw Error('Leilão V2 não aceita lances neste momento');
    const lot=firstAuctionV2Catalog()[s.lotIndex];
    if(!lot)throw Error('Lote do leilão indisponível');
    assertV2AuctionReward(lot);
    const minimum=s.high?s.high.amount+500:lot.opening;
    if(amount<minimum||amount>25_000)throw Error('Lance fora dos limites V2');
    const previous=s.high;
    if(previous){
      const refund=await c.query(
        'UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2 RETURNING jid',
        [previous.amount,previous.jid]);
      if(refund.rowCount!==1)throw Error('Não foi possível restituir o lance anterior');
      await c.query(
        "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'auction_v2_refund',$3)",
        [previous.jid,previous.amount,s.id+':lot:'+s.lotIndex]);
    }
    const debit=await c.query(
      'UPDATE wallets SET cash=cash-LEAST(cash,$1::bigint),bank=bank-GREATEST(0,$1::bigint-cash),updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2 AND cash>=0 AND bank>=0 AND cash+bank>=$1 RETURNING jid',
      [amount,jid]);
    if(debit.rowCount!==1)throw Error('Saldo insuficiente para o lance V2');
    await c.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'auction_v2_bid',$3)",
      [jid,amount,s.id+':lot:'+s.lotIndex]);
    s.high={jid,amount};
    s.phase='active';
    if(s.endsAt-now<=30000)s.endsAt+=30000;
    await writeSetting(c,AUCTION_KEY,s);
    return {accepted:true,amount,lotId:lot.id,endsAt:s.endsAt};
  });
}
export async function closeAuctionV2Lot(pool,{now=Date.now(),env=process.env}={}){
  validateTime(now);
  return financeTx(pool,env,'auction',async c=>{
    const s=await readSetting(c,AUCTION_KEY,true);
    if(!s)throw Error('Leilão V2 não existe');
    if(s.phase==='completed')return {phase:'completed',settled:false};
    if(now<s.endsAt)return {phase:s.phase,settled:false};
    const lot=firstAuctionV2Catalog()[s.lotIndex];
    if(!lot)throw Error('Lote do leilão inválido');
    assertV2AuctionReward(lot);
    const winning=s.high;
    if(winning){
      const exists=(await c.query('SELECT id,category FROM items WHERE id=$1',[lot.itemId])).rows[0];
      if(!exists)throw Error('Item de leilão inexistente');
      await c.query(
        'INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',
        [winning.jid,lot.itemId,lot.qty]);
      // Item ★1 Lv1, deliberadamente sem equipment_star_forges/upgrades.
      await c.query(
        "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'auction_v2_settled',$3)",
        [winning.jid,winning.amount,s.id+':lot:'+s.lotIndex]);
    }
    s.history.push({lot:lot.id,amount:winning?.amount||0});
    s.lotIndex++;
    s.high=null;
    if(s.lotIndex>=V2_AUCTION.lots.length){s.phase='completed';s.endsAt=null;}
    else{s.phase='pending';s.endsAt=now+LOT_DURATION;s.startAt=now;}
    await writeSetting(c,AUCTION_KEY,s);
    return {phase:s.phase,settled:true,lot:lot.id,amount:winning?.amount||0};
  });
}
