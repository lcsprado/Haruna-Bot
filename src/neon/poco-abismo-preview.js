// Controlador do Poço — PR de homologação.
// Somente simulação: nunca creditar cash/EXP/drops com este preview.
// O evento real exige revisão de equipamentos forjados e pagamentos.
import {randomInt} from 'node:crypto'
import {db,getCombatProfile,getPetTeam} from './db.js'
import {getActivePlayableHero} from './playable-heroes.js'
import {
 POCO_SEASON,pocoStart,pocoDecision,pocoEnd,pocoScore,pocoBetter,
 pocoRankingCompare,pocoRollDrop,pocoCashForFloor,pocoBossSkill,pocoSeasonActive
} from './poco-abismo-rules.js'

import {pocoStagePrompt,pocoConfirmPrompt,pocoIsChoiceReady,pocoMessageSeen,pocoRememberMessage} from './poco-abismo-delivery.js'

const ENABLED=process.env.POCO_ABISMO_PREVIEW==='true'
const PREFIX='poco_abismo_preview_20261116:player:'
const keyFor=jid=>PREFIX+jid
const label=n=>Number(n||0).toLocaleString('pt-BR')
const OPTIONS='\n1️⃣ Atacar\n2️⃣ Defender\n3️⃣ Curar (poção)\n4️⃣ Técnica especial (interrompe habilidades)';
async function sendActionPrompt(jid,name,reply,result){
 // O estado foi gravado antes do envio. Não começar a contagem por tempo de
 // processamento, nem consumir janela quando Baileys não confirmar o envio.
 await reply(result.message)
 if(result.promptToken){
  await mutate(jid,name,s=>{
   if(!s.active)return false
   return pocoConfirmPrompt(s.active,result.promptToken,Date.now())
  })
 }
}

let timer=null,busy=false
function dayInBrazil(now){
 const x=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now))
 const d=Object.fromEntries(x.map(v=>[v.type,v.value]))
 return d.year+'-'+d.month+'-'+d.day
}
function empty(name){return {season:POCO_SEASON.id,name,attempts:0,active:null,best:null,last:null,
 awardedFloors:[],dailyRolls:{},pendingCash:0,pendingDrops:[]}}
async function mutate(jid,name,fn){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[keyFor(jid)])
  const row=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[keyFor(jid)])).rows[0]
  const s=row?.value?.season===POCO_SEASON.id?row.value:empty(name)
  s.name=String(name||s.name||'Jogador').slice(0,48)
  const result=await fn(s)
  await c.query("INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",[keyFor(jid),JSON.stringify(s)])
  await c.query('COMMIT')
  return result
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}
 finally{c.release()}
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
function recordRewards(s,progress,now){
 // Preview guarda APENAS um ledger verificável: não entrega inventário nem dinheiro.
 // A regra definitiva é uma concessão única por andar e uma rolagem por Boss/dia.
 for(const floor of progress.cleared||[]){
  if(!s.awardedFloors.includes(floor)){
   s.awardedFloors.push(floor)
   s.pendingCash+=pocoCashForFloor(floor)
  }
 }
 const boss=progress.bossDefeated
 if(!boss)return null
 const claimKey=dayInBrazil(now)+':'+boss
 if(s.dailyRolls[claimKey])return {kind:'already_rolled'}
 const drop=pocoRollDrop(()=>randomInt(0,10000)/10000)
 s.dailyRolls[claimKey]=drop
 if(drop.kind!=='none')s.pendingDrops.push({day:dayInBrazil(now),floor:boss,...drop})
 return drop
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
 return '🏰 *POÇO DO ABISMO — PRÉVIA*'+
  '\n🎮 Tentativas: ilimitadas • ⏳ 120s por decisão'+
  '\n🏆 Seu recorde: '+(s.best?'andar '+s.best.floor+' em '+s.best.turns+' rodadas':'nenhum')+
  '\n📍 Tentativa: '+(s.active?'andar '+s.active.floor+' • '+s.active.status:'não iniciada')+
  '\n💰 Recompensa SIMULADA (não creditada): R$ '+label(s.pendingCash)+
  '\n🎁 Drops SIMULADOS (não entregues): '+s.pendingDrops.length+
  '\n\nUse *!poco iniciar*, *!poco ranking* ou *!poco relatorio*.'
}
async function ranking(){
 const {rows}=await db.query('SELECT key,value FROM trevo_settings WHERE key LIKE $1 AND value->>\'season\'=$2',[PREFIX+'%',POCO_SEASON.id])
 const ranked=rows.filter(r=>r.value?.best).map(r=>r.value.best).sort(pocoRankingCompare).slice(0,15)
 return '🏆 *POÇO — RANKING PRELIMINAR*\n'+
  (ranked.length?ranked.map((p,i)=>(i+1)+'º '+String(p.name).slice(0,48)+' — andar '+p.floor+' • '+p.turns+' rodadas').join('\n'):'Nenhum resultado')+
  '\n📌 No empate de andar, vence quem gastou menos rodadas virtuais.'
}
export async function handlePocoCommand({cmd,args=[],sender,name,reply,chat,messageId}){
 if(!ENABLED||!['poco','pocorank'].includes(cmd))return false
 const option=cmd==='pocorank'?'ranking':String(args[0]||'').toLowerCase()
 if(option==='ranking'||option==='rank'){await reply(await ranking());return true}
 const now=Date.now()
 if(option==='iniciar'){
  if(!pocoSeasonActive(now)){await reply('⛔ O Poço está fora da janela de 16–20/11, até sexta às 21h.');return true}
  const [profile,hero,petTeam]=await Promise.all([getCombatProfile(sender),getActivePlayableHero(db,sender),getPetTeam(sender)])
  if(!profile){await reply('❌ Personagem não encontrado.');return true}
  const prepared={...profile,heroId:hero||'',classId:profile.class_id,
   petIds:(petTeam||[]).map(p=>p.id).filter(Boolean)}
  const result=await mutate(sender,name,s=>{
   if(pocoMessageSeen(s,messageId))return {message:'↩️ Este comando de início já foi processado. Consulte !poco.'}
   expire(s,sender,now)
   if(s.active)return {message:'⚠️ Já existe uma tentativa. Use !poco para continuar ou !poco sair.'}
   const start=pocoStart({profile:prepared,attempt:s.attempts+1,seed:randomInt(0,0x100000000),now})
   s.attempts++;s.active=start.state;s.chat=chat
   updateBest(s,sender)
   recordRewards(s,start,now)
   const promptToken=pocoStagePrompt(s.active)
   pocoRememberMessage(s,messageId)
   return {message:'⚔️ Tentativa '+s.attempts+' iniciada!\n'+prompt(s.active),promptToken}
  })
  await sendActionPrompt(sender,name,reply,result);return true
 }
 if(option==='sair'){
  const result=await mutate(sender,name,s=>{
   if(pocoMessageSeen(s,messageId))return {message:'↩️ Esse encerramento já foi processado.\n'+report(s)}
   expire(s,sender,now)
   if(!s.active)return {message:report(s)}
   s.active=pocoEnd(s.active,'abandoned',now).state;finish(s,sender)
   pocoRememberMessage(s,messageId)
   return {message:'🚪 Você encerrou a tentativa.\n'+report(s)}
  })
  await reply(result.message);return true
 }
 if(['relatorio','relatório'].includes(option)){
  const s=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[keyFor(sender)])).rows[0]?.value
  await reply(report(s||empty(name)));return true
 }
 if(/^[1-4]$/.test(option)){
  const result=await mutate(sender,name,s=>{
   if(pocoMessageSeen(s,messageId))return {message:'↩️ Esta ação já foi processada. Consulte !poco para ver a situação atual.'}
   if(now>=POCO_SEASON.endAt){
    if(s.active){s.active=pocoEnd(s.active,'season_closed',now).state;finish(s,sender)}
    return {message:'🏁 Encerrado o prazo competitivo de sexta às 21h.\n'+report(s)}
   }
   if(expire(s,sender,now))return {message:'⏳ Prazo esgotado; tentativa encerrada.\n'+report(s)}
   if(!s.active)return {message:'❌ Sem tentativa ativa. Use !poco iniciar.'}
   if(!pocoIsChoiceReady(s.active))return {message:'⌛ A decisão ainda não teve envio confirmado. Use !poco para reenviar sem perder tempo.'}
   let progress
   try{progress=pocoDecision(s.active,Number(option),{now})}
   catch(e){return {message:'⚠️ '+e.message+'\n'+prompt(s.active)}}
   s.active=progress.state
   pocoRememberMessage(s,messageId)
   const drop=recordRewards(s,progress,now)
   updateBest(s,sender)
   const recap=progress.message
    ?'\n⚔️ Você causou '+label(progress.message.damage)+' de dano e recebeu '+label(progress.message.enemyDamage)+'.'+
     (progress.message.heal?'\n💚 Curou '+label(progress.message.heal)+' HP.':''):''
   const passed=progress.bossDefeated?'\n✅ Guardião '+progress.bossDefeated+' derrotado.':''
   const loot=drop?'\n🎲 Saque SIMULADO: '+(drop.itemId||drop.kind)+'.':''
   if(s.active.status!=='active'){finish(s,sender);return {message:recap+passed+loot+'\n'+report(s)}}
   const promptToken=pocoStagePrompt(s.active)
   return {message:recap+passed+loot+'\n'+prompt(s.active),promptToken}
  })
  await sendActionPrompt(sender,name,reply,result);return true
 }
 const result=await mutate(sender,name,s=>{
  if(!s.active)return {message:status(s)}
  if(!s.active.deliveryPending)return {message:status(s)+'\n\n'+prompt(s.active)}
  // !poco reenvia exatamente a escolha pendente sem avançar nenhum turno.
  const promptToken=pocoStagePrompt(s.active)
  return {message:'📨 Reenviando a decisão sem penalidade de tempo.\n'+prompt(s.active),promptToken}
 })
 await sendActionPrompt(sender,name,reply,result)
 return true
}
export function startPocoPreviewScheduler(sock){
 if(!ENABLED)return
 if(timer)clearInterval(timer)
 timer=setInterval(async()=>{
  if(busy)return
  busy=true
  try{
   const now=Date.now()
   const {rows}=await db.query("SELECT key,value FROM trevo_settings WHERE key LIKE $1 AND value->'active' IS NOT NULL AND ((value->'active'->>'deadline')::bigint < $2 OR $2 >= $3) LIMIT 50",[PREFIX+'%',now,POCO_SEASON.endAt])
   for(const row of rows){
    const jid=row.key.slice(PREFIX.length)
    const result=await mutate(jid,row.value?.name,s=>{
     if(now>=POCO_SEASON.endAt && s.active){
      s.active=pocoEnd(s.active,'season_closed',now).state;finish(s,jid)
      return {chat:s.chat,name:s.name,text:'🏁 *POÇO DO ABISMO — TEMPORADA ENCERRADA*\n'+s.name+', o recorde ficou congelado no horário oficial.'}
     }
     if(!expire(s,jid,now))return null
     return {chat:s.chat,name:s.name,text:'⏳ *POÇO DO ABISMO — TEMPO ESGOTADO*\n'+s.name+
      ', você não respondeu em 2 minutos. Seu recorde foi preservado. Próxima tentativa do zero.'}
    })
    if(result?.chat)await sock.sendMessage(result.chat,{text:result.text}).catch(err=>console.error('[POCO] aviso',err?.message))
   }
  }catch(e){console.error('[POCO] scheduler',e?.message||e)}
  finally{busy=false}
 },5000)
 timer.unref?.()
}
