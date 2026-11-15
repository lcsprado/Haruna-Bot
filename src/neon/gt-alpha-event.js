// GT Alpha Bot: somente o carro equipado às 20h30 entra nas três provas automáticas.
import {db} from './db.js'
import {racingDriverLevel,racingTuning,racingModel,RACING_MIN_CONDITION} from './racing-rules.js'
import {
 GT_GROUP,GT_MIN_DRIVERS,GT_DAILY_WEAR,GT_WEEKLY_PRIZES,
 gtBrazilDay,gtWeekStart,gtWeekEnd,gtDayStartMs,gtDayIsSunday,
 gtRunHeats,gtCleanName,gtFormatCash,gtLeaderboard
} from './gt-alpha-rules.js'

const FIRST_DAY='2026-11-15',DAY_PREFIX='gt_alpha_day:',WEEK_PREFIX='gt_alpha_week:'
let socket=null,connected=()=>true,timer=null,busy=false
const dayKey=day=>DAY_PREFIX+day
const weekKey=week=>WEEK_PREFIX+week
const nowSec=()=>Math.floor(Date.now()/1000)
const money=gtFormatCash
function addNotice(s,id,text){
 s.noticeQueue=s.noticeQueue||[]
 if(!s.noticeQueue.some(n=>n.id===id))s.noticeQueue.push({id,text,createdAt:Date.now(),deliveredAt:0})
}
async function mutate(key,fn){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key])
  const found=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value
  const s=found||{}
  const result=await fn(s,c)
  await c.query("INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",[key,JSON.stringify(s)])
  await c.query('COMMIT')
  return result
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
async function read(key){return (await db.query('SELECT value FROM trevo_settings WHERE key=$1',[key])).rows[0]?.value||null}
async function eligible(c){
 await c.query("UPDATE racing_cars_alpha SET upgrades=jsonb_set(upgrades,ARRAY[pending_part],to_jsonb(pending_level),TRUE), pending_part=NULL,pending_level=NULL,pending_until=0 WHERE equipped=TRUE AND pending_part IS NOT NULL AND pending_until>0 AND pending_until<=$1",[nowSec()])
 const rows=(await c.query("SELECT c.id AS car_id,c.jid,c.model_id,c.condition,c.upgrades,c.pending_part,p.xp,u.push_name FROM racing_cars_alpha c JOIN racing_profiles_alpha p ON p.jid=c.jid JOIN users u ON u.jid=c.jid WHERE c.equipped=TRUE ORDER BY c.jid FOR UPDATE OF c")).rows
 return rows.filter(r=>!r.pending_part&&Number(r.condition)>=RACING_MIN_CONDITION)
  .map(r=>({jid:r.jid,carId:Number(r.car_id),modelId:r.model_id,name:gtCleanName(r.push_name),condition:Number(r.condition),upgrades:r.upgrades||{},driverLevel:racingDriverLevel(r.xp)}))
}
function rankText(rows,title){
 return title+'\n\n'+(rows.length?rows.map((r,i)=>(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.')+' *'+gtCleanName(r.name)+'* — *'+r.points+' pts* • '+r.wins+' vitória(s)').join('\n'):'Nenhum resultado registrado.')
}
function parcial(s){
 const table=new Map()
 for(const heat of (s?.results?.heats||[]).slice(0,Number(s.stage||0)))for(const p of heat.positions){
  const row=table.get(p.jid)||{jid:p.jid,name:p.name,points:0,wins:0,performance:0}
  row.points+=p.points;row.wins+=p.place===1?1:0;row.performance+=p.score
  table.set(p.jid,row)
 }
 return gtLeaderboard([...table.values()])
}
function heatText(heat,n,s){
 return '🏁 *GT ALPHA BOT — '+n+'ª PROVA*\n'+heat.name+'\n\n'+
  heat.positions.map(p=>(p.place===1?'🥇':p.place===2?'🥈':p.place===3?'🥉':p.place+'.')+
   ' '+gtCleanName(p.name)+' — '+p.score.toFixed(2)+' desempenho • +'+p.points+' pts').join('\n')+
  '\n\n'+rankText(parcial(s),'📊 *CLASSIFICAÇÃO PARCIAL*')
}
async function runDay(day){
 const start=gtDayStartMs(day)
 if(Date.now()<start)return
 await mutate(dayKey(day),async(s,c)=>{
  if(['completed','cancelled'].includes(s.phase))return
  if(!s.phase){
   const participants=await eligible(c)
   s.day=day;s.startedAt=Date.now()
   s.participants=participants.map(p=>({jid:p.jid,name:p.name,carId:p.carId,modelId:p.modelId}))
   if(participants.length<GT_MIN_DRIVERS){
    s.phase='cancelled'
    addNotice(s,'cancel','🏁 *GT ALPHA BOT — ETAPA NÃO DISPUTADA*\n\nMenos de dois carros equipados e aptos às 20h30. Nenhum ponto distribuído.')
    return
   }
   s.results=gtRunHeats(participants)
   s.stage=0;s.phase='running';s.nextAt=start+30000
   addNotice(s,'start','🏎️ *GT ALPHA BOT — LARGADA!*\n\n👨‍✈️ '+participants.length+
    ' pilotos inscritos automaticamente com seus carros principais às *20h30*.\n'+
    '🛣️ Reta Alpha → Circuito Urbano → Serra Fantasma.\n'+
    '⚙️ Melhorias e condições registradas na largada.\n'+
    '🤖 Corridas automáticas. Consulte *!gttabela*.')
  }
  if(s.phase!=='running')return
  while(s.stage<3&&Date.now()>=Number(s.nextAt)){
   const heat=s.results.heats[s.stage];s.stage++;s.nextAt+=3*60000
   addNotice(s,'heat:'+s.stage,heatText(heat,s.stage,s))
  }
  if(s.stage===3){
   // Desgaste da sessão aplicado uma única vez na transação do encerramento.
   for(const p of s.participants){
    const won=s.results.heats.filter(h=>h.positions[0]?.jid===p.jid).length
    const r=await c.query('UPDATE racing_cars_alpha SET condition=GREATEST(0,condition-$1),races=races+3,wins=wins+$2 WHERE id=$3 AND jid=$4',[GT_DAILY_WEAR*3,won,p.carId,p.jid])
    if(r.rowCount!==1)throw Error('Carro não encontrado na finalização do GT')
   }
   s.phase='completed';s.completedAt=Date.now()
   addNotice(s,'final',rankText(s.results.standings,'🏆 *GT ALPHA BOT — CLASSIFICAÇÃO DO DIA*')+
    '\n\n📌 Pontuação somada ao ranking semanal.\n🔧 Desgaste nos carros: -'+(GT_DAILY_WEAR*3)+' de condição.')
  }
 })
}
async function completedDays(week,c=db){
 const r=(await c.query('SELECT key,value FROM trevo_settings WHERE key BETWEEN $1 AND $2 ORDER BY key',[dayKey(week),dayKey(gtWeekEnd(week))])).rows
 return r.filter(x=>x.value?.phase==='completed').map(x=>x.value)
}
function sumWeek(days){
 const m=new Map()
 for(const d of days)for(const p of d.results?.standings||[]){
  const row=m.get(p.jid)||{jid:p.jid,name:p.name,points:0,wins:0,performance:0,days:0}
  row.name=p.name;row.points+=p.points;row.wins+=p.wins;row.performance+=p.performance;row.days++
  m.set(p.jid,row)
 }
 return gtLeaderboard([...m.values()])
}
async function settleWeek(sunday){
 if(!gtDayIsSunday(sunday))return
 const last=await read(dayKey(sunday))
 if(!last||!['completed','cancelled'].includes(last.phase))return
 const week=gtWeekStart(sunday)
 await mutate(weekKey(week),async(s,c)=>{
  if(s.phase==='completed')return
  const table=sumWeek(await completedDays(week,c)),paid=[]
  if(table.length>=GT_MIN_DRIVERS)for(const [i,p] of table.slice(0,4).entries()){
   const amount=GT_WEEKLY_PRIZES[i]
   const r=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=$2 WHERE jid=$3',[amount,nowSec(),p.jid])
   if(r.rowCount!==1)throw Error('Carteira não encontrada para premiação GT')
   await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'gt_alpha_weekly',$3)",[p.jid,amount,weekKey(week)+':place:'+String(i+1)])
   paid.push({jid:p.jid,name:p.name,amount})
  }
  s.phase='completed';s.week=week;s.closedAt=Date.now();s.standings=table;s.payouts=paid
  addNotice(s,'weekly-result',paid.length?
   '🏆 *GT ALPHA BOT — RESULTADO SEMANAL*\n\n'+paid.map((p,i)=>
    (i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅')+' '+gtCleanName(p.name)+' — *'+money(p.amount)+'*').join('\n')+
    '\n\n💰 Premiações depositadas nas carteiras.\n📊 *!gttabela semana*':
   '🏁 *GT ALPHA BOT — SEMANA ENCERRADA*\nSem dois pilotos com corrida válida. Nenhum prêmio creditado.')
 })
}
async function flush(key){
 if(!connected()||!socket?.sendMessage)return
 const s=await read(key)
 for(const n of (s?.noticeQueue||[]).filter(x=>!x.deliveredAt).slice(0,5)){
  let timeout
  try{
   const msg=await Promise.race([
    socket.sendMessage(GT_GROUP,{text:n.text}),
    new Promise((_,rej)=>{timeout=setTimeout(()=>rej(Error('timeout de envio')),8000);timeout.unref?.()})
   ])
   if(!msg?.key?.id)throw Error('WhatsApp sem confirmação de mensagem')
   await mutate(key,state=>{
    const found=state.noticeQueue?.find(x=>x.id===n.id)
    if(found&&!found.deliveredAt){found.deliveredAt=Date.now();found.messageId=msg.key.id}
   })
  }catch(e){console.warn('[GT] aviso pendente',n.id,e?.message||e);break}
  finally{if(timeout)clearTimeout(timeout)}
 }
}
async function tick(){
 if(busy)return
 busy=true
 try{
  const day=gtBrazilDay()
  if(day<FIRST_DAY)return
  if(Date.now()>=gtDayStartMs(day))await runDay(day)
  await flush(dayKey(day))
  if(gtDayIsSunday(day)&&Date.now()>=gtDayStartMs(day)){
   await settleWeek(day);await flush(weekKey(gtWeekStart(day)))
  }
  // Recupera aviso ou liquidação dominical quando o bot reiniciar na segunda.
  const prev=new Date(day+'T12:00:00Z');prev.setUTCDate(prev.getUTCDate()-1)
  const yesterday=prev.toISOString().slice(0,10)
  if(gtDayIsSunday(yesterday)){await settleWeek(yesterday);await flush(weekKey(gtWeekStart(yesterday)))}
 }catch(e){console.error('[GT] erro no evento',e?.stack||e)}
 finally{busy=false}
}
export function startGtAlphaScheduler(sock,{isConnected=()=>true}={}){
 socket=sock;connected=isConnected
 if(timer)return
 timer=setInterval(()=>void tick(),5000);timer.unref?.();void tick()
}
export async function getGtAlphaTable(scope='dia',now=Date.now()){
 const day=gtBrazilDay(now)
 if(scope==='semana'){
  const week=gtWeekStart(day),closed=await read(weekKey(week))
  const table=closed?.standings||sumWeek(await completedDays(week))
  return rankText(table,'🏆 *GT ALPHA BOT — RANKING SEMANAL*')+
   '\n📅 '+week+' a '+gtWeekEnd(week)+(closed?.phase==='completed'?'\n✅ Semana encerrada.':'\n⏰ Próxima etapa: 20h30.')
 }
 const s=await read(dayKey(day))
 const table=s?.phase==='completed'?s.results?.standings||[]:parcial(s)
 return rankText(table,'🏎️ *GT ALPHA BOT — RANKING DIÁRIO*')+
  (s?.phase==='running'?'\n🏁 Corridas: '+s.stage+'/3':
   s?.phase==='completed'?'\n✅ Etapa encerrada.':
   s?.phase==='cancelled'?'\n⚠️ Etapa sem participantes suficientes.':
   '\n⏰ Largada às 20h30 (Brasília).')
}
export async function getGtAlphaCar(jid){
 const r=(await db.query('SELECT c.id,c.model_id,c.condition,c.upgrades,c.pending_part,c.pending_until,p.xp FROM racing_cars_alpha c JOIN racing_profiles_alpha p ON p.jid=c.jid WHERE c.jid=$1 AND c.equipped=TRUE LIMIT 1',[jid])).rows[0]
 if(!r)return '🏎️ *GT ALPHA BOT*\nNenhum carro principal equipado. Use *!garagemcorrida* e *!equiparcorrida ID*.'
 return '🏎️ *CARRO PRINCIPAL — GT ALPHA*\n🚘 '+racingModel(r.model_id)?.name+' • ID '+r.id+
  '\n🔧 Preparação: '+racingTuning(r.upgrades)+'/42'+
  '\n👨‍✈️ Piloto Nv.'+racingDriverLevel(r.xp)+'\n❤️ Condição: '+r.condition+'/100\n'+
  (r.pending_part&&Number(r.pending_until)>nowSec()?'🔒 Na oficina.':
   Number(r.condition)<RACING_MIN_CONDITION?'🔒 Reparo necessário.':'✅ Apto, se mantiver equipado até 20h30.')
}
export async function handleGtAlphaCommand({cmd,args=[],sender,reply}){
 if(!['gttabela','gtcarro','gt'].includes(cmd))return false
 try{
  if(cmd==='gtcarro'){await reply(await getGtAlphaCar(sender));return true}
  if(cmd==='gt'){await reply('🏎️ *GT ALPHA BOT*\n🕣 Corridas automáticas todos os dias às 20h30.\n🚘 Somente o carro principal equipado.\n🏁 3 provas diárias, melhorias reais, pontos por colocação.\n📊 *!gttabela* • *!gttabela semana* • *!gtcarro*\n🏆 Semanal: 1º R$15M, 2º R$8M, 3º R$5M, 4º R$1M.');return true}
  await reply(await getGtAlphaTable(String(args[0]||'').toLowerCase()==='semana'?'semana':'dia'))
 }catch(e){console.error('[GT] comando',e?.message||e);await reply('⚠️ GT Alpha indisponível. Tente novamente.')}
 return true
}
