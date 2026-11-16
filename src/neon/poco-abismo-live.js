// Controlador do Poço — PR de homologação.
// Modo real isolado, inativo sem POCO_ABISMO_LIVE=true.
// Toda concessão do evento real acontece na mesma transação do progresso.
import {randomInt} from 'node:crypto'
import {db,getCombatProfile,getPetTeam} from './db.js'
import {getActivePlayableHero} from './playable-heroes.js'
import {
 POCO_SEASON,pocoStart,pocoDecision,pocoEnd,pocoScore,pocoBetter,
 pocoRankingCompare,pocoRollDrop,pocoCashForFloor,pocoBossSkill,pocoSeasonActive
} from './poco-abismo-rules.js'

import {pocoStagePrompt,pocoConfirmPrompt,pocoIsChoiceReady,pocoMessageSeen,pocoPendingPromptToken,pocoDispatchActionPrompt} from './poco-abismo-delivery.js'
import {pocoInitRewardLedger,pocoClaimCommandInTx,pocoClaimFloorInTx,pocoClaimBossDropInTx,pocoOpenBoxInTx} from './poco-abismo-rewards.js'
import {pocoGearById} from './poco-abismo-gear.js'
import {pocoRunPlayerTransaction} from './poco-abismo-transaction.js'
import {pocoFinalLeaderboard,pocoSettleFinalRanking,POCO_LIVE_PLAYER_PREFIX,POCO_LIVE_SETTLEMENT_KEY} from './poco-abismo-settlement.js'

const ENABLED=process.env.POCO_ABISMO_LIVE==='true'&&process.env.POCO_ABISMO_PREVIEW!=='true'&&process.env.POCO_BETA_GROUP_PREVIEW!=='true'
const PREFIX=POCO_LIVE_PLAYER_PREFIX
let initPromise=null
function ensureReady(){
 if(!initPromise)initPromise=pocoInitRewardLedger(db).catch(error=>{initPromise=null;throw error})
 return initPromise
}
const keyFor=jid=>PREFIX+jid
const label=n=>Number(n||0).toLocaleString('pt-BR')
const OPTIONS='\n1️⃣ Atacar\n2️⃣ Defender\n3️⃣ Curar (poção)\n4️⃣ Técnica especial (interrompe habilidades)';
async function sendActionPrompt(jid,name,reply,result){
 // Falha no transporte preserva o prompt pendente; confirmar apenas
 // depois de envio aceito e transação de ACK concluída.
 return pocoDispatchActionPrompt({
  reply,message:result.message,token:result.promptToken,
  confirm:(token,sentAt)=>{
   return mutate(jid,name,(_c,s,at)=>{
   if(!s.active||at>=POCO_SEASON.endAt)return false
   return pocoConfirmPrompt(s.active,token,at)
  })
  }
 })
}

let timer=null,busy=false
function dayInBrazil(now){
 const x=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now))
 const d=Object.fromEntries(x.map(v=>[v.type,v.value]))
 return d.year+'-'+d.month+'-'+d.day
}
function empty(name){return {season:POCO_SEASON.id,name,attempts:0,active:null,best:null,last:null,
 processedMessageIds:[],cashEarned:0,xpEarned:0,drops:[],chat:null}}
async function mutate(jid,name,fn){
 return pocoRunPlayerTransaction(db,{
  jid,name,key:keyFor(jid),settlementKey:POCO_LIVE_SETTLEMENT_KEY,
  season:POCO_SEASON.id,empty
 },fn)
}
async function acceptCommand(c,s,jid,messageId){
 return !pocoMessageSeen(s,messageId)&&await pocoClaimCommandInTx(c,jid,messageId)
}
function updateBest(s,jid){
 if(!s.active)return
 const score=pocoScore(s.active,s.name,jid)
 if(pocoBetter(score,s.best))s.best=score
}
function finish(s,jid){
 if(!s.active||s.active.status==='active')return
 updateBest(s,jid)
 s.last=s.active.report;s.active=null
}
function expire(s,jid,now){
 if(!s.active||s.active.status!=='active'||!pocoIsChoiceReady(s.active)||
   !Number.isFinite(s.active.deadline)||now<=Number(s.active.deadline||0))return false
 s.active=pocoEnd(s.active,'timeout',now).state
 finish(s,jid)
 return true
}
async function recordRewards(c,s,jid,progress,now){
 // Essas concessões compartilham a MESMA transação que salva o andar.
 // Ao falhar qualquer crédito, rollback da batalha e dos prêmios.
 let cash=0,xp=0;
 for(const floor of progress.cleared||[]){
  const r=await pocoClaimFloorInTx(c,jid,floor);
  if(!r.alreadyClaimed){cash+=Number(r.cash||0);xp+=Number(r.xp||0)}
 }
 s.cashEarned+=cash;s.xpEarned+=xp;
 const boss=progress.bossDefeated;
 if(!boss || !POCO_SEASON.dropBossFloors.includes(boss))return {cash,xp,drop:null};
 const drop=await pocoClaimBossDropInTx(c,jid,boss,dayInBrazil(now));
 if(!drop.alreadyClaimed){
  s.cashEarned+=Number(drop.cash||0);
  if(drop.kind!=='none')s.drops=[...(s.drops||[]).slice(-99),{...drop,at:now}];
 }
 return {cash,xp,drop};
}
function prompt(state){
 if(state.status!=='active')return '✅ Tentativa encerrada.'
 const boss=state.boss
 const skill=pocoBossSkill(boss.floor,boss.turn)
 return '🏰 *POÇO DO ABISMO — ANDAR '+boss.floor+'/30*'+
  '\n❤️ HP '+label(state.hp)+'/'+label(state.stats.maxHp)+
  ' • 🧪 '+state.potions+' poção(ões) • ✨ '+state.skillCharges+' técnicas'+
  '\n👹 Guardião: '+label(boss.hp)+'/'+label(boss.maxHp)+' HP'+
  '\n⚠️ Próxima skill: *'+skill.name+'*'+OPTIONS+
  '\n⏳ Responda em *120 segundos* com *!poco 1*, 2, 3 ou 4.'+
  '\n🔄 Sem resposta, termina a tentativa e a próxima começa do andar zero.'
}
function report(s){
 const last=s.last
 if(!last)return '📋 Nenhuma tentativa encerrada até agora.'
 const descriptions={death:'Derrota',timeout:'Tempo esgotado',abandoned:'Desistência',completed:'Concluído',season_closed:'Temporada encerrada'}
 return '📋 *RELATÓRIO DO POÇO*'+
  '\nMotivo: '+(descriptions[last.reason]||last.reason)+
  '\n🏰 Último andar concluído: '+last.floor+
  '\n⏱️ Rodadas virtuais: '+last.turns+
  '\n❤️ HP restante: '+last.hp+'/'+last.maxHp+
  '\n🧪 Poções: '+last.potions+
  '\n💡 '+last.explanation+
  '\n🔄 Próxima tentativa sempre do andar zero.'
}
function status(s){
 return '🏰 *POÇO DO ABISMO*'+
  '\n🎮 Tentativas: ilimitadas • ⏳ 120s por decisão'+
  '\n🏆 Seu recorde: '+(s.best?'andar '+s.best.floor+' em '+s.best.turns+' rodadas':'nenhum')+
  '\n📍 Tentativa: '+(s.active?'andar '+s.active.floor+' • '+s.active.status:'não iniciada')+
  '\n💰 Dinheiro concedido: R$ '+label(s.cashEarned)+' • EXP '+label(s.xpEarned)+
  '\n🎁 Saques recebidos: '+(s.drops||[]).length+
  '\n\nUse *!poco iniciar*, *!poco ranking*, *!poco abrir epica|lendaria* ou *!poco relatorio*.'
}
async function ranking(){
 const {rows}=await db.query('SELECT key,value FROM trevo_settings WHERE LEFT(key,LENGTH($1))=$1 AND value->>\'season\'=$2',[PREFIX,POCO_SEASON.id])
 const ranked=pocoFinalLeaderboard(rows).slice(0,15)
 return '🏆 *POÇO — RANKING PRELIMINAR*\n'+
  (ranked.length?ranked.map((p,i)=>(i+1)+'º '+String(p.name).slice(0,48)+' — andar '+p.floor+' • '+p.turns+' rodadas').join('\n'):'Nenhum resultado')+
  '\n📌 No empate de andar, vence quem gastou menos rodadas virtuais.'
}
export async function handlePocoLiveCommand({cmd,args=[],sender,name,reply,chat,messageId}){
 if(!ENABLED||!['poco','pocorank'].includes(cmd))return false
 await ensureReady()
 const option=cmd==='pocorank'?'ranking':String(args[0]||'').toLowerCase()
 if(option==='ranking'||option==='rank'){await reply(await ranking());return true}
 const now=Date.now()
 if((option==='iniciar'||option==='sair'||option==='abrir'||/^[1-4]$/.test(option))&&
   (!messageId||typeof messageId!=='string'||messageId.length>180)){
  await reply('⚠️ Não foi possível validar o ID único da mensagem. Nenhuma ação foi executada; envie novamente o comando.')
  return true
 }
 if(option==='iniciar'){
  if(!pocoSeasonActive(now)){await reply('⛔ O Poço está fora da janela de 16–20/11, até sexta às 21h.');return true}
  const [profile,hero,petTeam]=await Promise.all([getCombatProfile(sender),getActivePlayableHero(db,sender),getPetTeam(sender)])
  if(!profile){await reply('❌ Personagem não encontrado.');return true}
  const prepared={...profile,heroId:hero||'',classId:profile.class_id,
   petIds:(petTeam||[]).map(p=>p.id).filter(Boolean)}
  const result=await mutate(sender,name,async(c,s,at)=>{
   if(!await acceptCommand(c,s,sender,messageId))return {message:'↩️ Este comando de início já foi processado. Consulte !poco.'}
   if(!pocoSeasonActive(at))return {message:'⛔ A temporada não está aberta.'}
   expire(s,sender,at)
   if(s.active)return {message:'⚠️ Já existe uma tentativa. Use !poco para continuar ou !poco sair.'}
   const start=pocoStart({profile:prepared,attempt:s.attempts+1,seed:randomInt(0,0x100000000),now:at})
   s.attempts++;s.active=start.state;s.chat=chat
   const gain=await recordRewards(c,s,sender,start,at)
   updateBest(s,sender)
   const promptToken=pocoStagePrompt(s.active)
   return {message:'⚔️ Tentativa '+s.attempts+' iniciada!\n💰 Andares iniciais: R$ '+label(gain.cash)+' e '+label(gain.xp)+' EXP.\n'+prompt(s.active),promptToken}
  })
  await sendActionPrompt(sender,name,reply,result);return true
 }
 if(option==='sair'){
  const result=await mutate(sender,name,async(c,s,at)=>{
   if(!await acceptCommand(c,s,sender,messageId))return {message:'↩️ Esse encerramento já foi processado.\n'+report(s)}
   expire(s,sender,at)
   if(!s.active)return {message:report(s)}
   s.active=pocoEnd(s.active,at>=POCO_SEASON.endAt?'season_closed':'abandoned',at).state;finish(s,sender)
   return {message:'🚪 Você encerrou a tentativa.\n'+report(s)}
  })
  await reply(result.message);return true
 }
 if(option==='abrir'){
  const requested=String(args[1]||'').toLowerCase();
  const tier=['epica','épica','epic'].includes(requested)?'epic':
    ['lendaria','lendária','legendary'].includes(requested)?'legendary':null;
  if(!tier){await reply('📦 Use !poco abrir epica ou !poco abrir lendaria.');return true}
  const result=await mutate(sender,name,async(c,s)=>{
   const opened=await pocoOpenBoxInTx(c,sender,tier,messageId);
   if(!opened.alreadyClaimed)s.cashEarned+=Number(opened.cash||0);
   return opened.alreadyClaimed
    ?{message:'↩️ Esta mensagem já abriu a caixa; nenhum prêmio duplicado.'}
    :{message:'🎁 *CAIXA ABISSAL*\n💰 R$ '+label(opened.cash)+'\n📦 '+opened.itemId+' ×'+opened.quantity};
  });
  await reply(result.message);return true;
 }
 if(['relatorio','relatório'].includes(option)){
  const s=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[keyFor(sender)])).rows[0]?.value
  await reply(report(s||empty(name)));return true
 }
 if(/^[1-4]$/.test(option)){
  const result=await mutate(sender,name,async(c,s,at)=>{
   if(!await acceptCommand(c,s,sender,messageId))return {message:'↩️ Esta ação já foi processada. Consulte !poco para ver a situação atual.'}
   if(at>=POCO_SEASON.endAt){
    if(s.active){s.active=pocoEnd(s.active,'season_closed',at).state;finish(s,sender)}
    return {message:'🏁 Encerrado o prazo competitivo de sexta às 21h.\n'+report(s)}
   }
   if(expire(s,sender,at))return {message:'⏳ Prazo esgotado; tentativa encerrada.\n'+report(s)}
   if(!s.active)return {message:'❌ Sem tentativa ativa. Use !poco iniciar.'}
   if(!pocoIsChoiceReady(s.active))return {message:'⌛ A decisão ainda não teve envio confirmado. Use !poco para reenviar sem perder tempo.'}
   let progress
   try{progress=pocoDecision(s.active,Number(option),{now:at})}
   catch(e){return {message:'⚠️ '+e.message+'\n'+prompt(s.active)}}
   s.active=progress.state
   const gains=await recordRewards(c,s,sender,progress,at)
   const drop=gains.drop
   updateBest(s,sender)
   const recap=progress.message
    ?'\n⚔️ Você causou '+label(progress.message.damage)+' de dano e recebeu '+label(progress.message.enemyDamage)+'.'+
     (progress.message.heal?'\n💚 Curou '+label(progress.message.heal)+' HP.':''):''
   const passed=progress.bossDefeated?'\n✅ Guardião '+progress.bossDefeated+' derrotado.':''
   const loot=drop?'\n🎲 Saque: '+(pocoGearById(drop.itemId)?.name||drop.itemId||drop.kind)+(drop.kind==='exclusive'?' ★★★★★ Lv.10':'')+(drop.alreadyClaimed?' (já contabilizado)':'')+'.':''
   const money=(gains.cash||gains.xp)?'\n💰 R$ '+label(gains.cash)+' • '+label(gains.xp)+' EXP':''
   if(s.active.status!=='active'){finish(s,sender);return {message:recap+passed+money+loot+'\n'+report(s)}}
   const promptToken=pocoStagePrompt(s.active)
   return {message:recap+passed+money+loot+'\n'+prompt(s.active),promptToken}
  })
  await sendActionPrompt(sender,name,reply,result);return true
 }
 const result=await mutate(sender,name,(_c,s,at)=>{
  if(at>=POCO_SEASON.endAt&&s.active){s.active=pocoEnd(s.active,'season_closed',at).state;finish(s,sender)}
  else expire(s,sender,at)
  if(!s.active)return {message:status(s)}
  if(!s.active.deliveryPending)return {message:status(s)+'\n\n'+prompt(s.active)}
  // Reutilizar o token permite confirmar a primeira entrega bem-sucedida.
  const promptToken=pocoPendingPromptToken(s.active)
  return {message:'📨 Reenviando a decisão sem penalidade de tempo.\n'+prompt(s.active),promptToken}
 })
 await sendActionPrompt(sender,name,reply,result)
 return true
}
export function startPocoLiveScheduler(sock){
 if(!ENABLED)return
 if(timer)clearInterval(timer)
 timer=setInterval(async()=>{
  if(busy)return
  busy=true
  try{
   await ensureReady()
   const now=Date.now()
   const {rows}=await db.query("SELECT key,value FROM trevo_settings WHERE LEFT(key,LENGTH($1))=$1 AND value->>'active' IS NOT NULL AND ((value->'active'->>'deadline')::bigint < $2 OR $2 >= $3) LIMIT 50",[PREFIX,now,POCO_SEASON.endAt])
   for(const row of rows){
    const jid=row.key.slice(PREFIX.length)
    const result=await mutate(jid,row.value?.name,(_c,s,at)=>{
     if(at>=POCO_SEASON.endAt && s.active){
      s.active=pocoEnd(s.active,'season_closed',at).state;finish(s,jid)
      return {chat:s.chat,name:s.name,text:'🏁 *POÇO DO ABISMO — TEMPORADA ENCERRADA*\n'+s.name+', o recorde ficou congelado no horário oficial.'}
     }
     if(!expire(s,jid,at))return null
     return {chat:s.chat,name:s.name,text:'⏳ *POÇO DO ABISMO — TEMPO ESGOTADO*\n'+s.name+
      ', você não respondeu em 2 minutos. Seu recorde foi preservado. Próxima tentativa do zero.'}
    })
    if(result?.chat)await sock.sendMessage(result.chat,{text:result.text}).catch(err=>console.error('[POCO] aviso',err?.message))
   }
   if(now>=POCO_SEASON.endAt)await pocoSettleFinalRanking(db,now)
  }catch(e){console.error('[POCO] scheduler',e?.message||e)}
  finally{busy=false}
 },5000)
 timer.unref?.()
}
