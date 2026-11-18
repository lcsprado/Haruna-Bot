// C4i — agendador único de eventos V2 usando o MESMO pool PostgreSQL do bot.
// Nenhum cron/sessão/serviço adicional. DESLIGADO por padrão.
// Transações e lock cruzado são responsabilidade do serviço financeiro compartilhado.
import {assertRebootDatabaseTarget,assertRebootWhatsappPermission,classesOnlyRebootEnabled}
 from './reboot-classes-policy.js';
import {bingoV2Status,auctionV2Status,stepBingoV2Draw,closeAuctionV2Lot}
 from './reboot-events-service.js';

const ACTIVE=new WeakMap();
const IDLE_MS=5*60*1000,ACTIVE_MS=25*1000,MIN_MS=1000;
const cleanError=e=>String(e?.message||e).slice(0,160);

export function rebootEventsSchedulerAuthorized(env=process.env){
 if(!classesOnlyRebootEnabled(env)||
    env.ALPHA_REBOOT_EVENTS_SCHEDULER!=='approved-isolated-v2')return false;
 assertRebootDatabaseTarget(env);
 assertRebootWhatsappPermission(env);
 if(env.ALPHA_REBOOT_BINGO_RELEASE!=='approved-isolated-v2'||
    env.ALPHA_REBOOT_AUCTION_RELEASE!=='approved-isolated-v2')
   throw Error('Agendador V2 exige aprovação dos dois eventos');
 return true;
}
function delayUntil(now,time){
 return Number.isSafeInteger(time)&&time>now?
   Math.max(MIN_MS,Math.min(IDLE_MS,time-now)):ACTIVE_MS;
}
export async function tickRebootEventsV2(pool,{env=process.env,now=Date.now()}={}){
 if(!rebootEventsSchedulerAuthorized(env))
   return {enabled:false,queries:0,nextInMs:IDLE_MS,events:[]};
 if(!Number.isSafeInteger(now)||now<=0)throw Error('Horário inválido para agendador');
 const [bingo,auction]=await Promise.all([
  bingoV2Status(pool,null,{env}),auctionV2Status(pool,{env})
 ]);
 const events=[];
 let nextInMs=IDLE_MS;
 if(bingo.available&&['registration','running'].includes(bingo.phase)){
  const due=bingo.phase==='registration'?bingo.startAt:(bingo.nextAt||now);
  if(now>=due){
   const outcome=await stepBingoV2Draw(pool,{env,now});
   events.push({type:'bingo',phase:outcome.phase,
     drawn:outcome.drawn||0,paid:outcome.paid||[]});
   if(outcome.phase==='running')nextInMs=Math.min(nextInMs,ACTIVE_MS);
  }else nextInMs=Math.min(nextInMs,delayUntil(now,due));
 }
 if(auction.available&&auction.phase!=='completed'&&auction.endsAt){
  if(now>=auction.endsAt){
   const outcome=await closeAuctionV2Lot(pool,{env,now});
   events.push({type:'auction',phase:outcome.phase,
     settled:Boolean(outcome.settled),lot:outcome.lot||null});
   if(outcome.phase!=='completed')nextInMs=Math.min(nextInMs,ACTIVE_MS);
  }else nextInMs=Math.min(nextInMs,delayUntil(now,auction.endsAt));
 }
 return {enabled:true,queries:2,nextInMs,events};
}
export function startRebootEventsScheduler(pool,{env=process.env,now=Date.now,
  schedule=setTimeout,cancel=clearTimeout,log=console}={}){
 if(!rebootEventsSchedulerAuthorized(env))return {enabled:false,stop(){}};
 const existing=ACTIVE.get(pool);
 if(existing)return existing;
 let stopped=false,busy=false,timer=null;
 const again=(ms)=>{
  if(stopped)return;
  timer=schedule(()=>void run(),Math.min(IDLE_MS,Math.max(MIN_MS,Number(ms)||IDLE_MS)));
  timer?.unref?.();
 };
 const run=async()=>{
  if(stopped||busy)return;
  busy=true;
  let next=IDLE_MS;
  try{
   const out=await tickRebootEventsV2(pool,{env,now:now()});
   next=out.nextInMs;
   if(out.events.length)log.info?.('[REBOOT V2] transições de eventos',JSON.stringify(out.events));
  }catch(error){
   // Falhar fechado: não assumir fechamento ou pagamento. Reavaliar posteriormente.
   next=60000;
   log.warn?.('[REBOOT V2] tick não processado',cleanError(error));
  }finally{
   busy=false;
   if(!stopped)again(next);
  }
 };
 const handle={enabled:true,stop(){
  stopped=true;
  if(timer!==null)cancel(timer);
  ACTIVE.delete(pool);
 }};
 ACTIVE.set(pool,handle);
 again(MIN_MS);
 return handle;
}
