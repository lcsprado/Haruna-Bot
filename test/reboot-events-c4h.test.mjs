import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rebootEventsSchedulerAuthorized,tickRebootEventsV2,startRebootEventsScheduler}
 from '../src/neon/reboot-events-scheduler.js';
import {bingoV2Status,createBingoV2Edition,buyBingoV2Ticket,stepBingoV2Draw,
 auctionV2Status,createAuctionV2Edition,bidAuctionV2,closeAuctionV2Lot}
 from '../src/neon/reboot-events-service.js';

const T=Date.parse('2026-11-23T19:30:00-03:00');
const bEnv={ALPHA_REBOOT_MODE:'classes_only',ALPHA_REBOOT_DB_CONFIRMED:'isolated-v2',
 DATABASE_URL:'postgres://u:p@localhost/alpha_reboot_test',
 ALPHA_REBOOT_BINGO_RELEASE:'approved-isolated-v2'};
const aEnv={...bEnv,ALPHA_REBOOT_AUCTION_RELEASE:'approved-isolated-v2'};
class FakeDB{
 constructor(){this.settings=new Map();this.wallets=new Map();this.inventory=new Map();
  this.transactions=[];this.locks=0;this.connections=0;this.rollbacks=0;}
 async connect(){
  this.connections++;const db=this;let save=null;
  return {release(){},async query(q,p=[]){
   const sql=String(q);
   if(sql==='BEGIN'){
    save=[structuredClone(db.settings),structuredClone(db.wallets),
      structuredClone(db.inventory),structuredClone(db.transactions)];
    return {rows:[],rowCount:0};
   }
   if(sql==='COMMIT'){save=null;return {rows:[],rowCount:0};}
   if(sql==='ROLLBACK'){
    if(save)[db.settings,db.wallets,db.inventory,db.transactions]=save;
    db.rollbacks++;return {rows:[],rowCount:0};
   }
   if(sql.startsWith('SET LOCAL'))return {rows:[],rowCount:0};
   if(sql.includes('pg_advisory_xact_lock')){db.locks++;return {rows:[],rowCount:1};}
   if(sql.startsWith('SELECT value FROM trevo_settings')){
    const value=db.settings.get(p[0]);
    return {rows:value===undefined?[]:[{value:structuredClone(value)}],
      rowCount:value===undefined?0:1};
   }
   if(sql.startsWith('INSERT INTO trevo_settings')){
    if(sql.includes('DO NOTHING RETURNING key')&&db.settings.has(p[0]))
     return {rows:[],rowCount:0};
    db.settings.set(p[0],JSON.parse(p[1]));
    return {rows:[{key:p[0]}],rowCount:1};
   }
   if(sql.startsWith('UPDATE wallets SET cash=cash-LEAST')){
    const [cost,jid]=p,w=db.wallets.get(jid);
    if(!w||w.cash+w.bank<cost)return {rows:[],rowCount:0};
    const fromCash=Math.min(w.cash,cost);w.cash-=fromCash;w.bank-=cost-fromCash;
    return {rows:[{jid}],rowCount:1};
   }
   if(sql.startsWith('UPDATE wallets SET cash=cash+$1')){
    const [amount,jid]=p,w=db.wallets.get(jid);
    if(!w)return {rows:[],rowCount:0};
    w.cash+=amount;return {rows:[{jid}],rowCount:1};
   }
   if(sql.startsWith('INSERT INTO transactions')){
    db.transactions.push({sql,args:p});return {rows:[],rowCount:1};
   }
   if(sql.startsWith('SELECT id,category FROM items')){
    const id=p[0];
    return {rows:['pocao_g','espada_aco','armadura_aco'].includes(id)?
      [{id,category:id==='pocao_g'?'consumable':'weapon'}]:[],rowCount:1};
   }
   if(sql.startsWith('INSERT INTO inventories')){
    const key=p[0]+':'+p[1];db.inventory.set(key,(db.inventory.get(key)||0)+p[2]);
    return {rows:[],rowCount:1};
   }
   throw Error('SQL não reconhecido: '+sql.slice(0,90));
  }};
 }
 async query(q,p){return (await this.connect()).query(q,p);}
}
test('flags de segurança bloqueiam ações e consultas desautorizadas sem conectar',async()=>{
 const db=new FakeDB();
 assert.equal((await bingoV2Status(db,'u',{env:{}})).available,false);
 assert.equal((await auctionV2Status(db,{env:{}})).available,false);
 assert.equal((await bingoV2Status(db,'u',{env:{...bEnv,ALPHA_REBOOT_BINGO_RELEASE:''}})).requiresApproval,true);
 assert.equal((await auctionV2Status(db,{env:bEnv})).requiresApproval,true);
 await assert.rejects(()=>createBingoV2Edition(db,{id:'bingo_v2_20261123_1930',
  startAt:T,endAt:T+3600000,now:T-60000,
  env:{...bEnv,ALPHA_REBOOT_BINGO_RELEASE:''}}),/bloqueado/);
 await assert.rejects(()=>createAuctionV2Edition(db,{id:'auction_v2_20261123_1930',
  startAt:T,now:T-60000,env:bEnv}),/não autorizado/);
 assert.equal(db.connections,0);
});
test('cartela compra uma única vez mesmo com repetição e estado persistido',async()=>{
 const db=new FakeDB();db.wallets.set('u1',{cash:300,bank:300});
 await createBingoV2Edition(db,{id:'bingo_v2_20261123_1930',
  startAt:T,endAt:T+3600000,now:T-60000,env:bEnv});
 const first=await buyBingoV2Ticket(db,'u1',{now:T-30000,env:bEnv,rng:()=>0});
 assert.equal(first.alreadyOwned,false);
 assert.equal(first.card.length,9);
 assert.equal(new Set(first.card.filter(x=>x!==null)).size,8);
 assert.deepEqual(db.wallets.get('u1'),{cash:0,bank:100});
 const second=await buyBingoV2Ticket(db,'u1',{now:T-20000,env:bEnv});
 assert.equal(second.alreadyOwned,true);assert.deepEqual(second.card,first.card);
 assert.equal(db.transactions.filter(x=>x.sql.includes('bingo_v2_card')).length,1);
 await assert.rejects(()=>buyBingoV2Ticket(db,'u2',{now:T-20000,env:bEnv}),/Saldo insuficiente/);
 assert.equal(Object.keys(db.settings.get('alpha_reboot_v2_bingo_active').players).length,1);
 assert.ok(db.locks>=4);
});
test('sorteio criptográfico persistido credita R$9 mil uma vez, replay não credita',async()=>{
 const db=new FakeDB();db.wallets.set('u1',{cash:1000,bank:0});
 await createBingoV2Edition(db,{id:'bingo_v2_20261123_1930',
  startAt:T,endAt:T+3600000,now:T-60000,env:bEnv});
 await buyBingoV2Ticket(db,'u1',{now:T-30000,env:bEnv,rng:()=>0});
 for(let i=0;i<40;i++){
  const r=await stepBingoV2Draw(db,{now:T+i*25000,env:bEnv,rng:()=>0});
  if(r.phase==='completed')break;
 }
 const payouts=db.transactions.filter(x=>x.sql.includes('bingo_v2_reward'));
 assert.equal(payouts.length,3);
 assert.equal(payouts.reduce((a,x)=>a+x.args[1],0),9000);
 assert.equal(db.wallets.get('u1').cash,9500);
 assert.equal([...db.settings.keys()].filter(x=>x.startsWith('alpha_reboot_v2_bingo_paid:')).length,3);
 await stepBingoV2Draw(db,{now:T+40*25000,env:bEnv});
 assert.equal(db.transactions.filter(x=>x.sql.includes('bingo_v2_reward')).length,3);
});
test('leilão reserva lance, estorna anterior e entrega item normal uma vez',async()=>{
 const db=new FakeDB();db.wallets.set('a',{cash:5000,bank:0});
 db.wallets.set('b',{cash:5000,bank:0});
 await createAuctionV2Edition(db,{id:'auction_v2_20261123_1930',
  startAt:T,now:T-60000,env:aEnv});
 assert.equal((await auctionV2Status(db,{env:aEnv})).nextMinimum,1000);
 await bidAuctionV2(db,'a',1000,{now:T+1000,env:aEnv});
 await bidAuctionV2(db,'b',1500,{now:T+2000,env:aEnv});
 assert.equal(db.wallets.get('a').cash,5000);
 assert.equal(db.wallets.get('b').cash,3500);
 await assert.rejects(()=>bidAuctionV2(db,'a',1550,{now:T+3000,env:aEnv}),/limites/);
 assert.equal((await closeAuctionV2Lot(db,{now:T+302000,env:aEnv})).settled,true);
 assert.equal(db.inventory.get('b:pocao_g'),2);
 assert.equal((await closeAuctionV2Lot(db,{now:T+302000,env:aEnv})).settled,false);
 assert.equal(db.inventory.get('b:pocao_g'),2);
 assert.equal(db.transactions.filter(x=>x.sql.includes('auction_v2_settled')).length,1);
 assert.equal(db.transactions.filter(x=>x.sql.includes('auction_v2_refund')).length,1);
 assert.equal((await auctionV2Status(db,{env:aEnv})).lot.itemId,'espada_aco');
});
test('uma edição semanal é requisito global, mesmo após conclusão',async()=>{
 const db=new FakeDB();
 await createBingoV2Edition(db,{id:'bingo_v2_20261123_1930',
  startAt:T,endAt:T+3600000,now:T-60000,env:bEnv});
 await assert.rejects(()=>createBingoV2Edition(db,{id:'bingo_v2_20261124_1600',
  startAt:T+86400000,endAt:T+90000000,now:T-60000,env:bEnv}),/Já existe/);
 db.settings.get('alpha_reboot_v2_bingo_active').phase='completed';
 await assert.rejects(()=>createBingoV2Edition(db,{id:'bingo_v2_20261124_1600',
  startAt:T+86400000,endAt:T+90000000,now:T-60000,env:bEnv}),/sete dias/);
 assert.equal(db.settings.get('alpha_reboot_v2_bingo_calendar').editions.length,1);
});
test('WA e Web chamam o mesmo serviço, sem agendamento e sem mudar V1',()=>{
 const read=x=>readFileSync(new URL('../src/neon/'+x,import.meta.url),'utf8');
 const wa=read('reboot-events-whatsapp.js'),web=read('web-api.js'),bot=read('index.js');
 const engine=read('reboot-events-service.js');
 for(const cmd of ['bingov2','cartelav2','leilaov2','lancev2'])assert.ok(wa.includes("'"+cmd+"'"));
 assert.match(bot,/handleRebootEventsCommand\(\{cmd,args,sender,chat,reply\}\)/);
 assert.match(web,/\/api\/v1\/me\/bingo-v2/);
 assert.match(web,/\/api\/v1\/me\/auction-v2/);
 assert.match(web,/name==='bingoV2\.buy'/);
 assert.match(web,/name==='auctionV2\.bid'/);
 assert.match(engine,/pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
 assert.match(engine,/ON CONFLICT\(key\) DO NOTHING RETURNING key/);
 assert.doesNotMatch(bot,/startRebootBingoV2Scheduler\(/);
 assert.doesNotMatch(bot,/startRebootAuctionV2Scheduler\(/);
});

// Adversarial, deterministic simulated multi-connection serialisation:
// reproduces the exclusive advisory lock, but NOT a real PostgreSQL server.
function serializeFakeTransactions(pool){
 const original=pool.connect.bind(pool);
 let tail=Promise.resolve();
 pool.connect=async()=>{
   let unlock;
   const current=new Promise(resolve=>unlock=resolve);
   const previous=tail;
   tail=current;
   await previous;
   const c=await original();
   const release=c.release.bind(c);
   c.release=()=>{release();unlock();};
   return c;
 };
}
test('C4i: dois compradores concorrentes do mesmo JID não debitam duas vezes',async()=>{
 const pool=new FakeDB();
 pool.wallets.set('one',{cash:1200,bank:0});
 await createBingoV2Edition(pool,{id:'bingo_v2_20261123_1930',
  startAt:T,endAt:T+3600000,now:T-60000,env:bEnv});
 serializeFakeTransactions(pool);
 const [a,b]=await Promise.all([
  buyBingoV2Ticket(pool,'one',{now:T-30000,env:bEnv,rng:()=>0}),
  buyBingoV2Ticket(pool,'one',{now:T-30000,env:bEnv,rng:()=>0})
 ]);
 assert.deepEqual([a.alreadyOwned,b.alreadyOwned],[false,true]);
 assert.equal(pool.wallets.get('one').cash,700);
 assert.equal(pool.transactions.filter(row=>row.sql.includes('bingo_v2_card')).length,1);
});
test('C4i: dois workers concorrentes pagam somente o marco aplicável',async()=>{
 const pool=new FakeDB();
 pool.wallets.set('one',{cash:1000,bank:0});
 await createBingoV2Edition(pool,{id:'bingo_v2_20261123_1930',
  startAt:T,endAt:T+3600000,now:T-60000,env:bEnv});
 await buyBingoV2Ticket(pool,'one',{now:T-30000,env:bEnv,rng:()=>0});
 serializeFakeTransactions(pool);
 const [a,b]=await Promise.all([
  stepBingoV2Draw(pool,{now:T,env:bEnv,rng:()=>0}),
  stepBingoV2Draw(pool,{now:T,env:bEnv,rng:()=>0})
 ]);
 assert.equal([a,b].filter(x=>Number.isInteger(x.number)).length,1);
 assert.equal(pool.settings.get('alpha_reboot_v2_bingo_active').drawn.length,1);
 assert.equal(pool.transactions.filter(x=>x.sql.includes('bingo_v2_reward')).length,0);
});
test('C4i: lances concorrentes e dois fechamentos não duplicam prêmio ou débito',async()=>{
 const pool=new FakeDB();pool.wallets.set('a',{cash:5000,bank:0});
 pool.wallets.set('b',{cash:5000,bank:0});
 await createAuctionV2Edition(pool,{id:'auction_v2_20261123_1930',
  startAt:T,now:T-60000,env:aEnv});
 serializeFakeTransactions(pool);
 const bids=await Promise.allSettled([
  bidAuctionV2(pool,'a',1000,{now:T+1000,env:aEnv}),
  bidAuctionV2(pool,'b',1000,{now:T+1000,env:aEnv})
 ]);
 assert.deepEqual(bids.map(x=>x.status),['fulfilled','rejected']);
 assert.equal(pool.wallets.get('a').cash,4000);
 assert.equal(pool.wallets.get('b').cash,5000);
 const closed=await Promise.all([
  closeAuctionV2Lot(pool,{now:T+310000,env:aEnv}),
  closeAuctionV2Lot(pool,{now:T+310000,env:aEnv})
 ]);
 assert.equal(closed.filter(x=>x.settled).length,1);
 assert.equal(pool.inventory.get('a:pocao_g'),2);
 assert.equal(pool.transactions.filter(x=>x.sql.includes('auction_v2_settled')).length,1);
});
test('C4i: agendador não abre conexão nem cria timer sem aprovação conjunta e cutover',async()=>{
 const pool=new FakeDB();
 assert.equal(rebootEventsSchedulerAuthorized({}),false);
 const never=startRebootEventsScheduler(pool,{env:{},
  schedule:()=>{throw Error('Timer proibido');}});
 assert.equal(never.enabled,false);
 assert.equal((await tickRebootEventsV2(pool,{env:{}})).queries,0);
 assert.equal(pool.connections,0);
 assert.throws(()=>startRebootEventsScheduler(pool,{env:{...aEnv,
  ALPHA_REBOOT_EVENTS_SCHEDULER:'approved-isolated-v2'}}),/WhatsApp real proibido/);
 assert.equal(pool.connections,0);
});
test('C4i: tick revisa estado com duas consultas somente após autorização; um timer por pool',async()=>{
 const pool=new FakeDB();
 const env={...aEnv,ALPHA_REBOOT_EVENTS_SCHEDULER:'approved-isolated-v2',
  ALPHA_REBOOT_ALLOW_WHATSAPP:'cutover-approved'};
 const result=await tickRebootEventsV2(pool,{env,now:T-60000});
 assert.equal(result.enabled,true);
 assert.equal(result.queries,2);
 assert.equal(result.nextInMs,5*60*1000);
 assert.equal(pool.connections,2);
 const scheduled=[];
 const h=startRebootEventsScheduler(pool,{env,now:()=>T,
  schedule:(fn,ms)=>{scheduled.push({fn,ms});return {unref(){}};},
  cancel:()=>{}});
 assert.equal(h.enabled,true);
 assert.equal(scheduled.length,1);
 assert.equal(startRebootEventsScheduler(pool,{env}).enabled,true);
 assert.equal(scheduled.length,1);
 h.stop();
});
test('C4i: cliente Web V2 tem cards e botoes, e a tela V1 ainda existe',()=>{
 const ui=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 const service=readFileSync(new URL('../src/neon/reboot-events-service.js',import.meta.url),'utf8');
 const idx=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
 assert.match(ui,/function renderBingoV2Card\(\)/);
 assert.match(ui,/function renderAuctionV2\(\)/);
 assert.match(ui,/data-bingo-v2-buy/);
 assert.match(ui,/\/api\/v1\/action\/bingoV2\.buy/);
 assert.match(ui,/\/api\/v1\/action\/auctionV2\.bid/);
 assert.match(ui,/if\(ui\.auction\?\.enabled\|\|ui\.auction\?\.requiresApproval\)return renderAuctionV2/);
 assert.match(ui,/function renderAuction\(\)/);
 assert.match(service,/acceptingBids:\['pending','active'\]/);
 assert.match(idx,/startRebootEventsScheduler\(db\)/);
 assert.doesNotMatch(idx,/createBingoV2Edition\(/);
 assert.doesNotMatch(idx,/createAuctionV2Edition\(/);
});
