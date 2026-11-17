// Piloto de expedicao temporal, com premios reais limitados ao grupo beta.
// O controlador reaproveita o ledger atomico do Poco. Nunca executa timers
// por jogador; o horario de conclusao e calculado sob lock ao consultar.
import {randomInt} from 'node:crypto'
import {db} from './db.js'
import {POCO_SEASON,pocoSeasonActive} from './poco-abismo-rules.js'
import {pocoExpStart,pocoExpDue,pocoExpResolve,pocoExpAdvance,pocoExpStop,pocoExpFloorMs,POCO_EXPEDITION} from './poco-abismo-expedition.js'
import {pocoInitRewardLedger,pocoClaimCommandInTx,pocoClaimFloorInTx,pocoClaimExpeditionDropInTx,pocoOpenBoxInTx} from './poco-abismo-rewards.js'
import {pocoGearById} from './poco-abismo-gear.js'
import {pocoRunPlayerTransaction} from './poco-abismo-transaction.js'
import {POCO_LIVE_SETTLEMENT_KEY} from './poco-abismo-settlement.js'

const PREFIX='poco_expedition_20261117:player:'
const keyFor=jid=>PREFIX+jid;
const fmt=x=>Number(x||0).toLocaleString('pt-BR')
const duration=x=>{const m=Math.max(0,Math.ceil(x/60000));return m>=60?Math.floor(m/60)+'h'+String(m%60).padStart(2,'0'):m+' min'}
const UPGRADES='1❤️ Recuperar 25% HP  2⚔️ +25% ATK  3🛡️ +25% DEF  4🔰 +25% escudo'
let readyPromise;
const ensureReady=()=>readyPromise||(readyPromise=pocoInitRewardLedger(db).catch(err=>{readyPromise=null;throw err}))
function empty(name){return {season:POCO_SEASON.id,name,attempts:0,active:null,best:null,last:null,cashEarned:0,xpEarned:0,drops:[],chat:null}}
function mutate(jid,name,fn){
 return pocoRunPlayerTransaction(db,{jid,name,key:keyFor(jid),settlementKey:POCO_LIVE_SETTLEMENT_KEY,season:POCO_SEASON.id,empty},fn)
}
async function accept(c,jid,messageId){
 if(typeof messageId!=='string'||!messageId||messageId.length>180)throw new Error('ID unico da mensagem nao confirmado; comando nao executado')
 return pocoClaimCommandInTx(c,jid,messageId)
}
function lootName(drop){
 if(!drop||drop.kind==='none')return 'nenhum saque extra'
 if(drop.kind==='exclusive')return (pocoGearById(drop.itemId)?.name||drop.itemId)+' ★★★★★ Lv10'
 if(drop.kind==='duplicate_converted')return 'peça repetida convertida em Caixa Lendária Abissal'
 if(drop.kind==='enchant_stone')return 'Pedra '+String(drop.itemId).replace(/^pedra_/,'').replace(/_alpha$/,'').replaceAll('_',' ')+' ×1'
 if(drop.kind==='legendary_box')return 'Caixa Lendária Abissal'
 if(drop.kind==='epic_box')return 'Caixa Épica Abissal'
 if(drop.kind==='forge_materials')return 'Fragmento Universal de Raid ×3'
 if(drop.kind==='cash_bonus')return 'R$ '+fmt(drop.cash)+' bônus'
 return String(drop.kind)
}
function statLine(active){
 const v=active.stats
 return '❤️'+fmt(v.hp)+'/'+fmt(v.maxHp)+' ⚔️'+v.atk+' 🛡️'+v.def+' 🔰'+v.shield+'/'+v.maxShield
}
function status(s,now){
 const g=s.active
 if(!g)return '🏰 *POÇO — EXPEDIÇÃO* • 30 andares, 30 chefes automáticos\n🎁 R$ + EXP por andar, sorteio de pedras, caixas e 5 exclusivos\n⏱️ 10/15/20 min por andar • sem perder por inatividade\nUse *!poco iniciar*.'
 if(g.phase==='exploring')
  return '🏰 *POÇO* • '+s.name+' • Andar '+g.floor+'/30\n'+statLine(g)+
   '\n⏳ Exploração e chefe automáticos: '+duration(g.readyAt-now)+
   '\nUse *!poco* ao terminar. Sem limite de 2 minutos.'
 if(g.phase==='choose')
  return '✅ *POÇO* • Chefe '+g.floor+'/30 derrotado!\n'+statLine(g)+
   '\n🎁 '+lootName(g.last?.drop)+' • R$ '+fmt(g.last?.cash)+' • '+fmt(g.last?.xp)+' EXP'+
   '\n⚒️ '+UPGRADES+
   '\nEnvie *!poco proximo 1–4* ou *!poco proximo* (cura padrão).'
 return '🏁 *POÇO* • '+(g.phase==='completed'?'30/30 concluídos!':'Tentativa encerrada')+
   '\n🏰 Último andar vencido: '+g.cleared+'/30\n'+statLine(g)+
   '\n🏆 Melhor resultado: '+(s.best?.floor||g.cleared)+'/30 • !poco iniciar'
}
async function resolve(c,s,jid,now){
 const g=s.active
 if(!g||!pocoExpDue(g,now))return false
 if(g.readyAt>POCO_SEASON.endAt){
  s.active=pocoExpStop(g,{now});s.last=s.active.last
  return true
 }
 const result=pocoExpResolve(g,{now});
 if(!result.ready)return false
 s.active=result.state;
 if(result.won){
  // Tudo em uma unica transacao junto com a gravacao de progresso.
  const floor=await pocoClaimFloorInTx(c,jid,result.clearedFloor)
  const drop=await pocoClaimExpeditionDropInTx(c,jid,result.clearedFloor)
  const cash=(floor.alreadyClaimed?0:Number(floor.cash||0))+(drop.alreadyClaimed?0:Number(drop.cash||0))
  const xp=floor.alreadyClaimed?0:Number(floor.xp||0)
  s.cashEarned+=cash;s.xpEarned+=xp
  s.active.last={...s.active.last,cash,xp,drop}
  if(drop.kind!=='none'&&!drop.alreadyClaimed)s.drops=[...(s.drops||[]).slice(-49),{...drop,at:now}]
  if(!s.best||s.active.cleared>s.best.floor)s.best={floor:s.active.cleared,at:now}
 }else{
  s.last=s.active.last
  if(!s.best||s.active.cleared>s.best.floor)s.best={floor:s.active.cleared,at:now}
 }
 return true
}
async function ranking(){
 const {rows}=await db.query(
  "SELECT value FROM trevo_settings WHERE LEFT(key,LENGTH($1))=$1 AND value->>'season'=$2",
  [PREFIX,POCO_SEASON.id])
 const list=rows.map(r=>r.value).filter(s=>s?.best?.floor>0)
  .sort((a,b)=>b.best.floor-a.best.floor||(a.best.at||0)-(b.best.at||0)).slice(0,10)
 return '🏆 *POÇO — EXPEDIÇÃO*\n'+(list.length?list.map((s,i)=>(i+1)+'º '+s.name+' • andar '+s.best.floor).join('\n'):'Sem resultados')
}
export async function handlePocoExpeditionCommand({cmd,args=[],sender,name,reply,chat,messageId,betaAllowed=false}={}){
 if(!betaAllowed||!['poco','pocorank'].includes(cmd))return false
 await ensureReady()
 const action=cmd==='pocorank'?'ranking':String(args[0]||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 if(action==='rank'||action==='ranking'){await reply(await ranking());return true}
 const now=Date.now()
 const needsId=['iniciar','proximo','avancar','sair','abrir'].includes(action)
 if(needsId&&(!messageId||messageId.length>180)){await reply('⚠️ Não consegui validar a mensagem. Tente novamente.');return true}
 if(action==='iniciar'){
  if(!pocoSeasonActive(now)){await reply('⛔ Temporada encerrada ou fora da janela oficial.');return true}
  const r=await mutate(sender,name,async(c,s,at)=>{
   if(!await accept(c,sender,messageId))return {msg:'↩️ Início já processado.'}
   if(!pocoSeasonActive(at))return {msg:'⛔ Fora do período da temporada.'}
   if(s.active&&['exploring','choose'].includes(s.active.phase)){
    await resolve(c,s,sender,at);
    if(['exploring','choose'].includes(s.active.phase))return {msg:'⚠️ Tentativa já em andamento.\n'+status(s,at)}
   }
   s.attempts++;
   s.active=pocoExpStart({seed:randomInt(0,0x100000000),attempt:s.attempts,now:at})
   s.chat=chat
   return {msg:'⚔️ Expedição '+s.attempts+' iniciada!\n'+status(s,at)}
  })
  await reply(r.msg);return true
 }
 if(action==='sair'){
  const r=await mutate(sender,name,async(c,s,at)=>{
   if(!await accept(c,sender,messageId))return {msg:'↩️ Desistência já processada.'}
   if(!s.active||!['exploring','choose'].includes(s.active.phase))return {msg:status(s,at)}
   s.active=pocoExpStop(s.active,{now:at});s.last=s.active.last
   return {msg:'🚪 Expedição encerrada. Prêmios já recebidos preservados.\n'+status(s,at)}
  })
  await reply(r.msg);return true
 }
 if(action==='abrir'){
  const raw=String(args[1]||'').toLowerCase()
  const tier=['epica','épica','epic'].includes(raw)?'epic':['lendaria','lendária','legendary'].includes(raw)?'legendary':null
  if(!tier){await reply('Use !poco abrir epica ou !poco abrir lendaria.');return true}
  const r=await mutate(sender,name,async(c,s)=>{
   const opened=await pocoOpenBoxInTx(c,sender,tier,messageId)
   if(opened.alreadyClaimed)return {msg:'↩️ Caixa já aberta por esta mensagem.'}
   s.cashEarned+=Number(opened.cash||0)
   return {msg:'📦 Caixa aberta! R$ '+fmt(opened.cash)+' • '+opened.itemId+' ×'+opened.quantity}
  })
  await reply(r.msg);return true
 }
 if(action==='proximo'||action==='avancar'){
  const raw=String(args[1]||'1')
  const choice=Number(raw)
  if(!Number.isInteger(choice)||choice<1||choice>4){await reply('⚒️ '+UPGRADES+'\nEnvie !poco proximo 1–4');return true}
  const r=await mutate(sender,name,async(c,s,at)=>{
   if(!await accept(c,sender,messageId))return {msg:'↩️ Avanço já processado. Consulte !poco.'}
   await resolve(c,s,sender,at)
   if(!s.active)return {msg:'Use !poco iniciar.'}
   if(s.active.phase!=='choose')return {msg:status(s,at)}
   if(at>=POCO_SEASON.endAt)return {msg:'⛔ Encerrado o prazo da temporada.'}
   const prior=s.active.floor
   s.active=pocoExpAdvance(s.active,choice,{now:at})
   return {msg:'⬇️ Andar '+prior+' → '+s.active.floor+' • '+POCO_EXPEDITION.upgrades[choice]+
    '\n'+status(s,at)}
  })
  await reply(r.msg);return true
 }
 if(action==='relatorio'||action==='relatório'){
  const r=await mutate(sender,name,async(c,s,at)=>{
   await resolve(c,s,sender,at)
   return {msg:status(s,at)+'\n💰 Acumulado creditado: R$ '+fmt(s.cashEarned)+
    ' • EXP '+fmt(s.xpEarned)+' • Saques '+s.drops.length}
  })
  await reply(r.msg);return true
 }
 if(/^[1-4]$/.test(action)){await reply('⚔️ O combate agora é automático. Use !poco ou !poco proximo 1–4.');return true}
 const r=await mutate(sender,name,async(c,s,at)=>{
  await resolve(c,s,sender,at)
  return {msg:status(s,at)}
 })
 await reply(r.msg);return true
}
