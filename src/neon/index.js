import 'dotenv/config'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  makeCacheableSignalKeyStore
} from 'baileys'
import pino from 'pino'
import {
  db, initDatabase, ensureUser, consolidateUserIdentity, getProfile, getDailyStreak, claimDaily, work, getCareer,
  deposit, withdraw, transfer, getShop, buyItem, purchaseService, getInventory, sellItem, sellItemsBatch, leaderboard, getPlayerRanks, getProfileAvatar, setProfileAvatar, removeProfileAvatar,
  equipItem, getEquipmentInfo, sellDuplicateEquipment, listUpgradeableEquipment, upgradeEquipment, usePotion, usePetPotion, usePetEnergyItem, getCombatProfile, battle, combatLeaderboard,
  acquireRuntimeLock, ownerAddBalance, ownerRemoveBalance, ownerAddExp,
  ownerSetBalance, ownerResetBalance, ownerResetExp, ownerResetInventory, ownerResetTotal,
  ownerSetLevel, ownerHeal, ownerGrantItem,
  getGroupLicense, ensureGroupTrial, activateGroupLicense, blockGroupLicense,
  listGroupLicenses, groupLicenseIsActive, getGroupSettings, setGroupSetting,
  getLaunchPrice, setLaunchPrice, getDoubleRewardEvent, startDoubleRewardEvent, stopDoubleRewardEvent,
  getPaymentLink, setPaymentLink,
  createSubscriptionOrder, getSubscriptionOrder, listPendingSubscriptionOrders,
  approveSubscriptionOrder, cancelSubscriptionOrder,
  createSupportTicket, getSupportTicket, listOpenSupportTickets, answerSupportTicket,
  saveQuickFlow, getStoredQuickFlow, deleteQuickFlow, cleanupQuickFlows,
  saveSnipeMessage, markSnipeDeleted, getLastDeletedSnipe, cleanupSnipeMessages,
  openLuckyBox, openLuckyBoxes, openLootBoxes, dungeon, robPlayer,
  initCommunityPack, getCommunitySettings, setCommunitySetting, setGroupRules,
  addGroupWarning, getGroupWarnings, clearGroupWarnings,
  resolvePlayerSleep, startPlayerSleep, wakePlayerEarly, petMaxEnergy, petMaxHp, petHpType,
  adoptPet, getPet, listPets, selectPet, renamePet, petAction, petAdventure, petLeaderboard, LEGENDARY_PET_SUMMONS, summonLegendaryPet,
  proposeRelationship, acceptRelationship, divorceRelationship, getRelationship,
  createMarketListing, listMarket, buyMarketListing, cancelMarketListing,
  recordGroupActivity, weeklyActivityLeaderboard, getAchievements, petDuel
} from './db.js'
import { useNeonAuthState } from './auth.js'
import {
  initGames, roulette, createGroupRoulette, joinGroupRoulette, spinGroupRoulette, coinFlip, createCoinDuel, acceptCoinDuel, createRpsDuel, acceptRpsDuel, createTournament, joinTournament, startTournament, rps,
  startHangman, hangmanLetter, hangmanWord,
  startQuiz, answerQuiz,
  startNumberGame, guessNumber,
  startBoss, attackBoss, activateBossEvent, deactivateBossEvent, getBossEventStatus, autoStartBossEvent,
  getRaidCatalog, getRaidStatus, createRaid, joinRaid, cancelRaid, startRaid, raidRound
} from './games.js'
import {
  initProgression, HOUSES, CARS, MOTORCYCLES, BUSINESSES,
  getDailyMissions, progressDailyMission, claimDailyMissions,
  getClanForUser, createClan, inviteToClan, acceptClanInvite, transferClanLeadership,
  kickClanMember, leaveClan, donateClan, listClans,
  getHome, buyHouse, getGarage, buyCar, driveUber, getMotorcycleGarage, buyMotorcycle, deliverIfood,
  getPatrimony, patrimonyLeaderboard, getBusinesses, buyBusiness, collectBusinesses, upgradeBusiness, sellCar, sellMotorcycle,
  getGroupMission, getGroupMissionLeaderboard, progressGroupMission, claimGroupMission, maybeSpawnGroupEvent, claimGroupEvent
} from './progression.js'
import { toStickerBuffer } from './sticker.js'
import { footballToday, brazilStandings, teamSummary, formatFixtures, formatTeamFixture } from './football.js'

const logger=pino({level:process.env.LOG_LEVEL || 'info'})
const prefix=process.env.PREFIX || '!'
const pairingNumber=(process.env.PAIRING_NUMBER || '').replace(/\D/g,'')
// WhatsApp identity is environment-driven. Changing the bot phone must never require a code change.
// IMPORTANT: when changing PAIRING_NUMBER, also change SESSION_ID so Baileys creates a fresh auth session.
// Game data remains in the same Neon database and is not tied to either value.
const sessionId=(process.env.SESSION_ID || 'alpha-primary').trim()
const ownerNumber=(process.env.OWNER_NUMBER || '').replace(/\D/g,'')
const ownerJid=(process.env.OWNER_JID || (ownerNumber ? ownerNumber+'@s.whatsapp.net' : '')).trim()

const trevoHealth=globalThis.__trevoHealth || (globalThis.__trevoHealth={
  whatsapp:'starting',
  lastChange:Date.now(),
  lastOpen:0,
  everConnected:false,
  lastUpsertAt:0,
  lastInboundAt:0,
  messagesSeen:0
})
let connectionWatchdog=null
let bossEventScheduler=null
let reconnectTimer=null
let reconnecting=false
function scheduleReconnect(delayMs=3000){
  if(reconnectTimer || reconnecting) return
  reconnectTimer=setTimeout(async()=>{
    reconnectTimer=null
    reconnecting=true
    try{ await start() }
    catch(err){
      reconnecting=false
      console.error('[WhatsApp] falha na reconexão',err)
      scheduleReconnect(10000)
    }
  },delayMs)
}
function setWhatsAppHealth(state){
  trevoHealth.whatsapp=state
  trevoHealth.lastChange=Date.now()
  if(state==='open'){
    trevoHealth.lastOpen=Date.now()
    trevoHealth.everConnected=true
  }
}
if(!connectionWatchdog){
  connectionWatchdog=setInterval(()=>{
    const grace=trevoHealth.everConnected ? 45000 : 120000
    if(trevoHealth.whatsapp!=='open' && Date.now()-trevoHealth.lastChange>grace){
      console.error('[Watchdog] WhatsApp não recuperou a conexão; reiniciando processo')
      process.exit(1)
    }
  },10000)
  connectionWatchdog.unref?.()
}

const bossSessions=new Map()
async function runBossSession(chat,jid,name,reply,usePet=true){
  const key=chat+'|'+jid
  if(bossSessions.has(key)) return false
  bossSessions.set(key,true)
  ;(async()=>{
    let totalDamage=0,petDamage=0,attacks=0,heals=[],petName=null,petBonus=null,petExitWarned=false,petFaintWarned=false
    try{
      for(let i=0;i<30;i++){
        const r=await attackBoss(chat,jid,name,usePet)
        if(r.petUnavailableReason==='energy'&&!petExitWarned){
          petExitWarned=true
          await reply('⚡ Seu pet ficou sem energia e saiu do combate. Você continuará atacando sozinho, sem o bônus dele.')
        }
        if((r.petUnavailableReason==='hp'||r.petFainted)&&!petFaintWarned){
          petFaintWarned=true
          await reply('💔 Seu pet ficou sem HP e saiu do combate. Você continuará atacando sozinho. Use *!descansar* depois para recuperar a vida dele.')
        }
        if(r.playerDead){
          await reply(`💀 *VOCÊ CAIU NO BOSS!*\n\n🧪 Nenhuma cura disponível.\n⛔ Seus ataques foram interrompidos.\n💥 Dano nesta sessão: *${totalDamage}*\n\nUse *!curar* e depois *!atacar* para voltar.`)
          return
        }
        attacks++; totalDamage+=Number(r.damage||0); petDamage+=Number(r.pet?.damage||0); if(r.pet){petName=r.pet.name;petBonus=r.pet.bonus}
        if(r.autoHeal) heals.push(r.autoHeal.name)
        if(r.dead){
          const bossTitle=r.mode==='event'?'BOSS DE EVENTO':(r.mode==='weekly'?'SUPERBOSS SEMANAL':'BOSS COMUM')
          let text=`💥 *${bossTitle} DERROTADO!*\n\n👹 ${r.maxHp.toLocaleString('pt-BR')} HP eliminados!\n\n🏆 *RANKING E RECOMPENSAS*\n`
          r.rewards.forEach((x,n)=>{
            const items=x.drops?.length?`\n🎁 ${x.drops.map(d=>`${d.name} (${d.rarity})`).join(' + ')}`:''
            const petXp=x.petXp?` • 🐾 +${x.petXp} XP pet`:''
            text+=`\n${n+1}º *${x.name}* — ${x.damage.toLocaleString('pt-BR')} dano\n💰 R$ ${fmt(x.cash)} • ✨ +${x.exp} XP${petXp}${items}`
          })
          await reply(text); return
        }
        if(r.playerDead){
          await reply(`💀 Você foi derrotado após causar *${totalDamage.toLocaleString('pt-BR')}* de dano. Sem cura disponível; use *!curar* para voltar.`); return
        }
        if(i<29) await new Promise(resolve=>setTimeout(resolve,10000))
      }
      await reply(`⚔️ *SESSÃO DE BOSS CONCLUÍDA!*\n\n🥊 Ataques: *${attacks}*\n💥 Dano causado: *${totalDamage.toLocaleString('pt-BR')}*${petName?`\n🐾 ${petName} (${petBonus}) ajudou com ~*${petDamage.toLocaleString('pt-BR')}* de dano`:''}${petExitWarned?'\n⚡ O pet saiu ao ficar sem energia; o combate continuou sem bônus.':''}${petFaintWarned?'\n💔 O pet ficou sem HP; o combate continuou sem ele.':''}${heals.length?`\n🧪 Curas automáticas usadas: *${heals.length}*`:''}\n\nUse *!boss* para ver a situação atual.`)
    }catch(err){console.error('[BossSession]',err);await reply('⚠️ Sua sessão de Boss foi interrompida: '+String(err?.message||err))}
    finally{bossSessions.delete(key)}
  })()
  return true
}

const raidRuns=new Map()
async function runRaidCombat(chat,reply){
  if(raidRuns.has(chat)) return false
  raidRuns.set(chat,true)
  ;(async()=>{
    try{
      for(let i=0;i<30;i++){
        let r
        for(let deadlockAttempt=0;;deadlockAttempt++){
          try{
            r=await raidRound(chat)
            break
          }catch(err){
            const isDeadlock=err?.code==='40P01' || /deadlock detected/i.test(String(err?.message||err))
            if(!isDeadlock || deadlockAttempt>=4) throw err
            console.warn('[Raid] deadlock detectado; repetindo rodada',deadlockAttempt+1)
            await new Promise(resolve=>setTimeout(resolve,350*(deadlockAttempt+1)))
          }
        }
        if(r.reason==='inactive') return

        if(r.victory){
          let text=`🏆 *RAID CONCLUÍDA — ${r.config.name}!*\n\n❤️ Boss derrotado em *${r.round} rodadas*.\n\n📊 *RECOMPENSAS POR COLABORAÇÃO*\n`
          r.rewards.forEach((x,n)=>{
            const pct=(x.share*100).toLocaleString('pt-BR',{maximumFractionDigits:1})
            text+=`\n${n+1}º *${x.name}* — ${x.damage.toLocaleString('pt-BR')} dano (${pct}%)\n💰 R$ ${fmt(x.cash)} • ✨ +${x.exp} XP`
            if(x.petXp) text+=` • 🐾 +${x.petXp} XP pet`
            if(x.material) text+=`\n🧩 ${x.material.name} ×${x.material.qty}`
            if(x.drop) text+=`\n🎁 DROP: *${x.drop.name}* (${x.drop.rarity})`
            if(x.gearDrop) text+=`\n⚔️ *DROP DE RAID:* ${x.gearDrop.name} (${x.gearDrop.rarity})`
          })
          await reply(text)
          return
        }

        if(r.failed){
          const why=r.reason==='party_wipe'?'todos os jogadores caíram':'o tempo acabou'
          await reply(`💀 *RAID FRACASSADA — ${r.config.name}*\n\n❤️ Boss restante: *${Number(r.hp||0).toLocaleString('pt-BR')}/${Number(r.maxHp||0).toLocaleString('pt-BR')}*\n⚠️ Motivo: *${why}*.\n\n🔑 A chave foi consumida. Não há recompensa em caso de derrota.`)
          return
        }

        const bossEvents=(r.events||[]).filter(e=>e.type==='boss')
        const hitEvents=(r.events||[]).filter(e=>e.type==='hit')
        const heals=bossEvents.filter(e=>e.autoHeal)
        const deaths=bossEvents.filter(e=>!e.alive)
        const petFalls=bossEvents.filter(e=>e.petFainted)
        if(r.round===1 || r.round%5===0 || heals.length || deaths.length || petFalls.length){
          const groupDamage=hitEvents.reduce((a,e)=>a+Number(e.damage||0),0)
          const bossDamage=bossEvents.reduce((a,e)=>a+Number(e.damage||0),0)
          let text=`⚔️ *RAID — RODADA ${r.round}*\n\n👹 *${r.config.name}*\n❤️ HP: *${Number(r.hp).toLocaleString('pt-BR')}/${Number(r.maxHp).toLocaleString('pt-BR')}*\n💥 Grupo causou: *${groupDamage.toLocaleString('pt-BR')}*\n`
          if(r.special) text+=`\n🔥 *${r.specialName}!* O Boss usou um ataque especial.\n`
          text+=`👹 Dano total do Boss na rodada: *${bossDamage.toLocaleString('pt-BR')}*\n👥 Sobreviventes: *${r.survivors}*`
          for(const e of heals) text+=`\n🧪 ${e.name} caiu e usou *${e.autoHeal.name}* automaticamente.`
          for(const e of deaths) text+=`\n💀 *${e.name}* caiu sem cura e saiu da Raid.`
          for(const e of petFalls) text+=`\n💔 *${e.petName}* ficou sem HP e saiu da Raid.`
          await reply(text)
        }
        await new Promise(resolve=>setTimeout(resolve,8000))
      }
    }catch(err){
      console.error('[Raid]',err)
      await reply('⚠️ A Raid foi interrompida: '+String(err?.message||err))
    }finally{
      raidRuns.delete(chat)
    }
  })()
  return true
}

const floodTracker=new Map()
const deletedMessageCache=new Map()
const lastDeletedByChat=new Map()
const SNIPE_TTL_MS=30*60*1000
function messageCacheKey(key={}){
  return [key.remoteJid||'',key.participant||'',key.id||''].join('|')
}
async function cacheIncomingMessage(sock,msg){
  const chat=msg?.key?.remoteJid
  if(!chat?.endsWith('@g.us') || !msg?.key?.id || msg?.key?.fromMe) return
  const content=unwrapMessageContent(msg.message)
  const type=content ? getContentType(content) : null
  const text=textOf({...msg,message:content}).trim()
  const mediaLabel=type==='imageMessage'?'📷 Foto':type==='videoMessage'?'🎥 Vídeo':type==='audioMessage'?'🎵 Áudio':type==='stickerMessage'?'🖼️ Figurinha':type==='documentMessage'?'📄 Documento':''
  if(!text && !mediaLabel) return

  const supportedMedia=['imageMessage','videoMessage','audioMessage','stickerMessage'].includes(type)
  const mediaNode=type ? content?.[type] : null
  const mimeType=mediaNode?.mimetype || (type==='stickerMessage'?'image/webp':null)
  const rawLength=mediaNode?.fileLength
  const declaredSize=Number(rawLength?.toString?.() || rawLength || 0)
  let mediaBuffer=null

  if(supportedMedia && (!declaredSize || declaredSize<=8*1024*1024)){
    try{
      const downloaded=await downloadMediaMessage(
        msg,
        'buffer',
        {},
        {logger,reuploadRequest:sock.updateMediaMessage}
      )
      if(downloaded?.length && downloaded.length<=8*1024*1024){
        mediaBuffer=Buffer.from(downloaded)
      }else if(downloaded?.length){
        console.log('[Snipe] mídia ignorada por exceder 8 MB')
      }
    }catch(err){
      console.log('[Snipe] não foi possível armazenar mídia:',err?.message||err)
    }
  }else if(supportedMedia && declaredSize>8*1024*1024){
    console.log('[Snipe] mídia ignorada por exceder 8 MB')
  }

  const entry={
    chat,
    messageId:msg.key.id,
    sender:msg.key.participant||chat,
    pushName:msg.pushName||'',
    text,
    mediaLabel,
    mediaType:supportedMedia?type:null,
    mimeType,
    mediaBuffer,
    createdAt:Date.now(),
    expiresAt:Date.now()+SNIPE_TTL_MS
  }
  const key=messageCacheKey(msg.key)
  deletedMessageCache.set(key,entry)
  setTimeout(()=>deletedMessageCache.delete(key),SNIPE_TTL_MS).unref?.()

  try{
    await saveSnipeMessage(entry)
  }catch(err){
    console.error('[Snipe] falha ao persistir mensagem:',err?.message||err)
  }
}

async function rememberDeletedMessage(key,source='unknown'){
  const exact=deletedMessageCache.get(messageCacheKey(key))
  let hit=exact
  if(!hit && key?.id && key?.remoteJid){
    for(const [cacheKey,value] of deletedMessageCache){
      if(cacheKey.endsWith('|'+key.id) && value.chat===key.remoteJid){ hit=value; break }
    }
  }

  try{
    const persisted=await markSnipeDeleted(key?.remoteJid,key?.id)
    if(!hit && persisted) hit=persisted
  }catch(err){
    console.error('[Snipe] falha ao marcar exclusão:',err?.message||err)
  }

  if(!hit){
    console.log('[Snipe] exclusão recebida sem mensagem no cache ('+source+')')
    return false
  }
  const deletedAt=Date.now()
  lastDeletedByChat.set(hit.chat,{...hit,deletedAt})
  console.log('[Snipe] mensagem apagada capturada ('+source+')'+(hit.mediaBuffer?' com mídia':''))
  setTimeout(()=>{
    if(lastDeletedByChat.get(hit.chat)?.deletedAt===deletedAt) lastDeletedByChat.delete(hit.chat)
  },SNIPE_TTL_MS).unref?.()
  return true
}

const quickGameFlows=new Map()
const quickFlowWrites=new Map()
const quickFlowKey=(chat,sender)=>`${chat}|${sender}`
function queueQuickFlowWrite(key,write){
  const pending=(quickFlowWrites.get(key)||Promise.resolve()).catch(()=>{}).then(write)
  quickFlowWrites.set(key,pending)
  pending.catch(err=>console.error('[flow] falha ao persistir menu',err?.message||err))
    .finally(()=>{ if(quickFlowWrites.get(key)===pending) quickFlowWrites.delete(key) })
  return pending
}
function setQuickFlow(chat,sender,stage,data={},ttlMs=90000){
  const key=quickFlowKey(chat,sender)
  const flow={stage,data,expiresAt:Date.now()+ttlMs}
  quickGameFlows.set(key,flow)
  queueQuickFlowWrite(key,()=>saveQuickFlow(key,chat,sender,stage,data,flow.expiresAt))
}
function getQuickFlow(chat,sender){
  const key=quickFlowKey(chat,sender)
  const flow=quickGameFlows.get(key)
  if(!flow) return null
  if(flow.expiresAt<=Date.now()){
    quickGameFlows.delete(key)
    queueQuickFlowWrite(key,()=>deleteQuickFlow(key))
    return null
  }
  return flow
}
async function recoverQuickFlow(chat,sender){
  const key=quickFlowKey(chat,sender)
  await quickFlowWrites.get(key)?.catch(()=>{})
  const stored=await getStoredQuickFlow(key)
  if(!stored) return null
  quickGameFlows.set(key,stored)
  return stored
}
function clearQuickFlow(chat,sender){
  const key=quickFlowKey(chat,sender)
  quickGameFlows.delete(key)
  queueQuickFlowWrite(key,()=>deleteQuickFlow(key))
}

async function showAdminMainMenu(chat,sender,reply){
  setQuickFlow(chat,sender,'admin_main',{},5*60*1000)
  await reply(
`👑 *ADMIN ALPHA BOT*

1️⃣ 👤 Jogadores
2️⃣ 💚 Grupos / assinaturas
3️⃣ 🧾 Pedidos pendentes
4️⃣ ⚙️ Configurações comerciais
5️⃣ 🩺 Diagnóstico
6️⃣ 🆘 Chamados de suporte

🌘 Boss de Evento: automático toda *sexta às 19:00* • controles: *!eventoboss desativar* / *status*
🔥 Evento 2x: *!eventodobro* (20 min) • *!eventodobro 30* • *!eventodobro off*

0️⃣ Sair

_Responda apenas com o número._`
  )
}

async function showMainMenu(chat,sender,reply){
  setQuickFlow(chat,sender,'nav_main',{},90000)
  await reply(
`🤖 *ALPHA BOT — MENU PRINCIPAL*

1️⃣ 👤 Meu perfil
2️⃣ 💰 Economia
3️⃣ 🛒 Itens e inventário
4️⃣ ⚔️ RPG, Dungeon & Pets
5️⃣ 🎮 Minigames & Boss
6️⃣ 📋 Progressão & patrimônio
7️⃣ 🏴 Clãs
8️⃣ 💚 Grupo / assinatura
9️⃣ 🆘 Futebol, utilidades & suporte

🔥 *DESTAQUES 2.0*
🐾 Pets agora dão bônus estratégicos no Boss
👹 Boss de Grupo: sexta 00:00 → sábado 23:59, com recompensas por colocação
🏢 Negócios, upgrades e renda passiva
💼 Carreira no !trabalhar
🚗 Uber com sua frota • 🏍️ iFood com bikes/motos
📚 Catálogo completo: *!comandos*

✨ *Extra rápido:* responda uma foto ou vídeo com *!sticker*.
🖼️ *Seu card:* use *!setfoto* numa foto para personalizar o *!perfil*.

👉 *Responda apenas com o número.*

0️⃣ Sair`
  )
}

async function showCommandsMainMenu(chat,sender,reply){
  setQuickFlow(chat,sender,'commands_main',{},5*60*1000)
  await reply(
`📚 *COMANDOS DO ALPHA*

Todos os comandos de usuário estão organizados abaixo. Comandos administrativos ficam ocultos.

1️⃣ 👤 Perfil, conta, casamento & social
2️⃣ 💰 Economia & diversão
3️⃣ 🛒 Loja, inventário & mercado
4️⃣ 🐾 RPG, combate & PETS
5️⃣ 🎮 Minigames
6️⃣ 📋 Progressão & patrimônio
7️⃣ 🏴 Clãs
8️⃣ 🛡️ Grupo & moderação
9️⃣ ⚽ Futebol, utilidades & suporte

👉 Responda só com o número.
0️⃣ Fechar`
  )
}

function textOf(msg) {
  const m=msg?.message
  return m?.conversation
    || m?.extendedTextMessage?.text
    || m?.imageMessage?.caption
    || m?.videoMessage?.caption
    || ''
}

function mentionsOf(msg) {
  const m=unwrapMessageContent(msg?.message)
  return m?.extendedTextMessage?.contextInfo?.mentionedJid
    || m?.imageMessage?.contextInfo?.mentionedJid
    || m?.videoMessage?.contextInfo?.mentionedJid
    || m?.conversation?.contextInfo?.mentionedJid
    || []
}

function canonicalPlayerJid(jid){
  if(!jid) return jid
  // Baileys pode devolver PNs com device id (ex.: numero:2@s.whatsapp.net).
  // O banco histórico usa numero@s.whatsapp.net; nunca deixe o device criar outro jogador.
  if(jid.endsWith('@s.whatsapp.net')) return jid.replace(/:\\d+(?=@)/,'')
  return jid
}

function normalizedAddressJid(jid){
  return String(jid||'').replace(/:\d+(?=@)/,'')
}

async function resolvePlayerIdentity(sock,chat,jid,msg=null) {
  if(!jid) return {jid,aliases:[]}
  const aliases=new Set([jid])
  let phoneJid=jid.endsWith('@s.whatsapp.net') ? canonicalPlayerJid(jid) : null
  const key=msg?.key||{}
  const jidIsMessageSender=jid===key.participant || jid===key.remoteJid
  if(jidIsMessageSender){
    const altCandidates=[key.participantAlt,key.remoteJidAlt]
    for(const alt of altCandidates){
      if(!alt) continue
      aliases.add(alt)
      if(alt.endsWith('@s.whatsapp.net')) phoneJid=canonicalPlayerJid(alt)
    }
  }

  try{
    if(chat?.endsWith('@g.us')){
      const meta=await sock.groupMetadata(chat)
      const wanted=normalizedAddressJid(jid)
      const part=(meta?.participants||[]).find(p=>
        [p?.id,p?.lid,p?.phoneNumber,p?.pn,p?.jid]
          .some(value=>normalizedAddressJid(value)===wanted)
      )
      for(const value of [part?.phoneNumber,part?.pn,part?.jid,part?.id,part?.lid]){
        if(!value) continue
        aliases.add(value)
        if(value.endsWith('@s.whatsapp.net')) phoneJid=canonicalPlayerJid(value)
      }
    }
  }catch{}

  // Try every LID we collected. This covers both directions used by WhatsApp:
  // a message can arrive by LID while a mention arrives by phone JID, or the
  // opposite. Keeping every alias is what allows the database rows to merge.
  if(!phoneJid){
    for(const alias of aliases){
      if(!alias?.endsWith('@lid')) continue
      try{
        const pn=await sock.signalRepository?.lidMapping?.getPNForLID?.(alias)
        if(pn?.endsWith('@s.whatsapp.net')){
          aliases.add(pn)
          phoneJid=canonicalPlayerJid(pn)
          break
        }
      }catch{}
    }
  }

  return {jid:phoneJid || canonicalPlayerJid(jid),aliases:[...aliases]}
}

async function resolvePlayerJid(sock,chat,jid,msg=null) {
  return (await resolvePlayerIdentity(sock,chat,jid,msg)).jid
}

function unwrapMessageContent(message){
  let current=message
  for(let i=0;i<6;i++){
    const next=current?.ephemeralMessage?.message
      || current?.viewOnceMessage?.message
      || current?.viewOnceMessageV2?.message
      || current?.viewOnceMessageV2Extension?.message
      || current?.documentWithCaptionMessage?.message
      || current?.editedMessage?.message
      || current?.associatedChildMessage?.message
    if(!next) break
    current=next
  }
  return current
}

function stickerMediaOf(msg){
  const supported=new Set(['imageMessage','videoMessage','stickerMessage'])
  const directMessage=unwrapMessageContent(msg?.message)
  const directType=directMessage ? getContentType(directMessage) : null

  if(directType && supported.has(directType)){
    return {
      type:directType,
      raw:{key:msg.key,message:directMessage}
    }
  }

  const directContent=directType ? directMessage?.[directType] : null
  const ctx=directContent?.contextInfo
  const quotedMessage=unwrapMessageContent(ctx?.quotedMessage)
  const quotedType=quotedMessage ? getContentType(quotedMessage) : null

  if(quotedType && supported.has(quotedType)){
    return {
      type:quotedType,
      raw:{
        key:{
          remoteJid:msg?.key?.remoteJid,
          id:ctx?.stanzaId,
          participant:ctx?.participant
        },
        message:quotedMessage
      }
    }
  }

  return null
}

function fmt(n){ return Number(n||0).toLocaleString('pt-BR') }

function lootDispositionPrompt(item,index,total){
  const sellTotal=Number(item.sellUnit||0)*Number(item.qty||0)
  return `🎒 *O QUE FAZER COM O DROP?*\n\n${rarityLabel(item.rarity)} — *${item.name}* ×${item.qty}\n💰 Venda imediata: *R$ ${fmt(sellTotal)}*\n\n1️⃣ Guardar no inventário\n2️⃣ Descartar e vender\n\n📦 Item ${index+1}/${total}`
}

async function beginLootDisposition(chat,sender,result,reply){
  const items=Array.isArray(result?.items)?result.items.filter(i=>Number(i.qty||0)>0):[]
  if(!items.length) return false
  setQuickFlow(chat,sender,'loot_disposition',{items,index:0,soldTotal:0},5*60*1000)
  await reply(lootDispositionPrompt(items[0],0,items.length))
  return true
}

function luckyBoxSummary(r){
  let text=`🎁 *CAIXAS — RESULTADO*\n\n📦 Caixa: *${r.boxName||r.boxId||'Caixa'}*\n📦 Caixas abertas: *${r.opened}*\n`
  if(r.cash>0) text+=`💰 Dinheiro: *R$ ${fmt(r.cash)}*\n`
  if(r.exp>0) text+=`✨ EXP: *+${fmt(r.exp)}*\n`

  const rc=r.rarityCounts||{}
  if(Number(rc.legendary||0)>0) text+=`\n🌟🌟 *LENDÁRIO ENCONTRADO!* ×${rc.legendary}\n`
  if(r.items?.length){
    text+='\n🎒 *Itens recebidos:*\n'
    const order={legendary:5,epic:4,rare:3,uncommon:2,common:1}
    const sorted=[...r.items].sort((a,b)=>(order[b.rarity]||0)-(order[a.rarity]||0))
    for(const item of sorted){
      text+=`   • ${rarityLabel(item.rarity)} — *${item.name}* ×${item.qty}\n`
    }
  }

  text+=`\n📦 Caixas restantes: *${r.remaining}*\n💵 Carteira: *R$ ${fmt(r.balance)}*`
  return text
}
function fmtDate(epoch){
  if(!epoch) return '—'
  return new Date(Number(epoch)*1000).toLocaleString('pt-BR',{
    timeZone:'America/Sao_Paulo',
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit'
  })
}
function groupLicenseStatusText(license,title='🍀 *STATUS DO GRUPO*'){
  if(!license){
    return `${title}\n\nStatus: *AINDA NÃO INICIADO*\nPlano: *Teste grátis*\nValidade: *3 dias após o primeiro comando*`
  }
  const permanent=String(license.plan||'').toLowerCase()==='permanent'
  const plan=permanent?'Permanente':String(license.plan||'—')
  const validity=permanent?'Sem expiração':fmtDate(license.paid_until)
  return `${title}\n\nStatus: *${groupLicenseIsActive(license)?'ATIVO ✅':'INATIVO ❌'}*\nPlano: *${plan}*\nValidade: *${validity}*${permanent?'\n♾️ Acesso vitalício ativo.':''}`
}
function duration(sec){
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60)
  return h ? `${h}h ${m}min` : `${m}min`
}


function alphaTitle(p,patrimony){
  const wins=Number(p?.win||0), level=Number(p?.level||1), total=Number(patrimony||0)
  if(wins>=100) return '👑 Lenda da Arena'
  if(total>=1_000_000) return '💎 Magnata'
  if(level>=100) return '🌌 Lenda Alpha'
  if(wins>=25) return '⚔️ Gladiador'
  if(level>=50) return '🔥 Veterano'
  if(total>=250_000) return '💰 Investidor'
  if(wins>=5) return '🥊 Lutador'
  return '🌱 Novato'
}

function founderBadge(p){
  return Number(p?.created_at||0)>0 && Number(p.created_at)<=1790748000 ? '🍀 FUNDADOR ALPHA' : ''
}

function xpBar(exp,level){
  const needed=Math.max(100,Number(level||1)*100)
  const current=Math.max(0,Math.min(needed,Number(exp||0)))
  const filled=Math.max(0,Math.min(10,Math.floor((current/needed)*10)))
  return {bar:'█'.repeat(filled)+'░'.repeat(10-filled),current,needed}
}

async function sendAlphaProfile(sock,chat,jid,msg,identityAliases=[]){
  const [p,clan,home,cars,motorcycles,businesses,career,pet,pat,streak,ranks]=await Promise.all([
    getCombatProfile(jid),getClanForUser(jid),getHome(jid),getGarage(jid),
    getMotorcycleGarage(jid),getBusinesses(jid),getCareer(jid),getPet(jid),
    getPatrimony(jid),getDailyStreak(jid),getPlayerRanks(jid)
  ])
  if(!p) throw new Error('Perfil não encontrado.')

  const wins=Number(p.win||0),loss=Number(p.loss||0)
  const title=alphaTitle(p,pat.total)
  const badge=founderBadge(p)
  const xp=xpBar(p.exp,p.level)
  const achievements=[
    badge,
    wins>=5?'⚔️ LUTADOR':null,
    wins>=25?'🏆 GLADIADOR':null,
    Number(p.level)>=50?'🔥 VETERANO':null,
    Number(pat.total)>=250000?'💰 INVESTIDOR':null,
    Number(pat.total)>=1000000?'💎 MAGNATA':null,
    Number(streak.bestStreak)>=7?'🔥 7 DIAS':null,
    Number(streak.bestStreak)>=30?'🌟 30 DIAS':null
  ].filter(Boolean)

  const petLine=pet
    ? `🐾 Pet: *${pet.name}* (${pet.species}, Nv.${pet.level}) • ❤️ ${pet.hp}/${petMaxHp(pet.level,pet.xp,pet.species)} • ⚡ ${pet.energy}/${petMaxEnergy(pet.level,pet.species)}`
    : '🐾 Pet: *Nenhum*'

  const text=
`👤 *PERFIL — ${p.push_name||'Jogador'}*
${title}${badge?' • '+badge:''}

⭐ Nível: *${Number(p.level||1)}*
✨ EXP: *${xp.current}/${xp.needed}*
[${xp.bar}]

❤️ HP: *${Number(p.hp||0)}/${Number(p.max_hp||0)}*
⚔️ ATK: *${Number(p.effective_atk||0)}*
🛡️ DEF: *${Number(p.effective_def||0)}*
💨 SPD: *${Number(p.spd||0)}*

🏆 Vitórias: *${wins}*
💀 Derrotas: *${loss}*
🥊 Ranking RPG: *#${Number(ranks.combatRank||0)||'-'}*
💰 Ranking Economia: *#${Number(ranks.economyRank||0)||'-'}*

🪙 Saldo total: *R$ ${fmt(Number(p.cash||0)+Number(p.bank||0))}*
💎 Patrimônio: *R$ ${fmt(Number(pat.total||0))}*
🔥 Daily: *${Number(streak.streak||0)} dia(s)* • Recorde: *${Number(streak.bestStreak||0)}*

🗡️ Arma: *${p.weapon_name||'Sem arma'} Lv.${Number(p.weapon_level||1)}*
🥋 Armadura: *${p.armor_name||'Sem armadura'} Lv.${Number(p.armor_level||1)}*
${petLine}

💼 Carreira: *${career?.rank?.name||'Ajudante'}*
🏴 Clã: *${clan?.name||'Sem clã'}*
🏠 Casa: *${home?.name||'Nenhuma'}*
🚗 Carros: *${Array.isArray(cars)?cars.length:0}*
🏍️ Motos/Bikes: *${Array.isArray(motorcycles)?motorcycles.length:0}*
🏢 Negócios: *${Array.isArray(businesses)?businesses.length:0}*${achievements.length?'\n\n🏅 '+achievements.join(' • '):''}`

  await sock.sendMessage(chat,{text},{quoted:msg})
}

function workResultText(r){
  const eventLine=Number(r.eventMultiplier||1)>1?'🔥 *EVENTO 2X APLICADO — dinheiro e XP profissional já estão dobrados*\n\n':''
  let text=`💼 *TRABALHO — ${r.rank.name.toUpperCase()}*\n\n${eventLine}💵 Bruto: *R$ ${fmt(r.gross)}*\n🧾 *TAXADE te pegou* (${r.taxRate}%): *-R$ ${fmt(r.tax)}*\n💰 Líquido recebido: *R$ ${fmt(r.amount)}*\n📈 XP profissional: *+${r.xpGain}* (${r.careerXp})\n🧾 Expedientes: *${r.totalShifts}*`
  if(r.event) text+=`\n\n${r.event}`
  if(r.promoted) text+=`\n\n🎉 *PROMOÇÃO!*\n${r.oldRank} → *${r.rank.name}*`
  if(r.next) text+=`\n🎯 Próximo cargo: *${r.next.name}* — faltam ${Math.max(0,r.next.xp-r.careerXp)} XP profissional.`
  else text+='\n🏆 Você chegou ao topo da carreira!'
  return text
}

function dailyResultText(r){
  const eventLine=Number(r.eventMultiplier||1)>1?'🔥 *EVENTO 2X APLICADO*\n':''
  let text=`🔥 *DAILY ALPHA*\n\n${eventLine}💰 +R$ ${fmt(r.totalCash)}\n🔥 Sequência: *${r.streak} dia${r.streak===1?'':'s'}*\n🏅 Recorde: *${r.bestStreak} dia${r.bestStreak===1?'':'s'}*`
  if(r.reward){
    text+=`\n\n🎉 *RECOMPENSA DE SEQUÊNCIA!*\n${r.reward.label}`
  }
  if(r.next){
    text+=`\n\n🎯 Próxima recompensa: *Dia ${r.next.day} — ${r.next.label}*`
    if(r.next.days>0) text+=`\n⏳ Faltam *${r.next.days} dia${r.next.days===1?'':'s'}* mantendo a sequência.`
  }
  return text
}

function parseAmount(s){
  if(!s) return 0
  const clean=String(s).replace(/\./g,'').replace(',','.')
  const n=Number(clean)
  return Number.isFinite(n) ? Math.floor(n) : 0
}

function normalizeItemText(value){
  return String(value||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[_-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}

function resolveOwnedItem(items,input,categories=null){
  const allowed=categories ? items.filter(i=>categories.includes(i.category)) : items
  const raw=normalizeItemText(input)
  if(/^\d+$/.test(raw)) return allowed[Number(raw)-1] || null
  return allowed.find(i=>
    normalizeItemText(i.item_id)===raw ||
    normalizeItemText(i.name)===raw
  ) || null
}

const SHOP_IDS=[
  'pocao_p','pocao_m','pocao_g','elixir_supremo','pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','energetico_pet',
  'espada_madeira','espada_ferro','espada_aco','machado_guerra','katana_sombria',
  'espada_flamas','tridente_tempestade','lamina_abissal',
  'armadura_couro','armadura_ferro','armadura_aco','armadura_samurai','armadura_cavaleiro',
  'armadura_dragao','armadura_abissal','armadura_celestial',
  'caixa_sorte','caixa_rara','caixa_epica'
]

const BOX_IDS=['caixa_sorte','caixa_rara','caixa_epica']

const RARITY_META={
  common:['⚪','Comum'],
  uncommon:['🟢','Incomum'],
  rare:['🔵','Raro'],
  epic:['🟣','Épico'],
  legendary:['🟠','Lendário'],
  event:['🌘','Evento Único']
}

function rarityLabel(rarity){
  const [icon,label]=RARITY_META[rarity]||['⚪',String(rarity||'Comum')]
  return `${icon} ${label}`
}

function shopCategoryLabel(category){
  if(category==='consumable') return '🧪 CONSUMÍVEIS'
  if(category==='weapon') return '⚔️ ARMAS'
  if(category==='armor') return '🛡️ ARMADURAS'
  return '🎁 CAIXAS'
}

function shopCategoryItems(items,choice){
  const category={1:'consumable',2:'weapon',3:'armor',4:'special'}[choice]
  if(!category) return []
  return items.filter(i=>i.category===category && SHOP_IDS.includes(i.id))
}


function resolveShopItem(input){
  const raw=String(input||'').toLowerCase().trim()
  if(/^\d+$/.test(raw)){
    const idx=Number(raw)-1
    return SHOP_IDS[idx] || null
  }
  return SHOP_IDS.includes(raw) ? raw : null
}


const FUN_PRICES={
  joke:250,
  horoscope:500
}

const JOKES=[
  'Por que o computador foi ao médico? Porque ele estava com um vírus. 🤧💻',
  'Qual é o café mais perigoso? O ex-presso. ☕😂',
  'O que o zero disse para o oito? Belo cinto! 😄',
  'Por que a matemática ficou triste? Porque tinha muitos problemas. 📚😂',
  'Qual é o animal mais antigo? A zebra, porque ainda é preto e branco. 🦓',
  'O que uma impressora falou para a outra? Essa folha é sua ou é impressão minha? 🖨️😂',
  'Por que o livro de história terminou o namoro? Porque vivia preso ao passado. 📖',
  'O que o tomate foi fazer no banco? Tirar extrato. 🍅💰',
  'Por que o celular foi para a escola? Para melhorar a recepção. 📱😂',
  'Qual é o contrário de volátil? Vem cá, sobrinho. 😅',
  'O que o pato falou para a pata? Vem quá! 🦆',
  'Por que o relógio foi expulso da sala? Porque ficava fazendo hora. ⌚',
  'O que o Wi-Fi disse para o roteador? Sinto uma conexão entre nós. 📶❤️',
  'Por que a moeda foi ao psicólogo? Porque estava sem valor. 🪙😂',
  'Qual é a tecla preferida do astronauta? Espaço. 🚀⌨️',
  'O que o chão falou para a mesa? Você tem quatro pernas e eu que aguento tudo. 😂',
  'Por que o programador levou shampoo para o trabalho? Porque o código tinha muitos bugs. 🐛',
  'Como o elétron atende o telefone? Próton? ⚛️😂',
  'O que a parede falou para a outra? A gente se encontra na esquina. 🧱',
  'Por que o banco de dados terminou o namoro? Faltava relacionamento. 🗄️😂'
]

const SIGNS=[
  ['aries','Áries'],['touro','Touro'],['gemeos','Gêmeos'],['cancer','Câncer'],
  ['leao','Leão'],['virgem','Virgem'],['libra','Libra'],['escorpiao','Escorpião'],
  ['sagitario','Sagitário'],['capricornio','Capricórnio'],['aquario','Aquário'],['peixes','Peixes']
]

const HOROSCOPE_MOODS=[
  'Dia bom para organizar ideias e terminar algo que ficou pela metade.',
  'Uma conversa leve pode trazer uma surpresa positiva.',
  'Vale desacelerar antes de tomar decisões por impulso.',
  'Sua energia favorece criatividade, humor e novos planos.',
  'O dia pede equilíbrio entre diversão e responsabilidade.',
  'Pode surgir uma oportunidade pequena que vale atenção.',
  'Evite gastar energia discutindo por coisas que não importam tanto.',
  'Bom momento para retomar contato com alguém ou um projeto esquecido.',
  'Seu foco tende a melhorar quando você resolve primeiro as tarefas menores.',
  'Hoje a sorte está mais ligada a iniciativa do que a esperar acontecer.'
]

const HOROSCOPE_LUCK=[
  '🍀 Sorte: boa',
  '🍀 Sorte: moderada',
  '🍀 Sorte: aparecendo nos detalhes',
  '🍀 Sorte: melhor no fim do dia',
  '🍀 Sorte: favorece quem arrisca com calma'
]

function dayKeySaoPaulo(){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date())
}

function hashText(text){
  let h=2166136261
  for(const ch of String(text)){
    h^=ch.charCodeAt(0)
    h=Math.imul(h,16777619)
  }
  return h>>>0
}

function jokeText(){
  return JOKES[Math.floor(Math.random()*JOKES.length)]
}

function horoscopeText(signId,signName){
  const seed=hashText(signId+'|'+dayKeySaoPaulo())
  const mood=HOROSCOPE_MOODS[seed%HOROSCOPE_MOODS.length]
  const luck=HOROSCOPE_LUCK[Math.floor(seed/17)%HOROSCOPE_LUCK.length]
  return '🔮 *HORÓSCOPO DO DIA — '+signName.toUpperCase()+'*\n\n'+
    mood+'\n\n'+luck+
    '\n\n_Leitura criada só por diversão/entretenimento._'
}

const PET_STATUS_SPECIALTIES = {
  cachorro:{label:'🐶 Guardião',stat:'defense',base:5},
  gato:{label:'🐱 Instinto',stat:'crit',base:4},
  coelho:{label:'🐰 Agilidade',stat:'dodge',base:4},
  papagaio:{label:'🦜 Motivação',stat:'xp',base:5},
  hamster:{label:'🐹 Sorte',stat:'drop',base:2.5},
  tartaruga:{label:'🐢 Casco',stat:'defense',base:7},
  coruja:{label:'🦉 Sabedoria',stat:'xp',base:8},
  raposa:{label:'🦊 Astúcia',stat:'crit',base:6},
  lobo:{label:'🐺 Caçador',stat:'damage',base:6},
  aguia:{label:'🦅 Precisão',stat:'crit',base:7},
  panda:{label:'🐼 Resistência',stat:'defense',base:8},
  tigre:{label:'🐯 Fúria',stat:'damage',base:7},
  leao:{label:'🦁 Rei da Caçada',stat:'damage',base:8},
  unicornio:{label:'🦄 Bênção',stats:{drop:4,defense:4}},
  dragao:{label:'🐉 Caçador de Boss',stat:'bossDamage',base:10},

  golem_ancestral:{label:'🪨 Muralha Ancestral',stats:{defense:9,drop:2},raid:true},
  urso_runico:{label:'🐻 Fúria Rúnica',stats:{damage:7,defense:6},raid:true},
  colosso_cristal:{label:'💎 Prisma Colossal',stats:{defense:10,drop:4,crit:3},raid:true},

  salamandra_infernal:{label:'🔥 Chama Infernal',stats:{damage:8,crit:4},raid:true},
  dragao_vulcanico:{label:'🐲 Núcleo Vulcânico',stats:{damage:9,defense:5},raid:true},
  fenix_fogo:{label:'🔥 Renascimento Ígneo',stats:{damage:8,dodge:5,xp:5},raid:true},

  corvo_abissal:{label:'👁️ Olho do Abismo',stats:{crit:8,drop:3},raid:true},
  lobo_abismo:{label:'🌑 Predador Abissal',stats:{damage:9,crit:5},raid:true},
  fenix_gelo:{label:'❄️ Alma Glacial',stats:{defense:8,dodge:5,xp:6},raid:true},

  rinoceronte_titanico:{label:'🦏 Investida Titânica',stats:{defense:10,damage:5},raid:true},
  guardiao_obsidiana:{label:'🗿 Guarda Obsidiana',stats:{defense:10,drop:3.5},raid:true},
  leviata_gelo:{label:'🌊 Leviatã Congelado',stats:{defense:10,dodge:6,damage:5},raid:true},

  cerbero_carmesim:{label:'🩸 Três Presas',stats:{damage:10,crit:6},raid:true},
  tigre_lunar:{label:'🌙 Caçador Lunar',stats:{damage:9,dodge:6,drop:3},raid:true},
  imperador_abissal:{label:'👑 Soberano do Abismo',stats:{bossDamage:10,defense:7,drop:4},raid:true},

  leao_solar:{label:'☀️ Rei Solar',stats:{damage:10,crit:7,xp:5},raid:true},
  grifo_celestial:{label:'✨ Asas da Fortuna',stats:{crit:10,dodge:7,drop:4},raid:true},
  fenix_celestial:{label:'🌟 Graça Celestial',stats:{defense:10,dodge:8,xp:8},raid:true},

  serpente_cosmica:{label:'🌌 Oráculo Cósmico',stats:{crit:9,drop:6,xp:8},raid:true},
  dragao_corrompido:{label:'☠️ Ruína Corrompida',stats:{bossDamage:10,damage:8,defense:8},raid:true},
  fenix_alpha:{label:'👑 Fênix Alpha',stats:{damage:10,defense:10,crit:8,dodge:6,drop:7,xp:8},raid:true}
}

function petStatusBonus(p){
  const spec=PET_STATUS_SPECIALTIES[String(p?.species||'').toLowerCase()]
  if(!spec) return {label:'🐾 Companheiro',text:'Sem especialidade cadastrada'}
  const scale=1+Math.min(.25,Math.max(0,Number(p.level||1)-1)*.01)
  const cap=spec.raid?15:10
  const pct=n=>Math.min(cap,Number(n||0)*scale).toLocaleString('pt-BR',{maximumFractionDigits:1})
  const labels={
    damage:'dano',
    bossDamage:'dano contra Boss',
    defense:'defesa',
    crit:'chance de crítico',
    dodge:'esquiva',
    xp:'XP recebido',
    drop:'Lucky/drop'
  }
  const stats=spec.stats||{[spec.stat]:spec.base}
  const parts=Object.entries(stats)
    .filter(([,value])=>Number(value)>0)
    .map(([stat,value])=>`+${pct(value)}% ${labels[stat]||stat}`)
  return {label:spec.label,text:parts.join(' • ')+' no Boss'}
}

async function start() {
  await initDatabase()
  await initCommunityPack()
  await cleanupQuickFlows().catch(err=>console.error('[flow] limpeza inicial falhou',err?.message||err))
  await initGames()
  await initProgression()
  await acquireRuntimeLock(sessionId)
  const { state, saveCreds }=await useNeonAuthState(sessionId)
  const { version }=await fetchLatestBaileysVersion()

  const sock=makeWASocket({
    version,
    auth:{
      creds:state.creds,
      keys:makeCacheableSignalKeyStore(state.keys,logger.child({level:'silent'}))
    },
    logger:logger.child({level:'silent'}),
    browser:Browsers.ubuntu('Chrome'),
    printQRInTerminal:!pairingNumber,
    markOnlineOnConnect:true,
    syncFullHistory:false,
    connectTimeoutMs:60000,
    defaultQueryTimeoutMs:60000,
    keepAliveIntervalMs:25000,
    retryRequestDelayMs:500,
    fireInitQueries:true,
    emitOwnEvents:true,
    enableAutoSessionRecreation:true,
    transactionOpts:{
      maxCommitRetries:3,
      delayBetweenTriesMs:500
    }
  })

  sock.ev.on('creds.update',saveCreds)

  async function runBossEventScheduler(){
    if(trevoHealth.whatsapp!=='open') return
    try{
      const groups=(await listGroupLicenses(500)).filter(groupLicenseIsActive)
      for(const lic of groups){
        const chat=lic.chat_jid
        if(!chat?.endsWith('@g.us')) continue
        try{
          const r=await autoStartBossEvent(chat)
          if(!r?.spawned) continue
          await sock.sendMessage(chat,{text:
`🌘 *BOSS DE EVENTO APARECEU!*

👹 *${r.name}*
❤️ HP: *${Number(r.maxHp).toLocaleString('pt-BR')}*
⚔️ ATK: *${r.atk}*

✨ EXP elevada para jogador
🐾 EXP elevada para o pet
🎁 Top 3 recebe caixa garantida
🏅 Chance de *Insígnia do Eclipse — Evento Único*

⚔️ Usem *${prefix}boss* para ver o status e *${prefix}atacar* para lutar.`
          })
        }catch(err){
          console.error('[BossEvento] falha no grupo',chat,err?.message||err)
        }
      }
    }catch(err){
      console.error('[BossEvento] falha no agendamento',err?.message||err)
    }
  }

  if(bossEventScheduler) clearInterval(bossEventScheduler)
  bossEventScheduler=setInterval(runBossEventScheduler,30*1000)
  bossEventScheduler.unref?.()
  setTimeout(runBossEventScheduler,5000).unref?.()

  let doubleRewardEventScheduler=null

  async function updateDoubleRewardAnnouncements(){
    if(trevoHealth.whatsapp!=='open') return
    try{
      const event=await getDoubleRewardEvent()
      const now=Date.now()
      const raw=(await db.query("SELECT value FROM trevo_settings WHERE key='double_reward_event'")).rows[0]?.value||{}
      const startedAt=Number(raw.startedAt||0)
      const endsAt=Number(raw.endsAt||0)
      if(!startedAt || !endsAt) return

      const eventId=`${startedAt}:${endsAt}`
      const groups=(await listGroupLicenses(500)).filter(groupLicenseIsActive)
      if(event.active && String(raw.startAnnouncementId||'')!==eventId){
        const text=`🔥🔥 *EVENTO 2X COMEÇOU!* 🔥🔥

💰 Dinheiro: *2X*
✨ XP: *2X*
⏱️ Duração: *${Math.max(1,Math.round((endsAt-startedAt)/60000))} minutos*

🏃 Aproveitem! Use *${prefix}evento* para consultar o tempo restante.`
        for(const lic of groups){
          const chat=lic.chat_jid
          if(!chat?.endsWith('@g.us')) continue
          await sock.sendMessage(chat,{text}).catch(err=>console.error('[Evento2x] aviso início',chat,err?.message||err))
        }
        raw.startAnnouncementId=eventId
        await db.query(
          "UPDATE trevo_settings SET value=$1::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE key='double_reward_event'",
          [JSON.stringify(raw)]
        )
        return
      }

      if(!event.active && now>=endsAt && String(raw.startAnnouncementId||'')===eventId && String(raw.endAnnouncementId||'')!==eventId){
        const text=`⏱️ *EVENTO 2X ENCERRADO!*

💰 Dinheiro voltou ao normal.
✨ XP voltou ao normal.

🍀 Até o próximo evento!`
        for(const lic of groups){
          const chat=lic.chat_jid
          if(!chat?.endsWith('@g.us')) continue
          await sock.sendMessage(chat,{text}).catch(err=>console.error('[Evento2x] aviso fim',chat,err?.message||err))
        }
        raw.endAnnouncementId=eventId
        await db.query(
          "UPDATE trevo_settings SET value=$1::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE key='double_reward_event'",
          [JSON.stringify(raw)]
        )
      }
    }catch(err){
      console.error('[Evento2x] falha nos avisos automáticos',err?.message||err)
    }
  }

  if(doubleRewardEventScheduler) clearInterval(doubleRewardEventScheduler)
  doubleRewardEventScheduler=setInterval(updateDoubleRewardAnnouncements,5000)
  doubleRewardEventScheduler.unref?.()
  setTimeout(updateDoubleRewardAnnouncements,3000).unref?.()

  async function senderIsGroupAdmin(chatJid,userJid){
    if(userJid===ownerJid) return true
    if(!chatJid?.endsWith('@g.us')) return false
    try{
      const meta=await sock.groupMetadata(chatJid)
      const p=meta.participants?.find(x=>
        x.id===userJid ||
        x.jid===userJid ||
        x.lid===userJid ||
        x.phoneNumber===userJid
      )
      return Boolean(p?.admin)
    }catch(err){
      console.error('[grupo] falha ao validar admin',err?.message||err)
      return false
    }
  }

  async function groupModuleEnabled(chatJid,key){
    if(!chatJid?.endsWith('@g.us')) return true
    const settings=await getGroupSettings(chatJid)
    return settings?.[key]!==false
  }

  async function currentGroupPlayerJids(chatJid){
    if(!chatJid?.endsWith('@g.us')) return []
    try{
      const meta=await sock.groupMetadata(chatJid)
      const resolved=await Promise.all((meta?.participants||[]).map(async participant=>{
        const candidates=[participant?.phoneNumber,participant?.pn,participant?.id,participant?.jid,participant?.lid].filter(Boolean)
        for(const candidate of candidates){
          const jid=await resolvePlayerJid(sock,chatJid,candidate)
          if(jid?.endsWith('@s.whatsapp.net')) return canonicalPlayerJid(jid)
        }
        return null
      }))
      return [...new Set(resolved.filter(Boolean))]
    }catch(err){
      console.error('[ranking] falha ao listar participantes',err?.message||err)
      return []
    }
  }

  async function showShopCategoryMenu(chat,sender,reply){
    setQuickFlow(chat,sender,'shop_category',{},90000)
    await reply(
`🍀 *LOJA DO ALPHA BOT*

1️⃣ 🧪 Consumíveis
2️⃣ ⚔️ Armas
3️⃣ 🛡️ Armaduras
4️⃣ 🎁 Caixas
5️⃣ 🎭 Diversão
6️⃣ 🚗 Carros
7️⃣ 🚲🏍️ Bicicletas e motos
8️⃣ 🔑 Chaves de Raid

0️⃣ Sair

_Responda só com o número._`
    )
  }

  async function showBoxQuantityMenu(chat,sender,reply,box){
    const stock=Number(box?.quantity||0)
    setQuickFlow(chat,sender,'inventory_box_qty',{
      boxId:box.item_id,
      boxName:box.name,
      stock
    },90000)
    await reply(
`🎁 *${box.name.toUpperCase()}*

Você possui: *${stock}*

1️⃣ Abrir 1
2️⃣ Abrir 5
3️⃣ Abrir 10
4️⃣ Abrir todas
5️⃣ Escolher quantidade

9️⃣ Voltar
0️⃣ Sair`
    )
  }

  async function showInventoryMenu(chat,sender,reply){
    const items=await getInventory(sender)
    if(!items.length){
      clearQuickFlow(chat,sender)
      await reply('🎒 Seu inventário está vazio.')
      return
    }
    const equip=items.filter(i=>['weapon','armor'].includes(i.category))
    const potions=items.filter(i=>i.category==='consumable')
    const boxes=items.filter(i=>BOX_IDS.includes(i.item_id))
    const others=items.filter(i=>!['weapon','armor','consumable'].includes(i.category) && !BOX_IDS.includes(i.item_id))
    setQuickFlow(chat,sender,'inventory_category',{},5*60*1000)
    await reply(
      '🎒 *INVENTÁRIO*\n\n'+
      '1️⃣ ⚔️ Equipamentos — '+equip.length+' tipos\n'+
      '2️⃣ 🧪 Consumíveis — '+potions.reduce((a,i)=>a+Number(i.quantity),0)+' un.\n'+
      '3️⃣ 🎁 Caixas — '+boxes.reduce((a,i)=>a+Number(i.quantity),0)+' un.\n'+
      '4️⃣ 📦 Outros — '+others.length+' tipos\n'+
      '5️⃣ 💰 Vender itens\n\n'+
      '0️⃣ Sair'
    )
  }

  async function showEquipmentMenu(chat,sender,reply){
    const [items,p,upgradeables]=await Promise.all([getInventory(sender),getCombatProfile(sender),listUpgradeableEquipment(sender)])
    const equipables=items.filter(i=>['weapon','armor'].includes(i.category))
    const levelMap=new Map(upgradeables.map(i=>[i.item_id,Number(i.level||1)]))
    if(!equipables.length){
      clearQuickFlow(chat,sender)
      await reply('⚙️ Você não possui arma ou armadura para equipar.')
      return
    }
    setQuickFlow(chat,sender,'equip_select',{items:equipables.map(i=>i.item_id)},5*60*1000)
    let text='⚙️ *EQUIPAMENTOS*\n\n'
    text+='🗡️ Arma atual: *'+p.weapon_name+' Lv.'+Number(p.weapon_level||1)+'*'+(p.weapon_atk?' +'+p.weapon_atk+' ATK':'')+'\n'
    text+='🛡️ Armadura atual: *'+p.armor_name+' Lv.'+Number(p.armor_level||1)+'*'+(p.armor_def?' +'+p.armor_def+' DEF':'')+'\n\n'
    equipables.forEach((i,idx)=>{
      const info=getEquipmentInfo(i.item_id)
      const stat=i.category==='weapon' ? '+'+Number(info?.atk||0)+' ATK' : '+'+Number(info?.def||0)+' DEF'
      const active=(p.weapon_id===i.item_id || p.armor_id===i.item_id) ? ' ✅ *ATIVO*' : ''
      text+='*'+(idx+1)+'.* '+rarityLabel(i.rarity)+' — *'+i.name+' Lv.'+Number(levelMap.get(i.item_id)||1)+'* ×'+i.quantity+'\n   '+stat+active+'\n'
    })
    text+='\n9️⃣ Voltar\n0️⃣ Sair'
    await reply(text)
  }

  async function showSellMenu(chat,sender,reply){
    const items=await getInventory(sender)
    if(!items.length){
      clearQuickFlow(chat,sender)
      await reply('💰 Você não possui itens para vender.')
      return
    }
    setQuickFlow(chat,sender,'inventory_sell_select',{items},5*60*1000)
    let text='💰 *VENDER ITENS*\n\n'
    items.forEach((i,idx)=>{
      text+='*'+(idx+1)+'.* '+rarityLabel(i.rarity)+' — *'+i.name+'* ×'+i.quantity+'\n   Venda: *R$ '+fmt(i.sell_unit)+' cada*\n'
    })
    text+='\n👉 Um item: mande só o número.\n📦 Vários itens: mande os números separados por vírgula. Ex.: *1,3,5*\n_No lote, o Alpha Bot vende as cópias repetidas e mantém 1 de cada. Lendários ficam de fora._\n\n⚠️ Equipamento ativo mantém 1 cópia protegida.\n9️⃣ Voltar\n0️⃣ Sair'
    await reply(text)
  }
  async function handleQuickGameFlow({chat,sender,body,reply,msg,isOwner=false,isGroup=false}){
    let flow=getQuickFlow(chat,sender)
    if(!flow){
      flow=await recoverQuickFlow(chat,sender)
    }
    if(!flow) return false
    let nativeFlowSelection=''
    try{
      const params=msg?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
      if(params){
        const parsed=JSON.parse(params)
        nativeFlowSelection=parsed?.id || parsed?.row_id || parsed?.selectedRowId || ''
      }
    }catch{}
    const listSelection=
      nativeFlowSelection ||
      msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      msg?.message?.templateButtonReplyMessage?.selectedId ||
      msg?.message?.buttonsResponseMessage?.selectedButtonId ||
      ''
    const rawInput=String(listSelection || body || '').trim()
    const input=rawInput.toLowerCase()

    if(['0','sair','cancelar','cancel'].includes(input)){
      clearQuickFlow(chat,sender)
      await reply('✅ Menu encerrado. Use *!menu* ou *!games* quando quiser abrir novamente.')
      return true
    }

    const gamesMenu=async()=>{
      setQuickFlow(chat,sender,'main',{},90000)
      await reply(
`🎮 *MINIGAMES DO ALPHA BOT*

1️⃣ 🎰 Roleta
2️⃣ 🪙 Cara ou Coroa
3️⃣ ✊ Pedra, Papel e Tesoura
4️⃣ 🔤 Forca
5️⃣ 🧠 Quiz
6️⃣ 🔢 Adivinhe o Número
7️⃣ 👹 Boss

0️⃣ Sair`
      )
    }

    const commandPages={
      '1':`👤 *PERFIL, CONTA & SOCIAL*

*!perfil* — mostra seu perfil completo em texto
*!perfil @pessoa* — vê o perfil de outra pessoa em texto
*!daily* — coleta a recompensa diária
*!streak* — mostra sua sequência
*!dormir* — descansa protegido e recebe XP ao acordar
*!acordar* — interrompe o sono pagando uma taxa que cai conforme o fim se aproxima
*!casar @pessoa* — envia pedido de casamento
*!aceitarcasamento @pessoa* — aceita o pedido
*!casal* — mostra seu relacionamento
*!divorciar* — encerra o relacionamento
*!conquistas* — badges e objetivos desbloqueados
*!ping* — verifica se o Alpha está online

🔁 *Atalhos também aceitos:* !profile, !diario, !sequencia, !sequência, !sono, !achievements, !ajuda, !help

9️⃣ Voltar • 0️⃣ Fechar`,
      '2':`💰 *ECONOMIA & DIVERSÃO*

*!economia* — abre o menu de economia
*!saldo* — carteira, banco e total
*!evento* — mostra se o evento 2x de dinheiro/XP está ativo
*!trabalhar* — trabalha, ganha dinheiro e evolui sua carreira
*!all* — faz Trabalho + Uber + iFood disponíveis de uma vez (TAXADE 3×); não coleta negócios
*!carreira* — mostra cargo e progresso profissional
*!ifood* — coloca toda sua frota de bike/motos para entregar
*!ifoodbike* — alias do !ifood
*!uber* — coloca todos os seus carros para trabalhar
*!negocios* — catálogo de negócios e renda passiva
*!comprarnegocio N* — compra um negócio
*!meusnegocios* — mostra negócios e permite upgrade
*!coletar* — coleta o lucro acumulado
*!motos* — loja de bicicleta e motos
*!comprarmoto N* — compra bicicleta ou moto
*!minhasmotos* — mostra seus veículos de delivery
*!venderbike N* — vende bicicleta por 70% do valor pago
*!vendermoto N* — vende moto por 70% do valor pago
*!depositar valor* / *!depositar total* — deposita no banco
*!sacar valor* — saca do banco
*!pix @pessoa valor* — transfere dinheiro
*!ranking* — ranking dos mais ricos
*!piada* — piada do Alpha
*!horoscopo* — horóscopo do dia
*!dado* — joga um dado
*!chance* — gera uma porcentagem
*!escolher A | B* — Alpha escolhe uma opção
*!ship @pessoa @pessoa* — compatibilidade
*!verdade* — pergunta de verdade
*!desafio* — gera um desafio

🔁 *Atalhos também aceitos:* !balance, !bal, !work, !trampo, !emprego, !profissao, !profissão, !deposit, !withdraw, !saque, !transfer, !transferir, !joke, !horóscopo, !negócios, !comprarnegócio, !meusnegócios, !motocicletas

9️⃣ Voltar • 0️⃣ Fechar`,
      '3':`🛒 *LOJA, INVENTÁRIO & MERCADO*

*!itens* — abre o menu de itens
*!loja* — loja completa (itens, carros, bike e motos)
*!comprar item quantidade* — compra da loja
*!inventario* — abre seu inventário
*!vender* — vende itens ao sistema
*!venderrepetidos* — vende equipamentos repetidos e mantém 1 de cada
*!equipar* — equipa arma ou armadura
*!uparitem* — melhora arma/armadura do Lv.1 ao Lv.10
*!usar* — usa um consumível
*!curarpet* — usa automaticamente a menor poção suficiente para curar o pet\n*!curarpet comum|rara|epica* — escolhe a poção de cura do pet\n*!energiapet* — usa Energético Pet e restaura 100% da energia do pet ativo

🏪 *Mercado entre jogadores*
*!mercado* — lista anúncios e mostra quanto tempo falta para expirar
*!anunciar* — anuncia um item por 1 hora; se não vender, volta ao inventário
*!comprar#3* / *!comprar #3* — abre o anúncio #3 e confirma a compra
*!compraritem* — abre a lista de anúncios
*!cancelarvenda ID* — cancela seu anúncio

🔁 *Atalhos também aceitos:* !item, !shop, !buy, !inv, !inventory, !mochila, !sell, !venderduplicados, !melhoraritem, !upgradeitem, !use, !comprarmercado, !concessionaria, !concessionária, !garagemmotos, !meuscarros, !venderbicicleta

9️⃣ Voltar • 0️⃣ Fechar`,
      '4':`⚔️ *RPG, COMBATE & PETS*

*!rpg* — abre o menu de RPG
*!status* — mostra seus atributos
*!batalhar @pessoa* — desafia outro jogador
*!dungeon* — entra em uma dungeon e ganha dinheiro/XP
*!curar* — recupera HP usando cura disponível
*!roubar @pessoa* / *!fazoL @pessoa* — tenta roubar
*!rankingrpg* — ranking de combate

⚔️ *Raids cooperativas*
*!raid* — lista as Raids e mostra a Raid ativa
*!raid 20* — abre a Raid Lv.20
*!chaveraid 20* — compra a chave da Raid
*!entrar* — entra na sala aberta
*!go* — host inicia (mínimo 2 jogadores)
*!cancelarraide* — host cancela antes de começar
🔑 As chaves também ficam em *!loja → Chaves de Raid*
🏆 Recompensas são proporcionais ao dano: dinheiro, XP, XP de pet e drops específicos

🐾 *Pets*
*!pet* / *!pets* — catálogo rápido dos pets
*!adotar* — lista os 15 pets, preços e níveis\n*!adotar cachorro Nome* — adiciona um pet à coleção\n*!invocarpet* — abre o Altar de Pets Lendários\n*!altarpets* — atalho para o altar lendário
*!meuspets* — mostra todos os seus pets
*!usarpet ID* — troca o pet ativo
*!meupet* / *!statuspet* — mostra seu pet ativo e evolução
*!nomepet NovoNome* — troca o nome por R$ 1.000
🐾 *Pets têm especialidades:* dano, defesa, crítico, esquiva, XP, drop ou bônus contra Boss
*!alimentar* — alimenta
*!descansar* — recupera 30 de energia + 35% do HP do pet (30 min)
🧪 *Poções de Pet:* Comum +60 HP • Rara +160 HP • Épica +320 HP\n⚡ *Energético Pet:* R$ 12.000 na loja; restaura 100% da energia instantaneamente
*!banho* — cuidado cosmético opcional
*!passear* — passeia
*!treinarpet* — treina
*!aventurapet* — manda para aventura
*!petaventura* — gasta toda a energia e retorna com dinheiro e XP
*!rankpet* — ranking de pets
*!duelopet @pessoa* — duelo entre pets

🔁 *Atalhos também aceitos:* !battle, !batalha, !masmorra, !roubo, !rankrpg, !toprpg, !raidstatus, !lojalendaria, !fazol

9️⃣ Voltar • 0️⃣ Fechar`,
      '5':`🎮 *MINIGAMES*

*!games* / *!minigames* — menu de jogos
*!roleta valor cor* — roleta
*!cara valor* / *!coroa valor* — cara ou coroa
*!cara @pessoa valor* + *!aceitar* — duelo valendo dinheiro
*!ppt pedra|papel|tesoura* — contra o Alpha
*!ppt @pessoa 5000 pedra* — desafia jogador valendo dinheiro
*!aceitarppt pedra* — aceita desafio de PPT
*!roletagrupo 5000 vermelho* / *!roleta grupo ...* — abre coletiva
*!entrarroleta 5000 preto* / *!apostar ...* — entra na coletiva
*!girarroleta* / *!girar* — criador gira a roleta
*!torneio 5000* — cria torneio com aposta
*!entrartorneio* — entra no torneio
*!iniciartorneio* — criador inicia
*!forca* — inicia a forca
*!letra a* — tenta uma letra
*!palavra resposta* — tenta a palavra
*!quiz* — inicia quiz
*1 / 2 / 3 / 4* — responde diretamente ao quiz ativo
*!resposta 1* — forma alternativa de responder
*!numero* — adivinhe o número
*!chute 50* — dá um palpite
*!boss* — inicia/mostra o Boss de Grupo; quando houver Boss de Evento ativo, ele tem prioridade
*!atacar* — inicia uma sessão automática de até 5 min (1 ataque a cada 10s)
🎁 *Drops do Boss:* Poção Grande, Elixir Supremo, Lâmina Abissal, Armadura Abissal, Excalibur e Armadura do Titã
🌘 *Boss de Evento:* toda sexta às 19:00 • muita EXP para jogador e pet + chance de item de raridade Evento Único
🐾 Seu pet participa com bônus próprio; o bot usa poção automaticamente se você cair

🔁 *Atalhos também aceitos:* !jogos, !minigame, !adivinhar

9️⃣ Voltar • 0️⃣ Fechar`,
      '6':`📋 *PROGRESSÃO & PATRIMÔNIO*

*!progressao* — menu de progressão
*!missoes* — missões diárias
*!resgatarmissoes* — coleta recompensas
*!casas* — lista imóveis
*!comprarcasa número* — compra imóvel
*!minhacasa* — mostra sua casa
*!carros* — concessionária com carros reais: Corsa, HB20, Civic Type R, Porsche, Ferrari, Lamborghini, McLaren e Bugatti
*!comprarcarro número* — compra carro
*!garagem* — mostra seus carros
*!vendercarro N* — vende carro por 70% do valor pago
*!motos* — bicicletas e motos
*!comprarmoto N* — compra veículo de delivery
*!minhasmotos* — garagem de delivery
*!venderbike N* / *!vendermoto N* — revende com 30% de desvalorização
*!negocios* — catálogo de negócios
*!comprarnegocio N* — compra negócio
*!meusnegocios* — mostra negócios e permite upgrade
*!coletar* — coleta renda passiva

🤝 *Missões coletivas & eventos*
*!missaogrupo* / *!missao* — status, objetivo e ranking da missão coletiva
*!missaostatus* / *!statusmissao* — atalhos para o status
*!resgatarmissao* — resgata sua parte proporcional do prêmio
*!pegar* — pega um evento aleatório ativo no grupo

💎 *Patrimônio*
*!patrimonio* — total com dinheiro, itens, imóvel, carros, motos/bike e negócios
*!rankingpatrimonio* — ranking de patrimônio

🔁 *Atalhos também aceitos:* !progressão, !progresso, !missions, !missões, !claimmissions, !missão, !missãogrupo, !missãocoletiva, !missaocoletiva, !missãostatus, !statusmissão, !resgatarmissão, !imoveis, !imóveis, !patrimônio, !rankingpatrimônio, !toppatrimonio

9️⃣ Voltar • 0️⃣ Fechar`,
      '7':`🏴 *CLÃS*

*!clans* — menu de clãs
*!cla* — mostra seu clã/cofre
*!claajuda* — ajuda de clãs
*!criarcla Nome* — cria um clã
*!claconvidar @pessoa* — convida
*!claaceitar* — aceita convite
*!clapromover @pessoa* — transfere liderança
*!claexpulsar @pessoa* — expulsa membro
*!cladoar valor* — doa ao cofre
*!rankingclas* — ranking
*!saircla* — sai do clã

🔁 *Atalhos também aceitos:* !clã, !clãs, !clas, !clanes, !clãsmenu, !clacofre, !criarclã, !convidarcla, !clãconvidar, !aceitarcla, !clãaceitar, !clãajuda, !doarcla, !clãdoar, !clãpromover, !clãexpulsar, !sairclã, !topclas

9️⃣ Voltar • 0️⃣ Fechar`,
      '8':`💚 *GRUPO & MODERAÇÃO*

*!grupo* — menu do grupo
*!statusgrupo* — status da assinatura
*!assinar* — cria/renova assinatura
*!pedido CODIGO* — consulta pedido
*!termos* — termos resumidos
*!configgrupo* — painel de módulos (ADM do grupo)
*!regras* — mostra as regras
*!setregras texto* — define regras (ADM)
*!advertir @pessoa* — registra aviso (ADM)
*!avisos @pessoa* — consulta avisos
*!limparavisos @pessoa* — zera avisos (ADM)
*!topativo* — ranking de atividade dos últimos 7 dias
*!abrirgrupo* — libera mensagens (ADM)
*!fechargrupo* — restringe mensagens (ADM)
*!banir @pessoa* — remove participante (ADM)
*!expulsar @pessoa* — alias de !banir (ADM)
*!promover @pessoa* — promove a ADM
*!rebaixar @pessoa* — remove ADM

⚙️ No *!configgrupo*: Anti-link, Anti-palavrão, Anti-delete, Antiflood, Boas-vindas e módulos do Alpha.

🔁 *Atalhos também aceitos:* !assinatura, !plano, !preco, !pedidos, !configuragrupo, !rules, !atividade, !kick

9️⃣ Voltar • 0️⃣ Fechar`,
      '9':`⚽ *FUTEBOL, UTILIDADES & SUPORTE*

⚽ *Futebol*
*!futebol* — ajuda de futebol
*!partidas* — jogos brasileiros de hoje
*!partidas amanha* — jogos de amanhã
*!tabela* — Brasileirão Série A
*!time Corinthians* — resumo do clube

🛠️ *Utilidades & resenha*
*!sticker* / *!s* / *!fig* — cria figurinha
*!snipe* — última mensagem apagada do grupo
*!xingar @pessoa* — meme aleatório
*!arrogante @pessoa* — meme
*!gado @pessoa* — meme
*!burro @pessoa* — meme
*!menu* — menu principal
*!comandos* — este catálogo

🆘 *Suporte*
*!suporte* — abre chamado
*!chamado CODIGO* — consulta chamado

🔁 *Atalhos também aceitos:* !fut, !jogoshoje, !brasileirao, !brasileirão, !clube, !figurinha, !stiker, !apagada, !apagou, !cmds, !commands, !support

9️⃣ Voltar • 0️⃣ Fechar`
    }

    const commandsMenu=async()=>{
      setQuickFlow(chat,sender,'commands_main',{},5*60*1000)
      await reply(
`📚 *COMANDOS DO ALPHA*

Todos os comandos de usuário estão organizados abaixo. Comandos administrativos ficam ocultos.

1️⃣ 👤 Perfil, conta, casamento & social
2️⃣ 💰 Economia & diversão
3️⃣ 🛒 Loja, inventário & mercado
4️⃣ 🐾 RPG, combate & PETS
5️⃣ 🎮 Minigames
6️⃣ 📋 Progressão & patrimônio
7️⃣ 🏴 Clãs
8️⃣ 🛡️ Grupo & moderação
9️⃣ ⚽ Futebol, utilidades & suporte

👉 Responda só com o número.
0️⃣ Fechar`
      )
    }

    const commandCategory=async(input)=>{
      const page=commandPages[input]
      if(!page) return false
      setQuickFlow(chat,sender,'commands_category',{},5*60*1000)
      await reply(page)
      return true
    }
    const adminMainMenu=async()=>{
      setQuickFlow(chat,sender,'admin_main',{},5*60*1000)
      await reply(
`👑 *ADMIN ALPHA BOT*

1️⃣ 👤 Jogadores
2️⃣ 💚 Grupos / assinaturas
3️⃣ 🧾 Pedidos pendentes
4️⃣ ⚙️ Configurações comerciais
5️⃣ 🩺 Diagnóstico
6️⃣ 🆘 Chamados de suporte

🔥 Evento 2x: *!eventodobro* (20 min) • *!eventodobro off*

0️⃣ Sair

_Responda apenas com o número._`
      )
    }

    const adminPlayersMenu=async()=>{
      setQuickFlow(chat,sender,'admin_players',{},5*60*1000)
      await reply(
`👤 *ADMIN — JOGADORES*

1️⃣ Adicionar saldo
2️⃣ Remover saldo
3️⃣ Adicionar EXP
4️⃣ Alterar nível
5️⃣ Curar jogador
6️⃣ Dar item
7️⃣ Resetar / ajustar jogador

9️⃣ Voltar
0️⃣ Sair`
      )
    }

    const adminGroupsMenu=async()=>{
      setQuickFlow(chat,sender,'admin_groups',{},5*60*1000)
      await reply(
`💚 *ADMIN — GRUPOS*

1️⃣ Status deste grupo
2️⃣ Ativar este grupo por 30 dias
3️⃣ Ativar por outro período
4️⃣ Tornar este grupo permanente
5️⃣ Bloquear este grupo
6️⃣ Ver grupos registrados

9️⃣ Voltar
0️⃣ Sair`
      )
    }

    const adminOrdersMenu=async()=>{
      const rows=await listPendingSubscriptionOrders(30)
      const codes=rows.map(r=>r.code)
      setQuickFlow(chat,sender,'admin_orders',{codes},5*60*1000)
      if(!rows.length){
        await reply(
`🧾 *PEDIDOS PENDENTES*

Nenhum pedido pendente agora.

9️⃣ Voltar
0️⃣ Sair`
        )
        return
      }
      let text='🧾 *PEDIDOS PENDENTES*\n\n'
      rows.forEach((r,i)=>{
        text+=`${i+1}️⃣ *${r.code}* — R$ ${Number(r.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}\n`
      })
      text+='\n👉 Escolha o número do pedido.\n\n9️⃣ Voltar\n0️⃣ Sair'
      await reply(text)
    }

    const adminSettingsMenu=async()=>{
      setQuickFlow(chat,sender,'admin_settings',{},5*60*1000)
      await reply(
`⚙️ *ADMIN — CONFIGURAÇÕES*

1️⃣ Ver preço atual
2️⃣ Alterar preço
3️⃣ Alterar link de pagamento

9️⃣ Voltar
0️⃣ Sair`
      )
    }

    const supportMenu=async()=>{
      setQuickFlow(chat,sender,'support_menu',{},10*60*1000)
      await reply(
`🆘 *SUPORTE ALPHA BOT*

Como podemos ajudar?

1️⃣ 💳 Pagamento / assinatura
2️⃣ 🛠️ Problema técnico
3️⃣ ❓ Dúvida sobre comandos
4️⃣ 🐞 Reportar erro / bug
5️⃣ 💬 Outro assunto

0️⃣ Sair`
      )
    }

    const adminSupportMenu=async()=>{
      const rows=await listOpenSupportTickets(30)
      const codes=rows.map(r=>r.code)
      setQuickFlow(chat,sender,'admin_support',{codes},10*60*1000)

      if(!rows.length){
        await reply(
`🆘 *CHAMADOS DE SUPORTE*

Nenhum chamado aberto agora.

9️⃣ Voltar
0️⃣ Sair`
        )
        return
      }

      let text='🆘 *CHAMADOS DE SUPORTE*\n\n'
      rows.forEach((r,i)=>{
        const preview=String(r.message||'').replace(/\s+/g,' ').slice(0,55)
        text+=`${i+1}. *${r.code}* — ${r.category}\n   ${preview}${String(r.message||'').length>55?'…':''}\n\n`
      })
      text+='👉 Escolha o número do chamado.\n\n9️⃣ Voltar\n0️⃣ Sair'
      await reply(text.trim())
    }

    const adminBackFor=async(action)=>{
      if(['addsaldo','remsaldo','addexp','setnivel','curar','daritem','setsaldo','resetsaldo','resetxp','resetinventory','resettotal'].includes(action)) return adminPlayersMenu()
      if(['activategroup','activategrouppermanent','blockgroup'].includes(action)) return adminGroupsMenu()
      if(['approveorder','cancelorder'].includes(action)) return adminOrdersMenu()
      if(['setprice','setlink'].includes(action)) return adminSettingsMenu()
      return adminMainMenu()
    }

    const shopCategoryMenu=async()=>showShopCategoryMenu(chat,sender,reply)
    const boxQuantityMenu=async(box)=>showBoxQuantityMenu(chat,sender,reply,box)
    const inventoryMenu=async()=>showInventoryMenu(chat,sender,reply)
    const equipmentMenu=async()=>showEquipmentMenu(chat,sender,reply)
    const sellMenu=async()=>showSellMenu(chat,sender,reply)
    const funMenu=async()=>{
      setQuickFlow(chat,sender,'fun_shop',{},90000)
      await reply(
`🎭 *DIVERSÃO*

1️⃣ 😂 Piada do Alpha Bot — R$ ${fmt(FUN_PRICES.joke)}
2️⃣ 🔮 Horóscopo do dia — R$ ${fmt(FUN_PRICES.horoscope)}

9️⃣ Voltar
0️⃣ Sair`
      )
    }

    const horoscopeSignMenu=async()=>{
      setQuickFlow(chat,sender,'horoscope_sign',{},90000)
      let text='🔮 *ESCOLHA SEU SIGNO*\n\n'
      SIGNS.forEach((s,i)=>text+='*'+(i+1)+'.* '+s[1]+'\n')
      text+='\n9️⃣ Voltar\n0️⃣ Sair'
      await reply(text)
    }

    const afterGame=async(game,data,text)=>{
      setQuickFlow(chat,sender,'game_after',{game,...data},5*60*1000)
      await reply(
`${text}

1️⃣ *Jogar novamente*
2️⃣ Voltar aos minigames
9️⃣ Menu principal
0️⃣ Sair`
      )
    }

    const askBet=(stage)=> {
      setQuickFlow(chat,sender,stage,{},90000)
      return reply(
`💰 *QUANTO QUER APOSTAR?*

1️⃣ R$ 100
2️⃣ R$ 500
3️⃣ R$ 1.000
4️⃣ Outro valor

_Responda só com 1, 2, 3 ou 4. Digite 0 para sair._`
      )
    }

    if(flow.stage==='loot_disposition'){
      const items=Array.isArray(flow.data?.items)?flow.data.items:[]
      const index=Math.max(0,Number(flow.data?.index||0))
      const item=items[index]
      if(!item){
        clearQuickFlow(chat,sender)
        await reply('✅ Drops processados.')
        return true
      }
      if(input!=='1'&&input!=='2'){
        await reply('🎒 Escolha *1 Guardar* ou *2 Descartar e vender*.')
        return true
      }

      let soldTotal=Number(flow.data?.soldTotal||0)
      if(input==='2'){
        try{
          const sold=await sellItem(sender,item.itemId,Number(item.qty||1))
          soldTotal+=Number(sold.total||0)
          await reply(`💰 *VENDIDO!*\n${rarityLabel(item.rarity)} — *${item.name}* ×${item.qty}\n💵 Recebido: *R$ ${fmt(sold.total)}*`)
        }catch(err){
          await reply('❌ '+(err?.message||'Não foi possível vender esse drop. Ele foi mantido no inventário.'))
        }
      }else{
        await reply(`✅ *GUARDADO!*\n${rarityLabel(item.rarity)} — *${item.name}* ×${item.qty}`)
      }

      const nextIndex=index+1
      if(nextIndex>=items.length){
        clearQuickFlow(chat,sender)
        await reply(`✅ *DROPS PROCESSADOS*\n\n💰 Total vendido agora: *R$ ${fmt(soldTotal)}*\n🎒 O restante ficou no inventário.`)
        return true
      }

      setQuickFlow(chat,sender,'loot_disposition',{items,index:nextIndex,soldTotal},5*60*1000)
      await reply(lootDispositionPrompt(items[nextIndex],nextIndex,items.length))
      return true
    }

    if(flow.stage==='wake_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('😴 Tudo bem. Você continua dormindo normalmente.')
        return true
      }
      if(input!=='1'){
        await reply('⏰ Escolha *1 para acordar agora* ou *2 para continuar dormindo*.')
        return true
      }
      try{
        const r=await wakePlayerEarly(sender)
        clearQuickFlow(chat,sender)
        if(r.natural){
          await reply(`☀️ *VOCÊ ACORDOU!*\n🏠 Descanso: *${r.place}*\n✨ XP recebido: *+${r.xp}*\n💰 Taxa: *R$ 0*`)
        }else{
          const petLine=r.petEnergy?.gained ? `\n🐾 Pet recuperou: *+${r.petEnergy.gained} energia*` : ''
          await reply(`⏰ *ACORDOU MAIS CEDO!*\n\n🏠 Local: *${r.place}*\n💸 Taxa cobrada: *R$ ${fmt(r.fee)}*\n✨ XP proporcional recebido: *+${r.xp}*${petLine}\n\n✅ Despertar confirmado.`)
        }
      }catch(err){
        clearQuickFlow(chat,sender)
        await reply('❌ '+(err?.message||'Não foi possível acordar agora.'))
      }
      return true
    }

    if(flow.stage==='legendary_pet_summon_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Invocação cancelada.')
        return true
      }
      if(input!=='1'){
        await reply('🔮 Escolha *1 para invocar* ou *2 para cancelar*.')
        return true
      }
      try{
        const r=await summonLegendaryPet(sender,flow.data.materialId)
        clearQuickFlow(chat,sender)
        await reply(`✨ *INVOCAÇÃO LENDÁRIA!*\n\n🔮 Altar Lv.${r.altar.raidLevel}\n🧩 ${r.altar.summonCost||100} × ${r.altar.materialName} consumidos\n\n🐾 Você invocou: *${r.pet.name}*\n🎲 Chance: *${r.pet.chance}%*\n⚡ Poder inicial: *${r.pet.power}*\n📦 Materiais restantes: *${r.remaining}*\n\nO pet foi adicionado à coleção. Use *!meuspets* e *!usarpet ID* para ativá-lo.`)
      }catch(err){
        clearQuickFlow(chat,sender)
        await reply('❌ '+(err?.message||'Não foi possível concluir a invocação.'))
      }
      return true
    }

    if(flow.stage==='support_menu'){
      const categories={
        '1':['pagamento','💳 Pagamento / assinatura'],
        '2':['tecnico','🛠️ Problema técnico'],
        '3':['comandos','❓ Dúvida sobre comandos'],
        '4':['bug','🐞 Erro / bug'],
        '5':['outro','💬 Outro assunto']
      }
      const selected=categories[input]
      if(!selected){
        await reply('🆘 Escolha uma opção de *1 a 5* ou *0* para sair.')
        return true
      }
      setQuickFlow(chat,sender,'support_message',{category:selected[0],label:selected[1]},15*60*1000)
      await reply(
`🆘 *${selected[1]}*

Escreva agora sua mensagem para o suporte.

Explique o que aconteceu com o máximo de detalhes que conseguir.

0️⃣ Cancelar`
      )
      return true
    }

    if(flow.stage==='support_message'){
      const message=rawInput.trim()
      if(message.length<3){
        await reply('🆘 Escreva uma mensagem um pouco mais detalhada.')
        return true
      }

      const ticket=await createSupportTicket(
        sender,
        chat,
        flow.data.category,
        message
      )
      clearQuickFlow(chat,sender)

      await reply(
`✅ *CHAMADO ABERTO*

Protocolo: *${ticket.code}*
Assunto: *${flow.data.label}*

Sua mensagem foi enviada ao suporte do Alpha Bot.
Quando houver resposta, ela chegará por aqui.

Guarde o protocolo: *${ticket.code}*`
      )

      if(ownerJid){
        try{
          let origin='Conversa privada'
          if(chat.endsWith('@g.us')){
            try{
              const meta=await sock.groupMetadata(chat)
              origin='Grupo: '+(meta?.subject||'grupo')
            }catch{
              origin='Grupo do WhatsApp'
            }
          }
          await sock.sendMessage(ownerJid,{text:
`🆘 *NOVO CHAMADO ALPHA BOT*

Protocolo: *${ticket.code}*
Categoria: *${flow.data.label}*
Usuário: *${msg.pushName||'Usuário'}*
Origem: *${origin}*

📝 ${message}

Abra *!admin* → *Chamados de suporte* para responder.`
          })
        }catch(err){
          console.error('[suporte] não foi possível avisar o dono',err?.message||err)
        }
      }
      return true
    }

    if(flow.stage.startsWith('admin_')){
      if(!isOwner){
        clearQuickFlow(chat,sender)
        await reply('⛔ Comando não disponível para Beta.')
        return true
      }

      if(flow.stage==='admin_main'){
        if(input==='1') return await adminPlayersMenu(),true
        if(input==='2') return await adminGroupsMenu(),true
        if(input==='3') return await adminOrdersMenu(),true
        if(input==='4') return await adminSettingsMenu(),true
        if(input==='6') return await adminSupportMenu(),true

        if(input==='5'){
          const age=(ts)=>ts?Math.max(0,Math.floor((Date.now()-ts)/1000)):null
          const lastUpsert=age(trevoHealth.lastUpsertAt)
          const lastInbound=age(trevoHealth.lastInboundAt)
          await reply(
`🩺 *DIAGNÓSTICO ALPHA BOT*

WhatsApp: *${String(trevoHealth.whatsapp||'desconhecido').toUpperCase()}*
Mensagens observadas: *${Number(trevoHealth.messagesSeen||0)}*
Último evento: *${lastUpsert===null?'ainda nenhum':lastUpsert+'s atrás'}*
Última mensagem recebida: *${lastInbound===null?'ainda nenhuma':lastInbound+'s atrás'}*
Processo ativo há: *${Math.floor(process.uptime()/60)} min*

9️⃣ Voltar
0️⃣ Sair`
          )
          setQuickFlow(chat,sender,'admin_diag',{},5*60*1000)
          return true
        }
        await reply('👑 Escolha uma opção de *1 a 6* ou *0* para sair.')
        return true
      }

      if(flow.stage==='admin_diag'){
        if(input==='9') return await adminMainMenu(),true
        await reply('🩺 Digite *9* para voltar ou *0* para sair.')
        return true
      }

      if(flow.stage==='admin_support'){
        if(input==='9') return await adminMainMenu(),true
        const code=flow.data.codes?.[Number(input)-1]
        if(!code){
          await reply('🆘 Escolha um chamado pelo número, *9* para voltar ou *0* para sair.')
          return true
        }
        const ticket=await getSupportTicket(code)
        if(!ticket || ticket.status!=='open'){
          await reply('Esse chamado não está mais aberto.')
          return await adminSupportMenu(),true
        }
        setQuickFlow(chat,sender,'admin_support_ticket',{code},10*60*1000)
        await reply(
`🆘 *${ticket.code}*

Categoria: *${ticket.category}*
Criado: *${fmtDate(ticket.created_at)}*

📝 *Mensagem:*
${ticket.message}

1️⃣ Responder
9️⃣ Voltar
0️⃣ Sair`
        )
        return true
      }

      if(flow.stage==='admin_support_ticket'){
        if(input==='9') return await adminSupportMenu(),true
        if(input!=='1'){
          await reply('🆘 Escolha *1 Responder*, *9 Voltar* ou *0 Sair*.')
          return true
        }
        setQuickFlow(chat,sender,'admin_support_answer',{code:flow.data.code},15*60*1000)
        await reply('✍️ Digite agora a resposta que será enviada ao usuário.\n\n0️⃣ Cancelar')
        return true
      }

      if(flow.stage==='admin_support_answer'){
        const answer=rawInput.trim()
        if(answer.length<1){
          await reply('Digite uma resposta antes de enviar.')
          return true
        }
        const ticket=await answerSupportTicket(flow.data.code,sender,answer)
        let delivered=false
        try{
          await sock.sendMessage(ticket.requester_jid,{text:
`🆘 *RESPOSTA DO SUPORTE ALPHA BOT*

Protocolo: *${ticket.code}*

💬 ${answer}

Se precisar de mais ajuda, use *!suporte* para abrir um novo chamado.`
          })
          delivered=true
        }catch(err){
          console.error('[suporte] falha ao enviar resposta direta',err?.message||err)
          try{
            await sock.sendMessage(ticket.chat_jid,{text:
`🆘 *RESPOSTA DO SUPORTE ALPHA BOT*

Protocolo: *${ticket.code}*

💬 ${answer}

Se precisar de mais ajuda, use *!suporte*.`
            })
            delivered=true
          }catch(err2){
            console.error('[suporte] falha no fallback da resposta',err2?.message||err2)
          }
        }

        await reply(
`✅ *CHAMADO RESPONDIDO*

Protocolo: *${ticket.code}*
Entrega: *${delivered?'enviada ao usuário':'não foi possível entregar automaticamente'}*`
        )
        return await adminSupportMenu(),true
      }

      if(flow.stage==='admin_players'){
        if(input==='9') return await adminMainMenu(),true
        const actions={1:'addsaldo',2:'remsaldo',3:'addexp',4:'setnivel',5:'curar',6:'daritem',7:'resetplayer'}
        const action=actions[input]
        if(!action){
          await reply('👤 Escolha uma opção de *1 a 7*, *9* para voltar ou *0* para sair.')
          return true
        }
        setQuickFlow(chat,sender,'admin_player_target',{action},5*60*1000)
        await reply(
`👤 *ESCOLHA O JOGADOR*

1️⃣ Aplicar em mim
ou marque a pessoa com *@*.

9️⃣ Voltar
0️⃣ Sair`
        )
        return true
      }

      if(flow.stage==='admin_player_target'){
        if(input==='9') return await adminPlayersMenu(),true
        const action=flow.data.action
        const mentioned=mentionsOf(msg)[0]
        const target=input==='1'?sender:mentioned
        if(!target){
          await reply('👤 Marque a pessoa com *@* ou mande *1* para aplicar em você.')
          return true
        }

        if(action==='resetplayer'){
          setQuickFlow(chat,sender,'admin_player_reset',{target},5*60*1000)
          await reply(
`🧹 *RESET / AJUSTE DO JOGADOR*

1️⃣ Zerar saldo (carteira + banco)
2️⃣ Resetar EXP e nível
3️⃣ Limpar inventário
4️⃣ Definir saldo da carteira
5️⃣ ⚠️ RESET TOTAL

9️⃣ Voltar
0️⃣ Sair`,
            {mentions:target===sender?[]:[target]}
          )
          return true
        }

        if(action==='curar'){
          setQuickFlow(chat,sender,'admin_confirm',{action,target},5*60*1000)
          await reply('❤️ Curar completamente o jogador selecionado?\n\n1️⃣ Confirmar\n2️⃣ Cancelar',{mentions:target===sender?[]:[target]})
          return true
        }

        if(action==='daritem'){
          const shop=await getShop()
          const items=shop.filter(i=>SHOP_IDS.includes(i.id || i.item_id))
          const ids=items.map(i=>i.id || i.item_id)
          let text='🎁 *ESCOLHA O ITEM*\n\n'
          items.forEach((i,idx)=>text+=`${idx+1}️⃣ ${i.name}\n`)
          text+='\n9️⃣ Voltar\n0️⃣ Sair'
          setQuickFlow(chat,sender,'admin_item_select',{action,target,ids},5*60*1000)
          await reply(text,{mentions:target===sender?[]:[target]})
          return true
        }

        if(action==='setnivel'){
          setQuickFlow(chat,sender,'admin_level_value',{action,target},5*60*1000)
          await reply('⭐ Digite o *novo nível* do jogador.\nExemplo: *10*\n\n9️⃣ Voltar\n0️⃣ Sair')
          return true
        }

        const isExp=action==='addexp'
        const presets=isExp?[100,500,1000]:[1000,5000,10000]
        setQuickFlow(chat,sender,'admin_amount',{action,target,presets},5*60*1000)
        await reply(
`💰 *ESCOLHA O VALOR*

1️⃣ ${fmt(presets[0])}
2️⃣ ${fmt(presets[1])}
3️⃣ ${fmt(presets[2])}
4️⃣ Outro valor

9️⃣ Voltar
0️⃣ Sair`
        )
        return true
      }

      if(flow.stage==='admin_player_reset'){
        if(input==='9') return await adminPlayersMenu(),true
        const target=flow.data.target

        if(input==='4'){
          setQuickFlow(chat,sender,'admin_set_balance_value',{target},5*60*1000)
          await reply('💰 Digite o novo saldo da *carteira*.\nExemplo: *5000*\nPara zerar, envie *0*.')
          return true
        }

        const actions={1:'resetsaldo',2:'resetxp',3:'resetinventory',5:'resettotal'}
        const action=actions[input]
        if(!action){
          await reply('🧹 Escolha *1, 2, 3, 4 ou 5*, *9* para voltar ou *0* para sair.')
          return true
        }

        setQuickFlow(chat,sender,'admin_confirm',{action,target},5*60*1000)
        const warning=action==='resettotal'
          ? '⚠️ *RESET TOTAL* apaga saldo, banco, EXP, nível, inventário, equipamentos, vitórias/derrotas, missões, casa, carros e cooldowns do jogador.\n\n1️⃣ Confirmar\n2️⃣ Cancelar'
          : action==='resetsaldo'
            ? '⚠️ Zerar *carteira e banco* deste jogador?\n\n1️⃣ Confirmar\n2️⃣ Cancelar'
            : action==='resetxp'
              ? '⚠️ Resetar *nível e EXP* para o início?\n\n1️⃣ Confirmar\n2️⃣ Cancelar'
              : '⚠️ Limpar todo o *inventário e equipamentos* deste jogador?\n\n1️⃣ Confirmar\n2️⃣ Cancelar'
        await reply(warning,{mentions:target===sender?[]:[target]})
        return true
      }

      if(flow.stage==='admin_set_balance_value'){
        if(input==='9') return await adminPlayersMenu(),true
        const target=flow.data.target
        if(!/^\d[\d.]*$/.test(rawInput)){
          await reply('💰 Digite um valor inteiro. Exemplo: *5000* ou *0*.')
          return true
        }
        const amount=parseAmount(rawInput)
        if(!Number.isSafeInteger(amount) || amount<0){
          await reply('💰 Valor inválido.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action:'setsaldo',target,amount},5*60*1000)
        await reply(`⚠️ Definir o saldo da carteira para *R$ ${fmt(amount)}*?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`,{mentions:target===sender?[]:[target]})
        return true
      }

      if(flow.stage==='admin_amount'){
        if(input==='9') return await adminPlayersMenu(),true
        const {action,target,presets}=flow.data
        if(input==='4'){
          setQuickFlow(chat,sender,'admin_amount_custom',{action,target},5*60*1000)
          await reply('⌨️ Digite o valor desejado.\nExemplo: *25000*')
          return true
        }
        const amount=presets?.[Number(input)-1]
        if(!amount){
          await reply('Escolha *1, 2, 3 ou 4*.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action,target,amount},5*60*1000)
        await reply(
`⚠️ *CONFIRMAR AÇÃO*

${action==='remsaldo'?'Remover':action==='addexp'?'Adicionar EXP':'Adicionar saldo'}: *${action==='addexp'?fmt(amount):'R$ '+fmt(amount)}*

1️⃣ Confirmar
2️⃣ Cancelar`,
          {mentions:target===sender?[]:[target]}
        )
        return true
      }

      if(flow.stage==='admin_amount_custom'){
        const {action,target}=flow.data
        const amount=parseAmount(rawInput)
        const max=action==='addexp' ? 50_000_000 : 1_000_000_000_000
        if(!Number.isSafeInteger(amount) || amount<1 || amount>max){
          await reply(action==='addexp'
            ? '⚠️ EXP inválida. Use um valor entre *1 e 50.000.000*.'
            : '⚠️ Valor inválido. Use um valor entre *1 e 1.000.000.000.000*.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action,target,amount},5*60*1000)
        await reply(
`⚠️ *CONFIRMAR AÇÃO*

${action==='remsaldo'?'Remover':action==='addexp'?'Adicionar EXP':'Adicionar saldo'}: *${action==='addexp'?fmt(amount):'R$ '+fmt(amount)}*

1️⃣ Confirmar
2️⃣ Cancelar`,
          {mentions:target===sender?[]:[target]}
        )
        return true
      }

      if(flow.stage==='admin_level_value'){
        if(input==='9') return await adminPlayersMenu(),true
        const level=parseInt(input,10)
        if(!Number.isInteger(level)||level<1||level>999){
          await reply('⭐ Digite um nível entre *1 e 999*.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action:'setnivel',target:flow.data.target,level},5*60*1000)
        await reply(`⚠️ Alterar o nível para *${level}*?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
        return true
      }

      if(flow.stage==='admin_item_select'){
        if(input==='9') return await adminPlayersMenu(),true
        const idx=Number(input)-1
        const itemId=flow.data.ids?.[idx]
        if(!itemId){
          await reply('🎁 Escolha um dos números da lista.')
          return true
        }
        setQuickFlow(chat,sender,'admin_item_qty',{target:flow.data.target,itemId},5*60*1000)
        await reply('🎁 *QUANTIDADE*\n\n1️⃣ 1 unidade\n2️⃣ 5 unidades\n3️⃣ 10 unidades\n4️⃣ Outra quantidade\n\n9️⃣ Voltar\n0️⃣ Sair')
        return true
      }

      if(flow.stage==='admin_item_qty'){
        if(input==='9') return await adminPlayersMenu(),true
        if(input==='4'){
          setQuickFlow(chat,sender,'admin_item_qty_custom',flow.data,5*60*1000)
          await reply('⌨️ Digite a quantidade.')
          return true
        }
        const qtyMap={1:1,2:5,3:10}
        const qty=qtyMap[input]
        if(!qty){
          await reply('Escolha *1, 2, 3 ou 4*.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action:'daritem',...flow.data,qty},5*60*1000)
        await reply(`⚠️ Entregar *${qty} unidade(s)* deste item?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
        return true
      }

      if(flow.stage==='admin_item_qty_custom'){
        const qty=parseInt(input,10)
        if(!Number.isInteger(qty)||qty<1||qty>999){
          await reply('Digite uma quantidade entre *1 e 999*.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action:'daritem',...flow.data,qty},5*60*1000)
        await reply(`⚠️ Entregar *${qty} unidade(s)* deste item?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
        return true
      }

      if(flow.stage==='admin_groups'){
        if(input==='9') return await adminMainMenu(),true

        if(input==='1'){
          if(!chat.endsWith('@g.us')){
            await reply('💚 Use esta opção dentro do grupo que deseja consultar.')
            return true
          }
          const lic=await getGroupLicense(chat)
          await reply(groupLicenseStatusText(lic,'💚 *STATUS DO GRUPO*'))
          return true
        }

        if(input==='2'){
          if(!chat.endsWith('@g.us')){
            await reply('💚 Use esta opção dentro do grupo que deseja ativar.')
            return true
          }
          setQuickFlow(chat,sender,'admin_confirm',{action:'activategroup',days:30},5*60*1000)
          await reply('⚠️ Ativar este grupo por *30 dias*?\n\n1️⃣ Confirmar\n2️⃣ Cancelar')
          return true
        }

        if(input==='3'){
          if(!chat.endsWith('@g.us')){
            await reply('💚 Use esta opção dentro do grupo que deseja ativar.')
            return true
          }
          setQuickFlow(chat,sender,'admin_group_days',{},5*60*1000)
          await reply('📅 Digite a quantidade de dias.\nExemplo: *30*\n\n9️⃣ Voltar\n0️⃣ Sair')
          return true
        }

        if(input==='4'){
          if(!chat.endsWith('@g.us')){
            await reply('💚 Use esta opção dentro do grupo que deseja tornar permanente.')
            return true
          }
          setQuickFlow(chat,sender,'admin_confirm',{action:'activategrouppermanent'},5*60*1000)
          await reply('⚠️ Tornar este grupo *PERMANENTE*?\n\n♾️ Ele não terá data de expiração.\n\n1️⃣ Confirmar\n2️⃣ Cancelar')
          return true
        }

        if(input==='5'){
          if(!chat.endsWith('@g.us')){
            await reply('💚 Use esta opção dentro do grupo que deseja bloquear.')
            return true
          }
          setQuickFlow(chat,sender,'admin_confirm',{action:'blockgroup'},5*60*1000)
          await reply('⚠️ *Bloquear este grupo?*\nO acesso do Alpha Bot será interrompido.\n\n1️⃣ Confirmar\n2️⃣ Cancelar')
          return true
        }

        if(input==='6'){
          const rows=await listGroupLicenses(50)
          if(!rows.length){
            await reply('Nenhum grupo registrado ainda.')
            return true
          }
          const named=await Promise.all(rows.map(async r=>{
            try{
              const meta=await sock.groupMetadata(r.chat_jid)
              return {...r,group_name:meta?.subject||'Grupo sem nome'}
            }catch{
              return {...r,group_name:'Grupo registrado'}
            }
          }))
          let text='💚 *GRUPOS REGISTRADOS*\n\n'
          named.forEach((r,i)=>{
            const permanent=String(r.plan||'').toLowerCase()==='permanent'
            const plan=permanent?'Permanente':String(r.plan||'Plano')
            text+=`${i+1}. ${groupLicenseIsActive(r)?'✅':'❌'} *${r.group_name}*\n   Plano: *${plan}*\n   Validade: *${permanent?'Sem expiração':fmtDate(r.paid_until)}*\n\n`
          })
          text+='9️⃣ Voltar'
          await reply(text.trim())
          return true
        }

        await reply('💚 Escolha uma opção de *1 a 6*, *9* para voltar ou *0* para sair.')
        return true
      }

      if(flow.stage==='admin_group_days'){
        if(input==='9') return await adminGroupsMenu(),true
        const days=parseInt(input,10)
        if(!Number.isInteger(days)||days<1||days>3650){
          await reply('📅 Digite um período entre *1 e 3650 dias*.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action:'activategroup',days},5*60*1000)
        await reply(`⚠️ Ativar este grupo por *${days} dias*?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
        return true
      }

      if(flow.stage==='admin_orders'){
        if(input==='9') return await adminMainMenu(),true
        const idx=Number(input)-1
        const code=flow.data.codes?.[idx]
        if(!code){
          await reply('🧾 Escolha o número de um pedido ou *9* para voltar.')
          return true
        }
        const order=await getSubscriptionOrder(code)
        if(!order){
          await reply('Pedido não encontrado. Atualizando lista...')
          await adminOrdersMenu()
          return true
        }
        setQuickFlow(chat,sender,'admin_order_action',{code},5*60*1000)
        await reply(
`🧾 *${order.code}*

Status: *${String(order.status).toUpperCase()}*
Valor: *R$ ${Number(order.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}*
Criado: *${fmtDate(order.created_at)}*

1️⃣ ✅ Aprovar
2️⃣ 🚫 Cancelar
9️⃣ Voltar
0️⃣ Sair`
        )
        return true
      }

      if(flow.stage==='admin_order_action'){
        if(input==='9') return await adminOrdersMenu(),true
        if(input==='1'){
          setQuickFlow(chat,sender,'admin_confirm',{action:'approveorder',code:flow.data.code},5*60*1000)
          await reply(`⚠️ Aprovar o pedido *${flow.data.code}* e liberar 30 dias?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
          return true
        }
        if(input==='2'){
          setQuickFlow(chat,sender,'admin_confirm',{action:'cancelorder',code:flow.data.code},5*60*1000)
          await reply(`⚠️ Cancelar o pedido *${flow.data.code}*?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
          return true
        }
        await reply('Escolha *1 Aprovar*, *2 Cancelar* ou *9 Voltar*.')
        return true
      }

      if(flow.stage==='admin_settings'){
        if(input==='9') return await adminMainMenu(),true

        if(input==='1'){
          const [price,link]=await Promise.all([getLaunchPrice(),getPaymentLink()])
          await reply(
`⚙️ *CONFIGURAÇÃO ATUAL*

💰 Preço: *R$ ${Number(price).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} / 30 dias*
💳 Link: ${link}

9️⃣ Voltar`
          )
          return true
        }

        if(input==='2'){
          setQuickFlow(chat,sender,'admin_price_value',{},5*60*1000)
          await reply('💰 Digite o novo preço.\nExemplo: *5* ou *5,90*\n\n9️⃣ Voltar\n0️⃣ Sair')
          return true
        }

        if(input==='3'){
          setQuickFlow(chat,sender,'admin_link_value',{},5*60*1000)
          await reply('💳 Envie o novo link de pagamento completo.\n\n9️⃣ Voltar\n0️⃣ Sair')
          return true
        }

        await reply('⚙️ Escolha *1, 2 ou 3*, *9* para voltar ou *0* para sair.')
        return true
      }

      if(flow.stage==='admin_price_value'){
        if(input==='9') return await adminSettingsMenu(),true
        const raw=rawInput.replace(',','.')
        const price=Number(raw)
        if(!Number.isFinite(price)||price<=0||price>10000){
          await reply('💰 Digite um preço válido maior que zero.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action:'setprice',price},5*60*1000)
        await reply(`⚠️ Alterar o preço para *R$ ${price.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}*?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
        return true
      }

      if(flow.stage==='admin_link_value'){
        if(input==='9') return await adminSettingsMenu(),true
        if(!/^https?:\/\//i.test(rawInput)){
          await reply('💳 Envie um link completo começando com *https://*.')
          return true
        }
        setQuickFlow(chat,sender,'admin_confirm',{action:'setlink',link:rawInput},5*60*1000)
        await reply('⚠️ Atualizar o link de pagamento?\n\n1️⃣ Confirmar\n2️⃣ Cancelar')
        return true
      }

      if(flow.stage==='admin_confirm'){
        const data=flow.data
        if(input==='2'){
          await reply('✅ Ação cancelada.')
          await adminBackFor(data.action)
          return true
        }
        if(input!=='1'){
          await reply('Escolha *1 Confirmar* ou *2 Cancelar*.')
          return true
        }

        if(data.action==='addsaldo'){
          const p=await ownerAddBalance(data.target,data.amount)
          await reply(`✅ Saldo adicionado. Novo saldo: *R$ ${fmt(p.cash)}*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='setsaldo'){
          const r=await ownerSetBalance(data.target,data.amount)
          await reply(`✅ Saldo definido: *R$ ${fmt(r.oldCash)} → R$ ${fmt(r.cash)}*.\n🏦 Banco mantido: *R$ ${fmt(r.bank)}*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='resetsaldo'){
          const r=await ownerResetBalance(data.target)
          await reply(`✅ Saldo resetado.\n💵 Carteira anterior: *R$ ${fmt(r.oldCash)}*\n🏦 Banco anterior: *R$ ${fmt(r.oldBank)}*\n💰 Agora: *R$ 0*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='resetxp'){
          const r=await ownerResetExp(data.target)
          await reply(`✅ EXP resetada.\n⭐ Nível: *${r.oldLevel} → 1*\n✨ EXP: *${fmt(r.oldExp)} → 0*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='resetinventory'){
          const r=await ownerResetInventory(data.target)
          await reply(`✅ Inventário limpo. *${fmt(r.removed)} item(ns)* removidos e equipamentos desequipados.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='resettotal'){
          const r=await ownerResetTotal(data.target)
          await reply(`✅ *RESET TOTAL CONCLUÍDO*\n\n💰 Saldo anterior: R$ ${fmt(r.cash+r.bank)}\n⭐ Nível anterior: ${r.level}\n✨ EXP anterior: ${fmt(r.exp)}\n🎒 Itens anteriores: ${fmt(r.inventory)}\n\nO jogador voltou ao estado inicial.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='remsaldo'){
          const r=await ownerRemoveBalance(data.target,data.amount)
          await reply(`✅ Removido *R$ ${fmt(r.removed)}*. Saldo atual: *R$ ${fmt(r.cash)}*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='addexp'){
          const r=await ownerAddExp(data.target,data.amount)
          await reply(`✅ +${fmt(data.amount)} EXP. Nível: *${r.level}*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='setnivel'){
          const r=await ownerSetLevel(data.target,data.level)
          await reply(`✅ Nível alterado: *${r.oldLevel} → ${r.level}*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='curar'){
          const r=await ownerHeal(data.target)
          await reply(`✅ Cura completa: ❤️ *${r.hp}/${r.max_hp}*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='daritem'){
          const r=await ownerGrantItem(data.target,data.itemId,data.qty)
          await reply(`✅ Item entregue: *${r.item.name} ×${r.qty}*.`,{mentions:data.target===sender?[]:[data.target]})
        }else if(data.action==='activategroup'){
          const lic=await activateGroupLicense(chat,data.days,sender,'basic')
          await reply(`✅ Grupo ativado por *${data.days} dias*.\n📅 Validade: *${fmtDate(lic.paid_until)}*`)
        }else if(data.action==='activategrouppermanent'){
          await activateGroupLicense(chat,null,sender,'permanent')
          await reply('✅ *GRUPO PERMANENTE ATIVADO!*\n♾️ Este grupo agora não possui data de expiração.')
        }else if(data.action==='blockgroup'){
          await blockGroupLicense(chat,sender)
          await reply('✅ Grupo bloqueado.')
        }else if(data.action==='approveorder'){
          const r=await approveSubscriptionOrder(data.code,sender)
          await reply(`✅ Pedido *${r.code}* aprovado.\n📅 Grupo liberado até: *${fmtDate(r.paid_until)}*`)
          try{
            await sock.sendMessage(r.chat_jid,{text:
`💚 *PAGAMENTO CONFIRMADO!*

🧾 Pedido: *${r.code}*
✅ Alpha Bot liberado por mais *30 dias*.
📅 Validade: *${fmtDate(r.paid_until)}*

Obrigado por apoiar o Alpha Bot 🍀`
            })
          }catch(err){
            console.error('[assinatura] não foi possível avisar o grupo',err?.message||err)
          }
        }else if(data.action==='cancelorder'){
          const r=await cancelSubscriptionOrder(data.code)
          await reply(`✅ Pedido *${r.code}* cancelado.`)
        }else if(data.action==='setprice'){
          const value=await setLaunchPrice(data.price)
          await reply(`✅ Preço atualizado para *R$ ${value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} / 30 dias*.`)
        }else if(data.action==='setlink'){
          await setPaymentLink(data.link)
          await reply('✅ Link de pagamento atualizado.')
        }

        await adminBackFor(data.action)
        return true
      }

      return true
    }

    if(flow.stage==='game_after'){
      const game=flow.data.game

      if(input==='2'){
        await gamesMenu()
        return true
      }

      if(input==='9'){
        await showMainMenu(chat,sender,reply)
        return true
      }

      if(input!=='1'){
        await reply('🎮 Escolha *1 Jogar novamente*, *2 Minigames*, *9 Menu principal* ou *0 Sair*.')
        return true
      }

      if(game==='roulette'){
        const r=await roulette(sender,flow.data.amount,flow.data.choice)
        await progressDailyMission(sender,'game')
        const result=r.payout>0
          ? `🎉 Você ganhou R$ ${fmt(r.payout)}! Lucro: R$ ${fmt(r.profit)}`
          : `💸 Você perdeu R$ ${fmt(r.amount)}.`
        await afterGame('roulette',{amount:flow.data.amount,choice:flow.data.choice},
`🎰 *ROLETA*

Número: *${r.number}*
Cor: *${r.color}*
Sua escolha: *${r.choice}*

${result}`)
        return true
      }

      if(game==='coin'){
        const r=await coinFlip(sender,flow.data.amount,flow.data.choice)
        await progressDailyMission(sender,'game')
        await afterGame('coin',{amount:flow.data.amount,choice:flow.data.choice},
`🪙 *CARA OU COROA*

Resultado: *${r.result}*
Você escolheu: *${r.choice}*

${r.payout>0?`🎉 Ganhou R$ ${fmt(r.payout)}!`:`💸 Perdeu R$ ${fmt(r.amount)}.`}`)
        return true
      }

      if(game==='ppt'){
        const r=rps(flow.data.choice)
        await progressDailyMission(sender,'game')
        const emoji=r.result==='vitoria'?'🏆':r.result==='empate'?'🤝':'💀'
        await afterGame('ppt',{choice:flow.data.choice},
`✊ *PEDRA, PAPEL E TESOURA*

Você: *${r.choice}*
Alpha Bot: *${r.bot}*

${emoji} *${r.result.toUpperCase()}*`)
        return true
      }

      if(game==='hangman'){
        const r=await startHangman(chat)
        setQuickFlow(chat,sender,'hangman',{},5*60*1000)
        if(!r.already) await progressDailyMission(sender,'game')
        const masked=r.word.split('').map(ch=>r.letters?.includes(ch)?ch:'_').join(' ')
        await reply(
`🔤 *FORCA*

Dica: *${r.hint}*
Palavra: ${masked}
❤️ Vidas: ${r.lives||6}

Digite uma *letra* ou tente a *palavra inteira*.
0️⃣ Sair`
        )
        return true
      }

      if(game==='quiz'){
        const q=await startQuiz(chat)
        if(!q.already) await progressDailyMission(sender,'game')
        const ttl=Math.max(10,Number(q.remaining||120))*1000
        setQuickFlow(chat,sender,'quiz_answer',{},ttl)
        let text=`🧠 *QUIZ DO ALPHA BOT*\n\n${q.q}\n\n`
        q.a.forEach((a,i)=>text+=`*${i+1}.* ${a}\n`)
        text+='\n_Responda só com 1, 2, 3 ou 4._'
        await reply(text)
        return true
      }

      if(game==='number'){
        const r=await startNumberGame(chat)
        if(!r.already) await progressDailyMission(sender,'game')
        setQuickFlow(chat,sender,'number_guess',{},5*60*1000)
        await reply(
`🔢 *ADIVINHE O NÚMERO*

Escolhi um número de *1 a 100*.
Vocês têm até *10 tentativas*.

Digite apenas seu chute.
0️⃣ Sair`
        )
        return true
      }

      if(game==='boss'){
        const r=await startBoss(chat)
        if(!r.already) await progressDailyMission(sender,'game')
        setQuickFlow(chat,sender,'boss_attack',{},10*60*1000)
        const schedule=r.mode==='weekly'?`\n📅 Disponível: *sexta 00:00 → sábado 23:59*\n⏰ Encerra: *${r.endsLabel}* (São Paulo)`:(r.mode==='event'?'\n🌘 *Boss de Evento ativo — ativado manualmente pelo dono.*':'')
        await reply(
`👹 *${r.name}*

❤️ ${Number(r.hp).toLocaleString('pt-BR')}/${Number(r.maxHp).toLocaleString('pt-BR')}${schedule}

1️⃣ Iniciar combate automático
0️⃣ Sair`
        )
        return true
      }

      await gamesMenu()
      return true
    }

    if(flow.stage==='main'){
      if(!/^[1-7]$/.test(input)){
        await reply('🎮 Escolha uma opção de *1 a 7* ou digite *0* para sair.')
        return true
      }

      if(input==='1'){
        await askBet('roulette_bet')
        return true
      }
      if(input==='2'){
        await askBet('coin_bet')
        return true
      }
      if(input==='3'){
        setQuickFlow(chat,sender,'ppt_choice',{},90000)
        await reply(
`✊ *PEDRA, PAPEL E TESOURA*

1️⃣ Pedra
2️⃣ Papel
3️⃣ Tesoura

_Responda só com o número._`
        )
        return true
      }
      if(input==='4'){
        const r=await startHangman(chat)
        setQuickFlow(chat,sender,'hangman',{},5*60*1000)
        if(!r.already) await progressDailyMission(sender,'game')
        const masked=r.word.split('').map(ch=>r.letters?.includes(ch)?ch:'_').join(' ')
        await reply(
`🔤 *FORCA*

Dica: *${r.hint}*
Palavra: ${masked}
❤️ Vidas: ${r.lives||6}

Digite apenas uma *letra* ou tente a *palavra inteira*.
Digite *0* para sair do modo rápido.`
        )
        return true
      }
      if(input==='5'){
        const q=await startQuiz(chat)
        if(!q.already) await progressDailyMission(sender,'game')
        const ttl=Math.max(10,Number(q.remaining||120))*1000
        setQuickFlow(chat,sender,'quiz_answer',{},ttl)
        let text=`🧠 *QUIZ DO ALPHA BOT*\n\n${q.q}\n\n`
        q.a.forEach((a,i)=>text+=`*${i+1}.* ${a}\n`)
        text+='\n_Responda só com 1, 2, 3 ou 4._'
        await reply(text)
        return true
      }
      if(input==='6'){
        const r=await startNumberGame(chat)
        if(!r.already) await progressDailyMission(sender,'game')
        setQuickFlow(chat,sender,'number_guess',{},5*60*1000)
        await reply(
`🔢 *ADIVINHE O NÚMERO*

Escolhi um número de *1 a 100*.
Vocês têm até *10 tentativas*.

Digite apenas seu chute, por exemplo: *50*.
Digite *0* para sair do modo rápido.`
        )
        return true
      }
      if(input==='7'){
        const r=await startBoss(chat)
        if(!r.already) await progressDailyMission(sender,'game')
        setQuickFlow(chat,sender,'boss_attack',{},10*60*1000)
        const schedule=r.mode==='weekly'?`\n📅 Disponível: *sexta 00:00 → sábado 23:59*\n⏰ Encerra: *${r.endsLabel}* (São Paulo)`:(r.mode==='event'?'\n🌘 *Boss de Evento ativo — ativado manualmente pelo dono.*':'')
        await reply(
`👹 *${r.name}*

❤️ ${Number(r.hp).toLocaleString('pt-BR')}/${Number(r.maxHp).toLocaleString('pt-BR')}${schedule}

1️⃣ Iniciar combate automático
0️⃣ Sair do modo rápido

_Ao mandar 1, começa uma sessão automática de até 5 minutos._`
        )
        return true
      }
    }

    if(flow.stage==='roulette_bet' || flow.stage==='coin_bet'){
      const presets={1:100,2:500,3:1000}
      if(input==='4'){
        setQuickFlow(chat,sender,flow.stage==='roulette_bet'?'roulette_custom':'coin_custom',{},90000)
        await reply('💰 Digite o valor que quer apostar. Exemplo: *2500*')
        return true
      }
      const amount=presets[input]
      if(!amount){
        await reply('Escolha *1, 2, 3 ou 4*.')
        return true
      }
      if(flow.stage==='roulette_bet'){
        setQuickFlow(chat,sender,'roulette_color',{amount},90000)
        await reply(
`🎰 *ESCOLHA A COR*

1️⃣ 🔴 Vermelho
2️⃣ ⚫ Preto
3️⃣ 🟢 Verde

_Responda só com o número._`
        )
      }else{
        setQuickFlow(chat,sender,'coin_side',{amount},90000)
        await reply(
`🪙 *CARA OU COROA*

1️⃣ Cara
2️⃣ Coroa

_Responda só com o número._`
        )
      }
      return true
    }

    if(flow.stage==='roulette_custom' || flow.stage==='coin_custom'){
      const amount=parseAmount(input)
      if(amount<1){
        await reply('Digite um valor válido. Exemplo: *2500*.')
        return true
      }
      if(flow.stage==='roulette_custom'){
        setQuickFlow(chat,sender,'roulette_color',{amount},90000)
        await reply('🎰 Escolha: *1 Vermelho*, *2 Preto* ou *3 Verde*.')
      }else{
        setQuickFlow(chat,sender,'coin_side',{amount},90000)
        await reply('🪙 Escolha: *1 Cara* ou *2 Coroa*.')
      }
      return true
    }

    if(flow.stage==='roulette_color'){
      const colors={1:'vermelho',2:'preto',3:'verde'}
      const choice=colors[input]
      if(!choice){
        await reply('Escolha *1, 2 ou 3*.')
        return true
      }
      const r=await roulette(sender,flow.data.amount,choice)
      await progressDailyMission(sender,'game')
      const result=r.payout>0
        ? `🎉 Você ganhou R$ ${fmt(r.payout)}! Lucro: R$ ${fmt(r.profit)}`
        : `💸 Você perdeu R$ ${fmt(r.amount)}.`
      await afterGame('roulette',{amount:flow.data.amount,choice},
`🎰 *ROLETA*

Número: *${r.number}*
Cor: *${r.color}*
Sua escolha: *${r.choice}*

${result}`)
      return true
    }

    if(flow.stage==='coin_side'){
      const sides={1:'cara',2:'coroa'}
      const choice=sides[input]
      if(!choice){
        await reply('Escolha *1 ou 2*.')
        return true
      }
      const r=await coinFlip(sender,flow.data.amount,choice)
      await progressDailyMission(sender,'game')
      await afterGame('coin',{amount:flow.data.amount,choice},
`🪙 *CARA OU COROA*

Resultado: *${r.result}*
Você escolheu: *${r.choice}*

${r.payout>0?`🎉 Ganhou R$ ${fmt(r.payout)}!`:`💸 Perdeu R$ ${fmt(r.amount)}.`}`)
      return true
    }

    if(flow.stage==='ppt_choice'){
      const choices={1:'pedra',2:'papel',3:'tesoura'}
      const choice=choices[input]
      if(!choice){
        await reply('Escolha *1, 2 ou 3*.')
        return true
      }
      const r=rps(choice)
      await progressDailyMission(sender,'game')
      const emoji=r.result==='vitoria'?'🏆':r.result==='empate'?'🤝':'💀'
      await afterGame('ppt',{choice},
`✊ *PEDRA, PAPEL E TESOURA*

Você: *${r.choice}*
Alpha Bot: *${r.bot}*

${emoji} *${r.result.toUpperCase()}*`)
      return true
    }

    if(flow.stage==='hangman'){
      let r
      if(input.length===1) r=await hangmanLetter(chat,input)
      else r=await hangmanWord(chat,input)

      if(r.repeat){
        await reply(`🔁 Essa letra já foi usada.\n${r.masked}\n❤️ Vidas: ${r.lives}`)
        return true
      }
      if(r.won){
        await afterGame('hangman',{},`🎉 *ACERTOU!* A palavra era *${r.word}*.`)
        return true
      }
      if(r.lost){
        await afterGame('hangman',{},`💀 *FORCA ENCERRADA!* A palavra era *${r.word}*.`)
        return true
      }
      await reply(`🔤 ${r.masked}\n❤️ Vidas: ${r.lives}${r.wrong?`\n❌ Erros: ${r.wrong.join(', ')||'nenhum'}`:''}`)
      return true
    }

    if(flow.stage==='quiz_answer'){
      const n=parseInt(input,10)
      if(![1,2,3,4].includes(n)){
        await reply('Responda apenas com *1, 2, 3 ou 4*.')
        return true
      }
      const r=await answerQuiz(chat,sender,n)
      if(r.correct && String(chat).endsWith('@g.us')) await progressGroupMission(chat,sender,'quiz')
      const resultText=r.correct
        ? `✅ *Acertou!* +R$ ${fmt(r.reward)}\nResposta: *${r.correctText}*`
        : `❌ Errou. A resposta correta era *${r.correctAnswer}. ${r.correctText}*.`
      await afterGame('quiz',{},resultText)
      return true
    }

    if(flow.stage==='number_guess'){
      const n=parseInt(input,10)
      if(!Number.isInteger(n)||n<1||n>100){
        await reply('Digite um número de *1 a 100*.')
        return true
      }
      const r=await guessNumber(chat,sender,n)
      if(r.won){
        await afterGame('number',{},`🎉 *ACERTOU!* O número era *${r.number}*.\n💰 +R$ ${fmt(r.reward)}\nTentativas: ${r.attempts}`)
      }else if(r.lost){
        await afterGame('number',{},`💀 Acabaram as tentativas. O número era *${r.number}*.`)
      }else{
        await reply(`🔢 É *${r.hint}*!\nTentativas restantes: *${r.left}*\n\nDigite outro número.`)
      }
      return true
    }

    if(flow.stage==='boss_attack'){
      if(input!=='1'){
        await reply('👹 Mande *1* para iniciar o combate automático ou *0* para sair.')
        return true
      }
      clearQuickFlow(chat,sender)
      const started=await runBossSession(chat,sender,msg.pushName||'Jogador',reply)
      if(!started) return await reply('⚔️ Você já está em uma sessão automática contra o Boss.')
      await reply('⚔️ *COMBATE AUTOMÁTICO INICIADO!*\n\n⏱️ Até *5 minutos* • 🥊 ataque a cada *10 segundos*\n🧪 Cura automática quando possível.\n📅 O Boss encerra *sábado às 23:59* (São Paulo).\n\nUse *!boss* para acompanhar o HP.')
      return true
    }

    if(flow.stage==='upgrade_select'){
      const n=Number(input), items=flow.data?.items||[]
      if(!Number.isInteger(n)||n<1||n>items.length){
        await reply('⚙️ Escolha um número da lista de upgrades disponíveis.')
        return true
      }
      const pick=items[n-1]
      const current=await listUpgradeableEquipment(sender)
      const item=current.find(i=>i.item_id===pick.itemId)
      if(!item || !item.next){
        clearQuickFlow(chat,sender)
        await reply('✅ Esse equipamento já está no nível máximo ou não está mais disponível.')
        return true
      }
      setQuickFlow(chat,sender,'upgrade_confirm',{itemId:item.item_id},90000)
      const stat=item.category==='weapon'
        ? `${item.current.atk} → *${item.next.atk} ATK*`
        : `${item.current.def} → *${item.next.def} DEF*`
      await reply(`⬆️ *UPAR EQUIPAMENTO?*\n\n${rarityLabel(item.rarity)} — *${item.name}*\n⭐ Lv.${item.level} → *Lv.${Number(item.level)+1}*\n💪 ${stat}\n💰 Custo: *R$ ${fmt(item.cost)}*\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
      return true
    }

    if(flow.stage==='upgrade_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Upgrade cancelado.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Confirmar* ou *2 Cancelar*.')
        return true
      }
      const r=await upgradeEquipment(sender,flow.data.itemId)
      clearQuickFlow(chat,sender)
      const stat=r.stats.category==='weapon'?r.stats.atk+' ATK':r.stats.def+' DEF'
      await reply(`⬆️ *EQUIPAMENTO APRIMORADO!*\n\n⚙️ *${r.name}*\n⭐ Lv.${r.fromLevel} → *Lv.${r.level}*\n💪 Agora: *${stat}*\n💸 Pago: *R$ ${fmt(r.cost)}*\n🪙 Carteira: *R$ ${fmt(r.cash)}*\n\nUse *!uparitem* para continuar evoluindo.`)
      return true
    }

    if(flow.stage==='equip_select'){
      if(input==='9'){
        await inventoryMenu()
        return true
      }
      const index=Number(input)-1
      const itemId=flow.data.items?.[index]
      if(!itemId){
        await reply('⚙️ Escolha um dos números da lista, *9* para voltar ou *0* para sair.')
        return true
      }
      const [p,items]=await Promise.all([getCombatProfile(sender),getInventory(sender)])
      const item=items.find(i=>i.item_id===itemId)
      const info=getEquipmentInfo(itemId)
      if(!item || !info){
        await reply('❌ Não consegui carregar esse equipamento.')
        return true
      }
      const isWeapon=info.category==='weapon'
      const currentName=isWeapon?p.weapon_name:p.armor_name
      const before=isWeapon?Number(p.effective_atk):Number(p.effective_def)
      const after=isWeapon
        ? before-Number(p.weapon_atk||0)+Number(info.atk||0)
        : before-Number(p.armor_def||0)+Number(info.def||0)
      const stat=isWeapon?'ATK':'DEF'
      const delta=after-before
      const arrow=delta>0?'📈':delta<0?'📉':'➖'
      setQuickFlow(chat,sender,'equip_compare_confirm',{itemId},90000)
      await reply(
        '⚙️ *TROCAR EQUIPAMENTO?*\n\n'+
        (isWeapon?'🗡️':'🛡️')+' Atual: *'+currentName+'*\n'+
        '➡️ Novo: '+rarityLabel(item.rarity)+' — *'+item.name+'*\n\n'+
        arrow+' *'+stat+': '+before+' → '+after+'*'+(delta>0?' (+'+delta+')':delta<0?' ('+delta+')':'')+'\n\n'+
        '1️⃣ Equipar\n2️⃣ Cancelar\n9️⃣ Voltar'
      )
      return true
    }

    if(flow.stage==='equip_compare_confirm'){
      if(input==='9' || input==='2'){
        await equipmentMenu()
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Equipar*, *2 Cancelar* ou *9 Voltar*.')
        return true
      }
      const r=await equipItem(sender,flow.data.itemId)
      const p=await getCombatProfile(sender)
      await reply('✅ *EQUIPADO!*\n\n'+r.name+' agora é sua '+(r.category==='weapon'?'arma':'armadura')+' ativa.\n\n⚔️ ATK atual: *'+p.effective_atk+'*\n🛡️ DEF atual: *'+p.effective_def+'*')
      await equipmentMenu()
      return true
    }

    if(flow.stage==='use_select'){
      if(input==='9'){
        await inventoryMenu()
        return true
      }
      const index=Number(input)-1
      const itemId=flow.data.items?.[index]
      if(!itemId){
        await reply('🧪 Escolha um dos números da lista ou digite *0* para cancelar.')
        return true
      }
      if(itemId==='energetico_pet'){
        const r=await usePetEnergyItem(sender,itemId)
        clearQuickFlow(chat,sender)
        await reply(`⚡ *ENERGÉTICO PET USADO!*\n\n🐾 ${r.petName}\n🔋 Energia: *${r.before} → ${r.energy}/${r.max}*\n⚡ Recuperado: *+${r.recovered}*\n📦 Restam: *${r.remaining}*`)
        return true
      }
      if(['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica'].includes(itemId)){
        const r=await usePetPotion(sender,itemId)
        clearQuickFlow(chat,sender)
        await reply(`🐾🧪 *${r.name} usada!*\n❤️ ${r.petName}: +${r.healed} HP\nHP atual: *${r.hp}/${r.maxHp}*\n📦 Restam: *${r.remaining}*`)
        return true
      }
      const r=await usePotion(sender,itemId)
      clearQuickFlow(chat,sender)
      await reply(`🧪 *${r.name} usada!*\n❤️ +${r.healed} HP\nHP atual: ${r.hp}/${r.maxHp}`)
      return true
    }


    if(flow.stage==='commands_main'){
      if(await commandCategory(input)) return true
      await reply('📚 Escolha uma categoria de *1 a 9* ou *0* para fechar.')
      return true
    }

    if(flow.stage==='commands_category'){
      if(input==='9'){
        await commandsMenu()
        return true
      }
      await reply('📚 Digite *9* para voltar às categorias ou *0* para fechar.')
      return true
    }

    if(flow.stage==='nav_main'){
      if(!/^[1-9]$/.test(input)){
        await reply('🍀 Escolha uma opção de *1 a 9* ou digite *0* para sair.')
        return true
      }

      if(input==='1'){
        clearQuickFlow(chat,sender)
        await sendAlphaProfile(sock,chat,sender,msg)
        return true
      }

      if(input==='2'){
        if(sender!==ownerJid && !(await groupModuleEnabled(chat,'economy_enabled'))){
          clearQuickFlow(chat,sender)
          await reply('🔒 *Economia* foi desativada pelo administrador deste grupo.')
          return true
        }
        setQuickFlow(chat,sender,'nav_economy',{},90000)
        await reply(
`💰 *ECONOMIA*

1️⃣ Ver saldo
2️⃣ Daily + sequência 🔥
3️⃣ Trabalhar
4️⃣ Depositar
5️⃣ Sacar
6️⃣ Ranking dos mais ricos
7️⃣ PIX para jogador

0️⃣ Voltar/sair`
        )
        return true
      }

      if(input==='3'){
        setQuickFlow(chat,sender,'nav_items',{},90000)
        await reply(
`🛒 *ITENS E INVENTÁRIO*

1️⃣ Loja
2️⃣ Inventário
3️⃣ Equipar
4️⃣ Usar consumível
5️⃣ Abrir caixas

0️⃣ Sair`
        )
        return true
      }

      if(input==='4'){
        if(sender!==ownerJid && !(await groupModuleEnabled(chat,'rpg_enabled'))){
          clearQuickFlow(chat,sender)
          await reply('🔒 *RPG* foi desativado pelo administrador deste grupo.')
          return true
        }
        setQuickFlow(chat,sender,'nav_rpg',{},90000)
        await reply(
`⚔️ *RPG*

1️⃣ Status
2️⃣ Dungeon
3️⃣ Batalhar com alguém
4️⃣ Roubar alguém
5️⃣ Ranking RPG
6️⃣ ⚔️ Raids cooperativas

0️⃣ Sair`
        )
        return true
      }

      if(input==='5'){
        if(sender!==ownerJid && !(await groupModuleEnabled(chat,'games_enabled'))){
          clearQuickFlow(chat,sender)
          await reply('🔒 *Minigames* foram desativados pelo administrador deste grupo.')
          return true
        }
        setQuickFlow(chat,sender,'main',{},90000)
        await reply(
`🎮 *MINIGAMES DO ALPHA BOT*

1️⃣ 🎰 Roleta
2️⃣ 🪙 Cara ou Coroa
3️⃣ ✊ Pedra, Papel e Tesoura
4️⃣ 🔤 Forca
5️⃣ 🧠 Quiz
6️⃣ 🔢 Adivinhe o Número
7️⃣ 👹 Boss

0️⃣ Sair`
        )
        return true
      }

      if(input==='6'){
        if(sender!==ownerJid && !(await groupModuleEnabled(chat,'progression_enabled'))){
          clearQuickFlow(chat,sender)
          await reply('🔒 *Progressão* foi desativada pelo administrador deste grupo.')
          return true
        }
        setQuickFlow(chat,sender,'nav_progress',{},90000)
        await reply(
`📋 *PROGRESSÃO*

1️⃣ Missões diárias
2️⃣ Resgatar missões
3️⃣ Casas
4️⃣ Carros
5️⃣ Patrimônio
6️⃣ Ranking de patrimônio

0️⃣ Sair`
        )
        return true
      }

      if(input==='7'){
        if(sender!==ownerJid && !(await groupModuleEnabled(chat,'progression_enabled'))){
          clearQuickFlow(chat,sender)
          await reply('🔒 *Progressão* foi desativada pelo administrador deste grupo.')
          return true
        }
        const clan=await getClanForUser(sender)
        setQuickFlow(chat,sender,'clan_menu',{},90000)
        if(!clan){
          await reply(
`🏴 *CLÃS*

1️⃣ Criar um clã
2️⃣ Aceitar convite
3️⃣ Ranking de clãs

0️⃣ Sair`
          )
        }else{
          const leader=clan.role==='leader'
          await reply(
`🏴 *CLÃ ${clan.name}*

1️⃣ Ver informações
2️⃣ Doar ao cofre
3️⃣ Convidar pessoa
4️⃣ Ranking de clãs
${leader?'5️⃣ Transferir liderança\n6️⃣ Expulsar membro\n7️⃣ Sair do clã':'5️⃣ Sair do clã'}

0️⃣ Sair`
          )
        }
        return true
      }

      if(input==='8'){
        setQuickFlow(chat,sender,'nav_group',{},90000)
        await reply(
`💚 *GRUPO / ASSINATURA*

1️⃣ Status do grupo
2️⃣ Assinar / renovar
3️⃣ Termos
4️⃣ ⚙️ Configurações do grupo

0️⃣ Sair`
        )
        return true
      }

      if(input==='9'){
        await supportMenu()
        return true
      }
    }

    if(flow.stage==='business_manage_select'){
      const id=flow.data.ids?.[Number(input)-1]
      if(!id){ await reply('🏢 Escolha um dos seus negócios pelo número.'); return true }
      const b=(await getBusinesses(sender)).find(x=>x.id===id)
      if(!b){ clearQuickFlow(chat,sender); await reply('❌ Negócio não encontrado.'); return true }
      const level=Math.max(1,Number(b.level||1))
      if(level>=5){ await reply(`🏆 *${b.name}* já está no nível máximo (5).`); return true }
      const cost=Math.floor(b.price*(0.5+level*0.25))
      setQuickFlow(chat,sender,'business_upgrade_confirm',{id:b.id},90000)
      await reply(`🔧 *UPGRADE — ${b.name}*\n\nNível: *${level} → ${level+1}*\n💰 Custo: *R$ ${fmt(cost)}*\n📈 Produção: *R$ ${fmt(Math.floor(b.profitHour*(1+level*0.25)))}/h*\n⏳ Capacidade: *${b.capacityHours+level}h*\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
      return true
    }

    if(flow.stage==='business_upgrade_confirm'){
      if(input==='2'){ clearQuickFlow(chat,sender); await reply('❌ Upgrade cancelado.'); return true }
      if(input!=='1'){ await reply('Escolha *1 Confirmar* ou *2 Cancelar*.'); return true }
      const r=await upgradeBusiness(sender,flow.data.id)
      clearQuickFlow(chat,sender)
      await reply(`✅ *NEGÓCIO MELHORADO!*\n🏪 ${r.name} — *Nível ${r.level}/5*\n📈 Produção: *R$ ${fmt(Math.floor(r.profitHour*r.multiplier))}/h*\n⏳ Capacidade: *${r.capacityHours}h*`)
      return true
    }

    if(flow.stage==='business_buy_select'){
      if(!/^([1-9])$/.test(input)){
        await reply('🏪 Escolha um negócio de *1 a 9* ou digite *0* para cancelar.')
        return true
      }
      const b=BUSINESSES[Number(input)-1]
      if(!b){ await reply('❌ Negócio inválido.'); return true }
      const owned=await getBusinesses(sender)
      if(owned.some(x=>x.id===b.id)){
        await reply(`⚠️ Você já possui *${b.name}*. Escolha outro negócio.`)
        return true
      }
      setQuickFlow(chat,sender,'business_buy_confirm',{id:b.id,name:b.name,price:b.price,profitHour:b.profitHour,capacityHours:b.capacityHours},90000)
      await reply(`🏪 Comprar *${b.name}* por *R$ ${fmt(b.price)}*?\n\n💵 Lucro: R$ ${fmt(b.profitHour)}/h\n⏳ Acumula até ${b.capacityHours}h\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
      return true
    }

    if(flow.stage==='business_buy_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('❌ Compra cancelada.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Confirmar* ou *2 Cancelar*.')
        return true
      }
      const b=await buyBusiness(sender,flow.data.id)
      clearQuickFlow(chat,sender)
      await reply(`✅ *NEGÓCIO COMPRADO!*\n\n🏪 ${b.name}\n💰 Investimento: R$ ${fmt(b.price)}\n📈 Lucro: R$ ${fmt(b.profitHour)}/h\n⏳ Acumula até ${b.capacityHours}h.\n\nUse *${prefix}coletar* para receber os lucros.`)
      return true
    }

    if(flow.stage==='confirm_sell_car'){
      if(['nao','não','n'].includes(input)){ clearQuickFlow(chat,sender); await reply('❌ Venda cancelada.'); return true }
      if(!['sim','s'].includes(input)){ await reply('⚠️ Responda *SIM* para vender ou *NÃO* para cancelar.'); return true }
      const r=await sellCar(sender,flow.data.id)
      clearQuickFlow(chat,sender)
      await reply(`✅ *CARRO VENDIDO*\n🚗 ${r.name}\n💰 Recebido: *R$ ${fmt(r.resale)}*\n📉 Desvalorização: R$ ${fmt(r.depreciation)} (30%)`)
      return true
    }

    if(flow.stage==='confirm_sell_motorcycle'){
      if(['nao','não','n'].includes(input)){ clearQuickFlow(chat,sender); await reply('❌ Venda cancelada.'); return true }
      if(!['sim','s'].includes(input)){ await reply('⚠️ Responda *SIM* para vender ou *NÃO* para cancelar.'); return true }
      const r=await sellMotorcycle(sender,flow.data.id)
      clearQuickFlow(chat,sender)
      await reply(`✅ *VEÍCULO VENDIDO*\n🚲🏍️ ${r.name}\n💰 Recebido: *R$ ${fmt(r.resale)}*\n📉 Desvalorização: R$ ${fmt(r.depreciation)} (30%)`)
      return true
    }

    if(flow.stage==='delivery_vehicle_buy'){
      if(!/^[1-6]$/.test(input)){
        await reply('🚲🏍️ Escolha um veículo de *1 a 6* ou digite *0* para cancelar.')
        return true
      }
      try{
        const vehicle=await buyMotorcycle(sender,input)
        clearQuickFlow(chat,sender)
        await reply(`🚲🏍️ *Veículo comprado!*\n\n${vehicle.name}\n💰 R$ ${fmt(vehicle.price)}\n\n🍔 Agora use *${prefix}ifood* para fazer entregas.`)
      }catch(err){
        await reply(`❌ ${err?.message||'Não foi possível comprar esse veículo.'}`)
      }
      return true
    }

    if(flow.stage==='nav_economy'){
      if(input==='1'){
        const p=await getProfile(sender)
        clearQuickFlow(chat,sender)
        await reply(`💰 *Saldo*\n\n🪙 Carteira: R$ ${fmt(p.cash)}\n🏦 Banco: R$ ${fmt(p.bank)}\n📊 Total: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)
        return true
      }
      if(input==='2'){
        const r=await claimDaily(sender)
        clearQuickFlow(chat,sender)
        if(!r.ok) await reply(`⏳ Daily já coletado hoje.\n🔥 Sequência atual: *${r.streak} dia${r.streak===1?'':'s'}*.\n🌙 Volte em aproximadamente ${duration(r.remaining)}.`)
        else{
          await progressDailyMission(sender,'daily')
          await reply(dailyResultText(r))
        }
        return true
      }
      if(input==='3'){
        const r=await work(sender)
        clearQuickFlow(chat,sender)
        if(!r.ok) await reply(`⏳ Você já trabalhou. Tente novamente em ${duration(r.remaining)}.`)
        else{
          await progressDailyMission(sender,'work')
          if(isGroup) await progressGroupMission(chat,sender,'work')
          await reply(workResultText(r))
        }
        return true
      }
      if(input==='4'){
        setQuickFlow(chat,sender,'deposit_amount',{},90000)
        await reply(
`🏦 *DEPOSITAR*

1️⃣ R$ 100
2️⃣ R$ 500
3️⃣ R$ 1.000
4️⃣ R$ 5.000
5️⃣ Máximo possível
6️⃣ Outro valor

0️⃣ Cancelar`
        )
        return true
      }
      if(input==='5'){
        setQuickFlow(chat,sender,'withdraw_amount',{},90000)
        await reply(
`💵 *SACAR*

1️⃣ R$ 100
2️⃣ R$ 500
3️⃣ R$ 1.000
4️⃣ R$ 5.000
5️⃣ Todo o saldo do banco
6️⃣ Outro valor

0️⃣ Cancelar`
        )
        return true
      }
      if(input==='6'){
        const rows=await leaderboard(10,await currentGroupPlayerJids(chat))
        clearQuickFlow(chat,sender)
        let text='🏆 *RANKING — MAIS RICOS*\n\n'
        rows.forEach((r,i)=>{
          const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`
          text+=`${medal} *${r.push_name || 'Jogador'}* — R$ ${fmt(r.total)}\n`
        })
        await reply(text.trim())
        return true
      }
      if(input==='7'){
        setQuickFlow(chat,sender,'pix_target',{},90000)
        await reply('💸 Agora *marque a pessoa* que vai receber o PIX.')
        return true
      }
      await reply('💰 Escolha de *1 a 7* ou *0* para sair.')
      return true
    }

    if(flow.stage==='pix_target'){
      const target=mentionsOf(msg)[0]
      if(!target){
        await reply('💸 Marque a pessoa usando @.')
        return true
      }
      setQuickFlow(chat,sender,'pix_amount',{target},90000)
      await reply(
`💸 *VALOR DO PIX*

1️⃣ R$ 100
2️⃣ R$ 500
3️⃣ R$ 1.000
4️⃣ R$ 5.000
5️⃣ Outro valor

0️⃣ Cancelar`
      )
      return true
    }

    if(flow.stage==='pix_amount'){
      const values={1:100,2:500,3:1000,4:5000}
      if(input==='5'){
        setQuickFlow(chat,sender,'pix_custom',flow.data,90000)
        await reply('Digite apenas o valor do PIX.')
        return true
      }
      const amount=values[input]
      if(!amount){
        await reply('Escolha de *1 a 5*.')
        return true
      }
      const r=await transfer(sender,flow.data.target,amount)
      clearQuickFlow(chat,sender)
      await reply(`💸 *PIX realizado!*\n➡️ Enviado: R$ ${fmt(r.amount)}\n🧾 Taxa: R$ ${fmt(r.fee)}\n💰 Total: R$ ${fmt(r.total)}`,{mentions:[flow.data.target]})
      return true
    }

    if(flow.stage==='pix_custom'){
      const amount=parseAmount(input)
      if(amount<1){
        await reply('Digite um valor válido.')
        return true
      }
      const r=await transfer(sender,flow.data.target,amount)
      clearQuickFlow(chat,sender)
      await reply(`💸 *PIX realizado!*\n➡️ Enviado: R$ ${fmt(r.amount)}\n🧾 Taxa: R$ ${fmt(r.fee)}\n💰 Total: R$ ${fmt(r.total)}`,{mentions:[flow.data.target]})
      return true
    }

    if(flow.stage==='deposit_amount' || flow.stage==='withdraw_amount'){
      const presets={1:100,2:500,3:1000,4:5000}
      if(input==='6'){
        setQuickFlow(chat,sender,flow.stage==='deposit_amount'?'deposit_custom':'withdraw_custom',{},90000)
        await reply('Digite apenas o valor. Exemplo: *2500*')
        return true
      }

      let amount=presets[input]
      if(input==='5'){
        if(flow.stage==='deposit_amount') amount='total'
        else {const p=await getProfile(sender);amount=Number(p.bank)}
      }
      if(!amount || (amount!=='total'&&amount<1)){
        await reply('Escolha uma opção válida.')
        return true
      }

      if(flow.stage==='deposit_amount'){
        const r=await deposit(sender,amount)
        clearQuickFlow(chat,sender)
        await reply(`🏦 Depósito concluído.\n🪙 Carteira: R$ ${fmt(r.cash)}\n🏦 Banco: R$ ${fmt(r.bank)}`)
      }else{
        const r=await withdraw(sender,amount)
        clearQuickFlow(chat,sender)
        await reply(`💵 Saque concluído.\n🪙 Carteira: R$ ${fmt(r.cash)}\n🏦 Banco: R$ ${fmt(r.bank)}`)
      }
      return true
    }

    if(flow.stage==='deposit_custom' || flow.stage==='withdraw_custom'){
      const amount=parseAmount(input)
      if(amount<1){
        await reply('Digite um valor válido.')
        return true
      }
      if(flow.stage==='deposit_custom'){
        const r=await deposit(sender,amount)
        clearQuickFlow(chat,sender)
        await reply(`🏦 Depósito concluído.\n🪙 Carteira: R$ ${fmt(r.cash)}\n🏦 Banco: R$ ${fmt(r.bank)}`)
      }else{
        const r=await withdraw(sender,amount)
        clearQuickFlow(chat,sender)
        await reply(`💵 Saque concluído.\n🪙 Carteira: R$ ${fmt(r.cash)}\n🏦 Banco: R$ ${fmt(r.bank)}`)
      }
      return true
    }

    if(flow.stage==='nav_items'){
      if(input==='1'){
        if(sender!==ownerJid && !(await groupModuleEnabled(chat,'economy_enabled'))){
          clearQuickFlow(chat,sender)
          await reply('🔒 A *Loja* foi desativada junto com a Economia deste grupo.')
          return true
        }
        await shopCategoryMenu()
        return true
      }
      if(input==='2'){
        await inventoryMenu()
        return true
      }
      if(input==='3'){
        await equipmentMenu()
        return true
      }
      if(input==='4'){
        const items=await getInventory(sender)
        const usable=items.filter(i=>i.category==='consumable')
        if(!usable.length){
          clearQuickFlow(chat,sender)
          await reply('🧪 Você não possui consumíveis utilizáveis.')
          return true
        }
        setQuickFlow(chat,sender,'use_select',{items:usable.map(i=>i.item_id)},90000)
        let text='🧪 *QUAL ITEM QUER USAR?*\n\n'
        usable.forEach((i,idx)=>text+=`*${idx+1}.* ${i.name} ×${i.quantity}\n`)
        text+='\n👉 Responda só com o número.'
        await reply(text)
        return true
      }
      if(input==='5'){
        const items=await getInventory(sender)
        const boxes=items.filter(i=>BOX_IDS.includes(i.item_id))
        if(!boxes.length){
          clearQuickFlow(chat,sender)
          await reply('🎁 Você não possui nenhuma caixa.')
          return true
        }
        if(boxes.length===1){
          await boxQuantityMenu(boxes[0])
          return true
        }
        setQuickFlow(chat,sender,'inventory_boxes_select',{boxes},90000)
        let text='🎁 *QUAL CAIXA QUER ABRIR?*\n\n'
        boxes.forEach((b,idx)=>text+=`*${idx+1}.* ${rarityLabel(b.rarity)} — ${b.name} ×${b.quantity}\n`)
        text+='\n0️⃣ Sair'
        await reply(text)
        return true
      }
      await reply('🛒 Escolha de *1 a 5* ou *0* para sair.')
      return true
    }

    if(flow.stage==='inventory_category'){
      if(input==='9'){
        setQuickFlow(chat,sender,'nav_items',{},90000)
        await reply('🛒 *ITENS E INVENTÁRIO*\n\n1️⃣ Loja\n2️⃣ Inventário\n3️⃣ Equipar\n4️⃣ Usar consumível\n5️⃣ Abrir caixas\n\n0️⃣ Sair')
        return true
      }
      const items=await getInventory(sender)
      if(input==='1'){
        await equipmentMenu()
        return true
      }
      if(input==='2'){
        const usable=items.filter(i=>i.category==='consumable')
        if(!usable.length){
          await reply('🧪 Você não possui consumíveis.')
          return true
        }
        setQuickFlow(chat,sender,'use_select',{items:usable.map(i=>i.item_id)},90000)
        let text='🧪 *CONSUMÍVEIS*\n\n'
        usable.forEach((i,idx)=>text+='*'+(idx+1)+'.* '+rarityLabel(i.rarity)+' — *'+i.name+'* ×'+i.quantity+'\n')
        text+='\n9️⃣ Voltar\n0️⃣ Sair'
        await reply(text)
        return true
      }
      if(input==='3'){
        const boxes=items.filter(i=>BOX_IDS.includes(i.item_id))
        if(!boxes.length){
          await reply('🎁 Você não possui caixas.')
          return true
        }
        if(boxes.length===1){
          await boxQuantityMenu(boxes[0])
          return true
        }
        setQuickFlow(chat,sender,'inventory_boxes_select',{boxes},90000)
        let text='🎁 *SUAS CAIXAS*\n\n'
        boxes.forEach((b,idx)=>text+='*'+(idx+1)+'.* '+rarityLabel(b.rarity)+' — *'+b.name+'* ×'+b.quantity+'\n')
        text+='\n9️⃣ Voltar\n0️⃣ Sair'
        await reply(text)
        return true
      }
      if(input==='4'){
        const others=items.filter(i=>!['weapon','armor','consumable'].includes(i.category) && !BOX_IDS.includes(i.item_id))
        if(!others.length){
          await reply('📦 Você não possui outros itens no momento.')
          return true
        }
        let text='📦 *OUTROS ITENS*\n\n'
        others.forEach((i,idx)=>text+='*'+(idx+1)+'.* '+rarityLabel(i.rarity)+' — *'+i.name+'* ×'+i.quantity+'\n')
        text+='\n9️⃣ Voltar\n0️⃣ Sair'
        await reply(text)
        return true
      }
      if(input==='5'){
        await sellMenu()
        return true
      }
      await reply('🎒 Escolha uma opção de *1 a 5*.')
      return true
    }

    if(flow.stage==='inventory_sell_select'){
      if(input==='9'){
        await inventoryMenu()
        return true
      }

      if(input.includes(',')){
        const indexes=[...new Set(input.split(',').map(x=>Number(x.trim())-1).filter(Number.isInteger))]
        const selected=indexes.map(i=>flow.data.items?.[i]).filter(Boolean)
        if(selected.length<2){
          await reply('📦 Para vender vários itens, mande pelo menos dois números. Exemplo: *1,3,5*.')
          return true
        }

        const batch=[]
        const skipped=[]
        for(const item of selected){
          if(item.rarity==='legendary'){
            skipped.push(item.name+' (lendário)')
            continue
          }
          const qty=Math.max(0,Number(item.quantity)-1)
          if(qty<1){
            skipped.push(item.name+' (sem repetidos)')
            continue
          }
          batch.push({itemId:item.item_id,name:item.name,rarity:item.rarity,qty,unit:Number(item.sell_unit)})
        }

        if(!batch.length){
          await reply('📦 Nenhum dos itens escolhidos possui cópias repetidas vendáveis.')
          return true
        }

        const total=batch.reduce((sum,i)=>sum+(i.qty*i.unit),0)
        let text='⚠️ *CONFIRMAR VENDA EM LOTE*\n\n'
        for(const i of batch){
          text+='• '+rarityLabel(i.rarity)+' *'+i.name+'* ×'+i.qty+' — R$ '+fmt(i.qty*i.unit)+'\n'
        }
        text+='\n📦 Tipos de item: *'+batch.length+'*\n💵 Total estimado: *R$ '+fmt(total)+'*'
        if(skipped.length) text+='\n\n⏭️ Ignorados: '+skipped.join(', ')
        text+='\n\n1️⃣ Confirmar venda\n2️⃣ Cancelar'

        setQuickFlow(chat,sender,'inventory_sell_batch_confirm',{batch},90000)
        await reply(text)
        return true
      }

      const item=flow.data.items?.[Number(input)-1]
      if(!item){
        await reply('💰 Escolha um item pelo número.')
        return true
      }
      const p=await getCombatProfile(sender)
      const equipped=(p.weapon_id===item.item_id || p.armor_id===item.item_id)
      const sellable=Math.max(0,Number(item.quantity)-(equipped?1:0))
      if(sellable<1){
        await reply('🔒 Essa é sua única cópia equipada. Troque o equipamento antes de vender.')
        return true
      }
      setQuickFlow(chat,sender,'inventory_sell_qty',{itemId:item.item_id,name:item.name,rarity:item.rarity,unit:Number(item.sell_unit),sellable},90000)
      await reply('💰 *VENDER '+item.name.toUpperCase()+'*\n\nVocê pode vender: *'+sellable+'*\nValor unitário: *R$ '+fmt(item.sell_unit)+'*\n\n1️⃣ Vender 1\n2️⃣ Vender 5\n3️⃣ Vender 10\n4️⃣ Vender tudo\n5️⃣ Escolher quantidade\n\n9️⃣ Voltar\n0️⃣ Sair')
      return true
    }

    if(flow.stage==='inventory_sell_qty'){
      if(input==='9'){
        await sellMenu()
        return true
      }
      if(input==='5'){
        setQuickFlow(chat,sender,'inventory_sell_custom',flow.data,90000)
        await reply('⌨️ Digite a quantidade que deseja vender. Máximo: *'+flow.data.sellable+'*.')
        return true
      }
      const qtyMap={1:1,2:5,3:10,4:Number(flow.data.sellable)}
      const qty=qtyMap[input]
      if(!qty || qty<1){
        await reply('💰 Escolha *1, 2, 3, 4 ou 5*.')
        return true
      }
      if(qty>Number(flow.data.sellable)){
        await reply('💰 Você pode vender no máximo *'+flow.data.sellable+'* unidade(s).')
        return true
      }
      setQuickFlow(chat,sender,'inventory_sell_confirm',{...flow.data,qty},90000)
      const warn=flow.data.rarity==='legendary'?'\n🌟 *ATENÇÃO: ESTE É UM ITEM LENDÁRIO!*\n':''
      await reply('⚠️ *CONFIRMAR VENDA*\n\nItem: *'+flow.data.name+'*\nQuantidade: *'+qty+'*\nVocê receberá: *R$ '+fmt(Number(flow.data.unit)*qty)+'*\n'+warn+'\n1️⃣ Confirmar venda\n2️⃣ Cancelar')
      return true
    }

    if(flow.stage==='inventory_sell_custom'){
      const qty=parseInt(input,10)
      if(!Number.isInteger(qty)||qty<1||qty>Number(flow.data.sellable)){
        await reply('💰 Digite uma quantidade de *1 a '+flow.data.sellable+'*.')
        return true
      }
      setQuickFlow(chat,sender,'inventory_sell_confirm',{...flow.data,qty},90000)
      const warn=flow.data.rarity==='legendary'?'\n🌟 *ATENÇÃO: ESTE É UM ITEM LENDÁRIO!*\n':''
      await reply('⚠️ *CONFIRMAR VENDA*\n\nItem: *'+flow.data.name+'*\nQuantidade: *'+qty+'*\nVocê receberá: *R$ '+fmt(Number(flow.data.unit)*qty)+'*\n'+warn+'\n1️⃣ Confirmar venda\n2️⃣ Cancelar')
      return true
    }

    if(flow.stage==='inventory_sell_batch_confirm'){
      if(input==='2'){
        await reply('✅ Venda em lote cancelada.')
        await sellMenu()
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Confirmar venda* ou *2 Cancelar*.')
        return true
      }
      const selections=(flow.data.batch||[]).map(i=>({itemId:i.itemId,qty:i.qty}))
      const r=await sellItemsBatch(sender,selections)
      let text='💰 *VENDA EM LOTE CONCLUÍDA*\n\n'
      r.sold.forEach(i=>{ text+='• *'+i.name+'* ×'+i.qty+' — R$ '+fmt(i.total)+'\n' })
      text+='\n📦 Tipos vendidos: *'+r.types+'*'
      text+='\n🧮 Unidades vendidas: *'+r.totalUnits+'*'
      text+='\n💵 Total recebido: *R$ '+fmt(r.total)+'*'
      text+='\n🪙 Carteira: *R$ '+fmt(r.cash)+'*'
      await reply(text)
      await inventoryMenu()
      return true
    }
    if(flow.stage==='inventory_sell_confirm'){
      if(input==='2'){
        await reply('✅ Venda cancelada.')
        await sellMenu()
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Confirmar venda* ou *2 Cancelar*.')
        return true
      }
      const r=await sellItem(sender,flow.data.itemId,flow.data.qty)
      await reply('💰 *VENDA CONCLUÍDA*\n\n📦 '+r.item.name+' ×'+r.qty+'\n💵 Recebido: *R$ '+fmt(r.total)+'*\n🎒 Restante: *'+r.remaining+'*\n🪙 Carteira: *R$ '+fmt(r.cash)+'*')
      await inventoryMenu()
      return true
    }
    if(flow.stage==='fun_shop'){
      if(input==='9'){
        await shopCategoryMenu()
        return true
      }
      if(input==='1'){
        setQuickFlow(chat,sender,'fun_confirm',{service:'joke',price:FUN_PRICES.joke},90000)
        await reply('😂 Comprar uma *Piada do Alpha Bot* por *R$ '+fmt(FUN_PRICES.joke)+'*?\n\n1️⃣ Comprar\n2️⃣ Cancelar')
        return true
      }
      if(input==='2'){
        await horoscopeSignMenu()
        return true
      }
      await reply('🎭 Escolha *1 Piada* ou *2 Horóscopo*.')
      return true
    }

    if(flow.stage==='horoscope_sign'){
      if(input==='9'){
        await funMenu()
        return true
      }
      const sign=SIGNS[Number(input)-1]
      if(!sign){
        await reply('🔮 Escolha um signo de *1 a 12*.')
        return true
      }
      setQuickFlow(chat,sender,'fun_confirm',{
        service:'horoscope',
        price:FUN_PRICES.horoscope,
        signId:sign[0],
        signName:sign[1]
      },90000)
      await reply(
        '🔮 Comprar o horóscopo de *'+sign[1]+'* por *R$ '+fmt(FUN_PRICES.horoscope)+'*?\n\n'+
        '1️⃣ Comprar\n2️⃣ Cancelar'
      )
      return true
    }

    if(flow.stage==='fun_confirm'){
      if(input==='2'){
        await funMenu()
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Comprar* ou *2 Cancelar*.')
        return true
      }

      const service=flow.data.service
      const signId=flow.data.signId
      const signName=flow.data.signName
      const r=await purchaseService(sender,service,Number(flow.data.price))

      if(service==='joke'){
        setQuickFlow(chat,sender,'fun_after',{service:'joke'},5*60*1000)
        await reply(
          '😂 *PIADA DO ALPHA BOT*\n\n'+jokeText()+
          '\n\n💸 Pago: *R$ '+fmt(r.price)+'*\n🪙 Carteira: *R$ '+fmt(r.cash)+'*'+
          '\n\n1️⃣ 😂 Comprar outra — R$ '+fmt(FUN_PRICES.joke)+
          '\n0️⃣ Sair'
        )
      }else{
        setQuickFlow(chat,sender,'fun_after',{service:'horoscope'},5*60*1000)
        await reply(
          horoscopeText(signId,signName)+
          '\n\n💸 Pago: *R$ '+fmt(r.price)+'*\n🪙 Carteira: *R$ '+fmt(r.cash)+'*'+
          '\n\n1️⃣ 🔮 Comprar outro horóscopo — R$ '+fmt(FUN_PRICES.horoscope)+
          '\n0️⃣ Sair'
        )
      }
      return true
    }

    if(flow.stage==='fun_after'){
      if(input!=='1'){
        await reply('Escolha *1 Comprar outro* ou *0 Sair*.')
        return true
      }

      if(flow.data.service==='joke'){
        const r=await purchaseService(sender,'joke',FUN_PRICES.joke)
        setQuickFlow(chat,sender,'fun_after',{service:'joke'},5*60*1000)
        await reply(
          '😂 *PIADA DO ALPHA BOT*\n\n'+jokeText()+
          '\n\n💸 Pago: *R$ '+fmt(r.price)+'*\n🪙 Carteira: *R$ '+fmt(r.cash)+'*'+
          '\n\n1️⃣ 😂 Comprar outra — R$ '+fmt(FUN_PRICES.joke)+
          '\n0️⃣ Sair'
        )
        return true
      }

      await horoscopeSignMenu()
      return true
    }

    if(flow.stage==='shop_category'){
      if(input==='5'){
        await funMenu()
        return true
      }
      if(input==='6'){
        setQuickFlow(chat,sender,'shop_car_select',{},90000)
        let text='🚗 *LOJA DE CARROS*\n\n'
        CARS.forEach((car,i)=>text+=`*${i+1}.* ${car.name} — *R$ ${fmt(car.price)}*\n`)
        text+='\n👉 Responda só com o número para comprar.\n9️⃣ Voltar\n0️⃣ Sair'
        await reply(text)
        return true
      }
      if(input==='8'){
        const shop=await getShop()
        const keys=shop.filter(i=>/^chave_raid_(10|15|20|25|30|40|50)$/.test(i.id))
        setQuickFlow(chat,sender,'shop_raid_key_select',{items:keys.map(i=>i.id)},90000)
        let text='🔑 *CHAVES DE RAID*\n\n'
        keys.forEach((i,idx)=>{
          const level=Number(String(i.id).split('_').pop())
          text+=`*${idx+1}.* ${rarityLabel(i.rarity)} — *${i.name}*\n💰 R$ ${fmt(i.price)} • 🔒 Nível ${level}+\n_${i.description}_\n\n`
        })
        text+='9️⃣ Voltar\n0️⃣ Sair'
        await reply(text.trim())
        return true
      }
      if(input==='7'){
        setQuickFlow(chat,sender,'shop_delivery_select',{},90000)
        let text='🚲🏍️ *DELIVERY — BICICLETAS E MOTOS*\n\n'
        MOTORCYCLES.forEach((v,i)=>text+=`*${i+1}.* ${v.name} — *R$ ${fmt(v.price)}*\n`)
        text+='\n👉 Responda só com o número para comprar.\n9️⃣ Voltar\n0️⃣ Sair'
        await reply(text)
        return true
      }
      if(!['1','2','3','4'].includes(input)){
        await reply('🍀 Escolha uma opção de *1 a 8*.')
        return true
      }
      const items=await getShop()
      const filtered=shopCategoryItems(items,input)
      if(!filtered.length){
        await reply('Nenhum item disponível nesta categoria.')
        return true
      }
      setQuickFlow(chat,sender,'shop_item',{
        items:filtered.map(i=>i.id),
        category:input
      },90000)
      let text=`${shopCategoryLabel(filtered[0].category)}\n\n`
      filtered.forEach((i,idx)=>{
        text+=`*${idx+1}.* ${rarityLabel(i.rarity)} — *${i.name}*\n💰 R$ ${fmt(i.price)}\n_${i.description}_\n\n`
      })
      text+='9️⃣ Voltar\n0️⃣ Sair'
      await reply(text.trim())
      return true
    }

    if(flow.stage==='shop_raid_key_select'){
      if(input==='9'){ await shopCategoryMenu(); return true }
      const itemId=flow.data.items?.[Number(input)-1]
      if(!itemId){ await reply('🔑 Escolha uma chave pelo número.'); return true }
      const level=Number(String(itemId).split('_').pop())
      const p=await getProfile(sender)
      if(Number(p?.level||1)<level){
        await reply(`🔒 Essa chave exige *nível ${level}*. Seu nível atual é *${Number(p?.level||1)}*.`)
        return true
      }
      const shop=await getShop()
      const item=shop.find(i=>i.id===itemId)
      setQuickFlow(chat,sender,'shop_raid_key_confirm',{itemId,level,name:item?.name||itemId,price:Number(item?.price||0)},90000)
      await reply(`🔑 *${item?.name||itemId}*\n\n💰 Preço: *R$ ${fmt(item?.price||0)}*\n⚔️ Requisito: *Nível ${level}+*\n\n1️⃣ Comprar\n2️⃣ Cancelar\n9️⃣ Voltar`)
      return true
    }

    if(flow.stage==='shop_raid_key_confirm'){
      if(input==='9'){ await shopCategoryMenu(); return true }
      if(input==='2'){ await shopCategoryMenu(); return true }
      if(input!=='1'){ await reply('Escolha *1 Comprar*, *2 Cancelar* ou *9 Voltar*.'); return true }
      const p=await getProfile(sender)
      if(Number(p?.level||1)<Number(flow.data.level||0)){
        await reply(`🔒 Você precisa estar no *nível ${flow.data.level}* para comprar esta chave.`)
        return true
      }
      const r=await buyItem(sender,flow.data.itemId,1)
      await progressDailyMission(sender,'shop')
      clearQuickFlow(chat,sender)
      await reply(`🔑 *CHAVE COMPRADA!*\n\n📦 ${r.item.name}\n💸 R$ ${fmt(r.total)}\n\nAgora use *!raid ${flow.data.level}* dentro do grupo.`)
      return true
    }

    if(flow.stage==='shop_car_select'){
      if(input==='9'){ await shopCategoryMenu(); return true }
      if(!/^[1-5]$/.test(input)){ await reply('🚗 Escolha um carro de *1 a 5*.'); return true }
      const car=CARS[Number(input)-1]
      setQuickFlow(chat,sender,'shop_car_confirm',{id:car.id,name:car.name,price:car.price},90000)
      await reply(`🚗 Comprar *${car.name}* por *R$ ${fmt(car.price)}*?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
      return true
    }

    if(flow.stage==='shop_car_confirm'){
      if(input==='2'){ await shopCategoryMenu(); return true }
      if(input!=='1'){ await reply('Escolha *1 Confirmar* ou *2 Cancelar*.'); return true }
      const car=await buyCar(sender,flow.data.id)
      clearQuickFlow(chat,sender)
      await reply(`✅ *CARRO COMPRADO!*\n🚗 ${car.name}\n💰 R$ ${fmt(car.price)}\n\nUse *${prefix}uber* para trabalhar.`)
      return true
    }

    if(flow.stage==='shop_delivery_select'){
      if(input==='9'){ await shopCategoryMenu(); return true }
      if(!/^[1-6]$/.test(input)){ await reply('🚲🏍️ Escolha um veículo de *1 a 6*.'); return true }
      const v=MOTORCYCLES[Number(input)-1]
      setQuickFlow(chat,sender,'shop_delivery_confirm',{id:v.id,name:v.name,price:v.price},90000)
      await reply(`🚲🏍️ Comprar *${v.name}* por *R$ ${fmt(v.price)}*?\n\n1️⃣ Confirmar\n2️⃣ Cancelar`)
      return true
    }

    if(flow.stage==='shop_delivery_confirm'){
      if(input==='2'){ await shopCategoryMenu(); return true }
      if(input!=='1'){ await reply('Escolha *1 Confirmar* ou *2 Cancelar*.'); return true }
      const v=await buyMotorcycle(sender,flow.data.id)
      clearQuickFlow(chat,sender)
      await reply(`✅ *VEÍCULO COMPRADO!*\n🚲🏍️ ${v.name}\n💰 R$ ${fmt(v.price)}\n\nBike: *${prefix}ifoodbike* • Moto: *${prefix}ifood*`)
      return true
    }

    if(flow.stage==='shop_item'){
      if(input==='9'){
        await shopCategoryMenu()
        return true
      }
      const index=Number(input)-1
      const itemId=flow.data.items?.[index]
      if(!itemId){
        await reply('🛒 Escolha um item pelo número.')
        return true
      }
      const shop=await getShop()
      const item=shop.find(i=>i.id===itemId)
      setQuickFlow(chat,sender,'shop_qty',{itemId,itemName:item?.name||itemId,price:Number(item?.price||0)},90000)
      await reply(
`🛒 *${item?.name||itemId}*

1️⃣ 1 unidade
2️⃣ 2 unidades
3️⃣ 5 unidades
4️⃣ 10 unidades
5️⃣ Outra quantidade

0️⃣ Cancelar`
      )
      return true
    }

    if(flow.stage==='shop_qty'){
      const qtyMap={1:1,2:2,3:5,4:10}
      if(input==='5'){
        setQuickFlow(chat,sender,'shop_qty_custom',flow.data,90000)
        await reply('Digite apenas a quantidade desejada, de *1 a 99*.')
        return true
      }
      const qty=qtyMap[input]
      if(!qty){
        await reply('Escolha de *1 a 5*.')
        return true
      }
      const r=await buyItem(sender,flow.data.itemId,qty)
      await progressDailyMission(sender,'shop')
      clearQuickFlow(chat,sender)
      await reply(`🛒 Compra concluída!\n📦 ${r.item.name} ×${r.qty}\n💸 R$ ${fmt(r.total)}`)
      return true
    }

    if(flow.stage==='shop_qty_custom'){
      const qty=parseInt(input,10)
      if(!Number.isInteger(qty)||qty<1||qty>99){
        await reply('Digite uma quantidade de *1 a 99*.')
        return true
      }
      const r=await buyItem(sender,flow.data.itemId,qty)
      await progressDailyMission(sender,'shop')
      clearQuickFlow(chat,sender)
      await reply(`🛒 Compra concluída!\n📦 ${r.item.name} ×${r.qty}\n💸 R$ ${fmt(r.total)}`)
      return true
    }

    if(flow.stage==='market_sell_select'){
      const item=flow.data.items?.[Number(input)-1]
      if(!item){
        await reply('🏪 Escolha um item pelo número.')
        return true
      }
      setQuickFlow(chat,sender,'market_sell_price',{itemId:item.item_id,name:item.name},5*60*1000)
      await reply(`🏷️ *${item.name}*\n\nDigite o valor que quer anunciar.\nEx.: *20000*\n\n0️⃣ Cancelar`)
      return true
    }

    if(flow.stage==='market_sell_price'){
      const price=parseAmount(rawInput)
      if(!Number.isInteger(price)||price<1){
        await reply('💰 Digite um valor válido maior que zero. Ex.: *20000*')
        return true
      }
      try{
        const x=await createMarketListing(sender,flow.data.itemId,1,price)
        clearQuickFlow(chat,sender)
        await reply(`🏪 *ANÚNCIO CRIADO!*\n\n#${x.id} • *${flow.data.name}* ×1\n💰 Valor: *R$ ${Number(x.price).toLocaleString('pt-BR')}*\n\nQuem quiser comprar usa *!compraritem*.`)
      }catch(err){
        clearQuickFlow(chat,sender)
        await reply('❌ '+(err?.message||'Não foi possível criar o anúncio.'))
      }
      return true
    }

    if(flow.stage==='market_buy_select'){
      const listing=flow.data.items?.[Number(input)-1]
      if(!listing){
        await reply('🛒 Escolha um anúncio pelo número.')
        return true
      }
      setQuickFlow(chat,sender,'market_buy_confirm',{id:listing.id,name:listing.name,quantity:listing.quantity,price:listing.price,seller:listing.seller_name},90000)
      await reply(`🛒 *CONFIRMAR COMPRA?*\n\n📦 *${listing.name}* ×${listing.quantity}\n👤 Vendedor: *${listing.seller_name||'Jogador'}*\n💰 Valor: *R$ ${Number(listing.price).toLocaleString('pt-BR')}*\n\n1️⃣ Sim\n2️⃣ Não`)
      return true
    }

    if(flow.stage==='market_buy_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Compra cancelada.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Sim* ou *2 Não*.')
        return true
      }
      try{
        const x=await buyMarketListing(sender,flow.data.id)
        clearQuickFlow(chat,sender)
        await reply(`✅ *COMPRA CONCLUÍDA!*\n\n📦 ${x.name} ×${x.quantity}\n💰 R$ ${Number(flow.data.price||0).toLocaleString('pt-BR')}`)
      }catch(err){
        clearQuickFlow(chat,sender)
        await reply('❌ '+(err?.message||'Não foi possível concluir a compra.'))
      }
      return true
    }

    if(flow.stage==='inventory_select'){
      const item=flow.data.items?.[Number(input)-1]
      if(!item){
        await reply('🎒 Escolha um item pelo número.')
        return true
      }
      if(['weapon','armor'].includes(item.category)){
        setQuickFlow(chat,sender,'inventory_equip_confirm',{itemId:item.item_id,name:item.name},90000)
        await reply(`⚙️ Equipar *${item.name}*?\n\n1️⃣ Sim\n2️⃣ Não`)
        return true
      }
      if(item.category==='consumable'){
        setQuickFlow(chat,sender,'inventory_use_confirm',{itemId:item.item_id,name:item.name},90000)
        await reply(`🧪 Usar *${item.name}*?\n\n1️⃣ Sim\n2️⃣ Não`)
        return true
      }
      if(BOX_IDS.includes(item.item_id)){
        await boxQuantityMenu(item)
        return true
      }
      clearQuickFlow(chat,sender)
      await reply(`📦 *${item.name}* não possui ação direta no momento.`)
      return true
    }

    if(flow.stage==='inventory_equip_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Cancelado.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Sim* ou *2 Não*.')
        return true
      }
      const r=await equipItem(sender,flow.data.itemId)
      clearQuickFlow(chat,sender)
      await reply(`✅ *EQUIPADO!*\n${r.name} agora está ativo.`)
      return true
    }

    if(flow.stage==='inventory_use_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Cancelado.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Sim* ou *2 Não*.')
        return true
      }
      const itemId=flow.data.itemId
      if(itemId==='energetico_pet'){
        const r=await usePetEnergyItem(sender,itemId)
        clearQuickFlow(chat,sender)
        await reply(`⚡ *ENERGÉTICO PET USADO!*\n\n🐾 ${r.petName}\n🔋 Energia: *${r.before} → ${r.energy}/${r.max}*\n⚡ Recuperado: *+${r.recovered}*\n📦 Restam: *${r.remaining}*`)
        return true
      }
      if(['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica'].includes(itemId)){
        const r=await usePetPotion(sender,itemId)
        clearQuickFlow(chat,sender)
        await reply(`🐾🧪 *${r.name} usada!*\n❤️ ${r.petName}: +${r.healed} HP\nHP atual: *${r.hp}/${r.maxHp}*\n📦 Restam: *${r.remaining}*`)
        return true
      }
      const r=await usePotion(sender,itemId)
      clearQuickFlow(chat,sender)
      await reply(`🧪 *${r.name} usada!*\n❤️ +${r.healed} HP\nHP atual: ${r.hp}/${r.maxHp}`)
      return true
    }

    if(flow.stage==='inventory_boxes_select'){
      if(input==='9'){
        await inventoryMenu()
        return true
      }
      const box=flow.data.boxes?.[Number(input)-1]
      if(!box){
        await reply('🎁 Escolha uma caixa pelo número.')
        return true
      }
      await boxQuantityMenu(box)
      return true
    }

    if(flow.stage==='inventory_box_qty'){
      if(input==='9'){
        await inventoryMenu()
        return true
      }

      const stock=Number(flow.data.stock||0)
      const boxId=flow.data.boxId||'caixa_sorte'
      if(input==='4'){
        setQuickFlow(chat,sender,'inventory_box_all_confirm',{qty:stock,boxId,boxName:flow.data.boxName},90000)
        await reply(
`⚠️ *ABRIR TODAS AS CAIXAS?*

Você vai abrir *${stock} ${flow.data.boxName||'caixa(s)'}* de uma vez.

1️⃣ Confirmar
2️⃣ Cancelar`
        )
        return true
      }

      if(input==='5'){
        setQuickFlow(chat,sender,'inventory_box_custom',{stock,boxId,boxName:flow.data.boxName},90000)
        await reply(`⌨️ Digite quantas caixas quer abrir.\nVocê possui *${stock}*.\n\n0️⃣ Sair`)
        return true
      }

      const qtyMap={1:1,2:5,3:10}
      const qty=qtyMap[input]
      if(!qty){
        await reply('🎁 Escolha *1, 2, 3, 4 ou 5*.')
        return true
      }
      if(qty>stock){
        await reply(`🎁 Você possui apenas *${stock}* caixa(s). Escolha outra quantidade.`)
        return true
      }

      const r=await openLootBoxes(sender,boxId,qty)
      clearQuickFlow(chat,sender)
      await reply(luckyBoxSummary(r))
      await beginLootDisposition(chat,sender,r,reply)
      return true
    }

    if(flow.stage==='inventory_box_custom'){
      const stock=Number(flow.data.stock||0)
      const qty=parseInt(input,10)
      if(!Number.isInteger(qty)||qty<1){
        await reply('🎁 Digite uma quantidade válida maior que zero.')
        return true
      }
      if(qty>stock){
        await reply(`🎁 Você possui apenas *${stock}* caixa(s).`)
        return true
      }
      const r=await openLootBoxes(sender,flow.data.boxId||'caixa_sorte',qty)
      clearQuickFlow(chat,sender)
      await reply(luckyBoxSummary(r))
      await beginLootDisposition(chat,sender,r,reply)
      return true
    }

    if(flow.stage==='inventory_box_all_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Abertura cancelada.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Confirmar* ou *2 Cancelar*.')
        return true
      }
      const r=await openLootBoxes(sender,flow.data.boxId||'caixa_sorte',Number(flow.data.qty||0))
      clearQuickFlow(chat,sender)
      await reply(luckyBoxSummary(r))
      await beginLootDisposition(chat,sender,r,reply)
      return true
    }

    if(flow.stage==='nav_rpg'){
      if(input==='1'){
        const p=await getCombatProfile(sender)
        clearQuickFlow(chat,sender)
        await reply(
`⚔️ *STATUS RPG*
⭐ Nível: ${p.level}
❤️ HP: ${p.hp}/${p.max_hp}
⚔️ ATK: ${p.effective_atk}
🛡️ DEF: ${p.effective_def}
🗡️ ${p.weapon_name}
🥋 ${p.armor_name}`
        )
        return true
      }
      if(input==='2'){
        const r=await dungeon(sender)
        clearQuickFlow(chat,sender)
        if(!r.ok) await reply(`⏳ Nova dungeon em ${duration(r.remaining)}.`)
        else{
          await progressDailyMission(sender,'dungeon')
          if(r.won) await reply(`🏆 Você venceu *${r.monster}*!\n💰 +R$ ${fmt(r.cash)}\n✨ +${r.exp} EXP\n❤️ HP: ${r.hp}/${r.maxHp}`)
          else await reply(`💀 Você perdeu para *${r.monster}*.\n❤️ Recuperou para ${r.hp}/${r.maxHp} HP.`)
        }
        return true
      }
      if(input==='3'){
        setQuickFlow(chat,sender,'battle_target',{},90000)
        await reply('⚔️ Agora *marque a pessoa* que você quer desafiar.')
        return true
      }
      if(input==='4'){
        setQuickFlow(chat,sender,'rob_target',{},90000)
        await reply('🥷 Agora *marque a pessoa* que você quer tentar roubar.')
        return true
      }
      if(input==='5'){
        const rows=await combatLeaderboard(10)
        clearQuickFlow(chat,sender)
        let text='⚔️ *RANKING RPG*\n\n'
        rows.forEach((r,i)=>text+=`${i+1}. *${r.push_name || 'Jogador'}* — Nv.${r.level} | ${r.win}V/${r.loss}D\n`)
        await reply(text.trim())
        return true
      }
      if(input==='6'){
        const active=await getRaidStatus(chat)
        if(active && ['lobby','active'].includes(active.status) && Number(active.expiresAt||0)>Date.now()){
          clearQuickFlow(chat,sender)
          const players=Object.values(active.players||{})
          let text=`⚔️ *RAID ${active.status==='lobby'?'AGUARDANDO':'EM ANDAMENTO'}*\n\n👹 *${active.name} — Lv.${active.level}*\n❤️ HP: *${Number(active.hp).toLocaleString('pt-BR')}/${Number(active.maxHp).toLocaleString('pt-BR')}*\n⚔️ ATK: *${active.atk}*\n👥 Jogadores: *${players.length}/5*`
          if(active.status==='lobby') text+='\n\n👉 Quem quiser entrar usa *!entrar*.\n🚀 Quando todos estiverem prontos, o host usa *!go*.'
          else text+='\n\nUse *!raid* para acompanhar o combate.'
          await reply(text)
          return true
        }
        const raids=getRaidCatalog()
        setQuickFlow(chat,sender,'raid_select',{levels:raids.map(r=>r.level)},5*60*1000)
        let text='⚔️ *RAIDS DO RPG*\n\n'
        raids.forEach((r,i)=>{text+=`*${i+1}️⃣ Lv.${r.level} — ${r.name}*\n❤️ ${r.hp.toLocaleString('pt-BR')} HP • ⚔️ ${r.atk} ATK\n🔑 Chave: R$ ${fmt(r.keyPrice)}\n\n`})
        text+='👉 Responda apenas com o *número da Raid*.\n🔑 Chaves: *!loja → Chaves de Raid*\n0️⃣ Sair'
        await reply(text)
        return true
      }
      await reply('⚔️ Escolha de *1 a 6*.')
      return true
    }

    if(flow.stage==='raid_select'){
      const levels=flow.data?.levels||[]
      const idx=Number(input)-1
      const level=levels[idx]
      if(!level){
        await reply('⚔️ Escolha uma Raid de *1 a '+levels.length+'* ou *0* para sair.')
        return true
      }
      try{
        const r=await createRaid(chat,sender,msg.pushName||'Jogador',level)
        await progressDailyMission(sender,'game')
        clearQuickFlow(chat,sender)
        await reply(`⚔️ *SALA DE RAID ABERTA!*\n\n👹 *${r.name} — Lv.${r.level}*\n❤️ HP: *${Number(r.maxHp||r.hp).toLocaleString('pt-BR')}*\n⚔️ ATK: *${r.atk}*\n👥 Você já entrou como host.\n\n👉 Agora espere os outros mandarem *!entrar*.\n🚀 Quando todo mundo estiver pronto, use *!go*.\n⏳ Máximo: 5 jogadores • mínimo: 2.`)
      }catch(err){
        await reply('❌ '+(err?.message||'Não foi possível abrir essa Raid.'))
      }
      return true
    }

    if(flow.stage==='battle_target'){
      const targetMention=mentionsOf(msg)[0]
      if(!targetMention){
        await reply('⚔️ Marque uma pessoa usando @.')
        return true
      }
      const targetIdentity=await resolvePlayerIdentity(sock,chat,targetMention,msg)
      const target=targetIdentity.jid
      if(!target?.endsWith('@s.whatsapp.net')){
        await reply('⚠️ Não consegui identificar essa pessoa. Peça para ela enviar qualquer comando e tente novamente.')
        return true
      }
      await consolidateUserIdentity(target,targetIdentity.aliases)
      const r=await battle(sender,target)
      if(!r.ok){
        clearQuickFlow(chat,sender)
        await reply(`⏳ Você poderá batalhar novamente em ${duration(r.remaining)}.`)
        return true
      }
      await progressDailyMission(sender,'battle')
      if(String(chat).endsWith('@g.us')) await progressGroupMission(chat,sender,'battle')
      clearQuickFlow(chat,sender)
      await reply(`⚔️ *BATALHA ENCERRADA!*\n🏆 Vencedor: *${r.winner.name}*\n💰 Prêmio: R$ ${fmt(r.reward)}`,{mentions:[targetMention]})
      return true
    }

    if(flow.stage==='rob_target'){
      const targetMention=mentionsOf(msg)[0]
      if(!targetMention){
        await reply('🥷 Marque uma pessoa usando @.')
        return true
      }
      const targetIdentity=await resolvePlayerIdentity(sock,chat,targetMention,msg)
      const target=targetIdentity.jid
      if(!target?.endsWith('@s.whatsapp.net')){
        await reply('⚠️ Não consegui identificar essa pessoa. Peça para ela enviar qualquer comando e tente novamente.')
        return true
      }
      await consolidateUserIdentity(target,targetIdentity.aliases)
      const r=await robPlayer(sender,target)
      clearQuickFlow(chat,sender)
      if(!r.ok) await reply(`⏳ Tente roubar novamente em ${duration(r.remaining)}.`)
      else if(r.success) await reply(`🥷 Roubo bem-sucedido! Você levou *R$ ${fmt(r.amount)}*.`,{mentions:[targetMention]})
      else await reply(`🚔 Você falhou e pagou multa de *R$ ${fmt(r.fine)}*.`,{mentions:[targetMention]})
      return true
    }

    if(flow.stage==='nav_progress'){
      if(input==='1'){
        const r=await getDailyMissions(sender)
        clearQuickFlow(chat,sender)
        let text='📋 *MISSÕES DIÁRIAS*\n\n'
        r.missions.forEach((m,i)=>text+=`${i+1}. ${Number(m.progress)>=Number(m.target)?'✅':'⬜'} *${m.title}* — ${m.progress}/${m.target}\n`)
        await reply(text.trim())
        return true
      }
      if(input==='2'){
        const r=await claimDailyMissions(sender)
        clearQuickFlow(chat,sender)
        if(!r.claimed) await reply('📋 Nenhuma missão concluída para resgatar.')
        else await reply(`🎁 Missões resgatadas: ${r.claimed}\n💰 R$ ${fmt(r.cash)}\n🎁 Caixas: ${r.boxes}`)
        return true
      }
      if(input==='3'){
        setQuickFlow(chat,sender,'house_select',{},90000)
        let text='🏠 *ESCOLHA UM IMÓVEL*\n\n'
        HOUSES.forEach((h,i)=>text+=`*${i+1}.* ${h.name} — R$ ${fmt(h.price)}\n`)
        text+='\n0️⃣ Cancelar'
        await reply(text)
        return true
      }
      if(input==='4'){
        setQuickFlow(chat,sender,'car_select',{},90000)
        let text='🚗 *ESCOLHA UM CARRO*\n\n'
        CARS.forEach((c,i)=>text+=`*${i+1}.* ${c.name} — R$ ${fmt(c.price)}\n`)
        text+='\n0️⃣ Cancelar'
        await reply(text)
        return true
      }
      if(input==='5'){
        const p=await getPatrimony(sender)
        clearQuickFlow(chat,sender)
        await reply(`💎 *SEU PATRIMÔNIO*\n\n🪙 Carteira: R$ ${fmt(p.cash)}\n🏦 Banco: R$ ${fmt(p.bank)}\n🎒 Itens: R$ ${fmt(p.inventory_value)}\n🏠 Imóvel: R$ ${fmt(p.home_value)}\n🚗 Veículos: R$ ${fmt(p.cars_value)}\n\n💰 *Total: R$ ${fmt(p.total)}*`)
        return true
      }
      if(input==='6'){
        const rows=await patrimonyLeaderboard(10)
        clearQuickFlow(chat,sender)
        let text='💎 *RANKING DE PATRIMÔNIO*\n\n'
        rows.forEach((r,i)=>text+=`${i+1}. *${r.push_name||'Jogador'}* — R$ ${fmt(r.total)}\n`)
        await reply(text.trim())
        return true
      }
      await reply('📋 Escolha de *1 a 6*.')
      return true
    }

    if(flow.stage==='house_select'){
      const item=HOUSES[Number(input)-1]
      if(!item){
        await reply('🏠 Escolha um imóvel pelo número.')
        return true
      }
      const current=await getHome(sender)
      const tradeIn=current?Math.floor(current.price*.60):0
      const cost=Math.max(0,item.price-tradeIn)
      setQuickFlow(chat,sender,'house_confirm',{id:item.id,name:item.name,cost,tradeIn,current:current?.name||null},90000)
      await reply(
`🏠 *CONFIRMAR COMPRA*

Imóvel: *${item.name}*
Valor: R$ ${fmt(item.price)}
${current?`Entrada da ${current.name}: R$ ${fmt(tradeIn)}\n`:''}💸 A pagar: *R$ ${fmt(cost)}*

1️⃣ Confirmar
2️⃣ Cancelar`
      )
      return true
    }

    if(flow.stage==='house_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Compra cancelada.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Confirmar* ou *2 Cancelar*.')
        return true
      }
      const r=await buyHouse(sender,flow.data.id)
      clearQuickFlow(chat,sender)
      await reply(`🏠 *NOVA CASA!*\n🏡 ${r.house.name}\n💸 Pago: R$ ${fmt(r.cost)}`)
      return true
    }

    if(flow.stage==='car_select'){
      const item=CARS[Number(input)-1]
      if(!item){
        await reply('🚗 Escolha um carro pelo número.')
        return true
      }
      setQuickFlow(chat,sender,'car_confirm',{id:item.id,name:item.name,price:item.price},90000)
      await reply(
`🚗 *CONFIRMAR COMPRA*

Carro: *${item.name}*
Valor: *R$ ${fmt(item.price)}*

1️⃣ Confirmar
2️⃣ Cancelar`
      )
      return true
    }

    if(flow.stage==='car_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Compra cancelada.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Confirmar* ou *2 Cancelar*.')
        return true
      }
      const c=await buyCar(sender,flow.data.id)
      clearQuickFlow(chat,sender)
      await reply(`🚗 *CARRO COMPRADO!*\n🔑 ${c.name}\n💰 R$ ${fmt(c.price)}`)
      return true
    }

    if(flow.stage==='clan_menu'){
      const clan=await getClanForUser(sender)
      if(!clan){
        if(input==='1'){
          setQuickFlow(chat,sender,'clan_create_name',{},90000)
          await reply('🏴 Digite agora o *nome do clã* que deseja criar.\n💰 Custo: R$ 10.000')
          return true
        }
        if(input==='2'){
          const r=await acceptClanInvite(sender)
          clearQuickFlow(chat,sender)
          await reply(`🏴 Você entrou no clã *${r.name}*!`)
          return true
        }
        if(input==='3'){
          const rows=await listClans(10)
          clearQuickFlow(chat,sender)
          let text='🏴 *RANKING DE CLÃS*\n\n'
          rows.forEach((c,i)=>text+=`${i+1}. *${c.name}* — Nv.${c.level} | ${c.members} membros\n`)
          await reply(text.trim())
          return true
        }
        await reply('🏴 Escolha *1, 2 ou 3*.')
        return true
      }

      const leader=clan.role==='leader'
      if(input==='1'){
        clearQuickFlow(chat,sender)
        await reply(`🏴 *CLÃ ${clan.name}*\n⭐ Nível: ${clan.level}\n👥 Membros: ${clan.members}\n💰 Cofre: R$ ${fmt(clan.treasury)}\n👑 Cargo: ${leader?'Líder':'Membro'}`)
        return true
      }
      if(input==='2'){
        setQuickFlow(chat,sender,'clan_donate',{},90000)
        await reply(
`💰 *QUANTO DOAR AO CLÃ?*

1️⃣ R$ 100
2️⃣ R$ 1.000
3️⃣ R$ 5.000
4️⃣ R$ 10.000
5️⃣ Outro valor

0️⃣ Cancelar`
        )
        return true
      }
      if(input==='3'){
        setQuickFlow(chat,sender,'clan_invite_target',{},90000)
        await reply('🏴 Agora *marque a pessoa* que deseja convidar.')
        return true
      }
      if(input==='4'){
        const rows=await listClans(10)
        clearQuickFlow(chat,sender)
        let text='🏴 *RANKING DE CLÃS*\n\n'
        rows.forEach((c,i)=>text+=`${i+1}. *${c.name}* — Nv.${c.level} | ${c.members} membros\n`)
        await reply(text.trim())
        return true
      }
      if(leader && input==='5'){
        setQuickFlow(chat,sender,'clan_transfer_target',{},90000)
        await reply('👑 Marque o membro que receberá a liderança.')
        return true
      }
      if(leader && input==='6'){
        setQuickFlow(chat,sender,'clan_kick_target',{},90000)
        await reply('🚪 Marque o membro que deseja expulsar.')
        return true
      }
      if((leader && input==='7') || (!leader && input==='5')){
        setQuickFlow(chat,sender,'clan_leave_confirm',{},90000)
        await reply('🏴 Tem certeza que deseja sair do clã?\n\n1️⃣ Sim\n2️⃣ Não')
        return true
      }
      await reply('🏴 Escolha uma das opções exibidas.')
      return true
    }

    if(flow.stage==='clan_create_name'){
      const name=String(body||'').trim()
      if(name.length<3){
        await reply('O nome precisa ter pelo menos 3 caracteres.')
        return true
      }
      const c=await createClan(sender,name)
      clearQuickFlow(chat,sender)
      await reply(`🏴 Clã *${c.name}* criado!\n👑 Você é o líder.\n💰 Custo: R$ 10.000`)
      return true
    }

    if(flow.stage==='clan_donate'){
      const values={1:100,2:1000,3:5000,4:10000}
      if(input==='5'){
        setQuickFlow(chat,sender,'clan_donate_custom',{},90000)
        await reply('Digite apenas o valor da doação.')
        return true
      }
      const amount=values[input]
      if(!amount){
        await reply('Escolha de *1 a 5*.')
        return true
      }
      const r=await donateClan(sender,amount)
      clearQuickFlow(chat,sender)
      await reply(`🏴 Doação realizada: R$ ${fmt(r.amount)}\n🏦 Cofre: R$ ${fmt(r.treasury)}\n⭐ Nível: ${r.level}`)
      return true
    }

    if(flow.stage==='clan_donate_custom'){
      const amount=parseAmount(input)
      if(amount<100){
        await reply('Doação mínima: R$ 100.')
        return true
      }
      const r=await donateClan(sender,amount)
      clearQuickFlow(chat,sender)
      await reply(`🏴 Doação realizada: R$ ${fmt(r.amount)}\n🏦 Cofre: R$ ${fmt(r.treasury)}`)
      return true
    }

    if(flow.stage==='clan_invite_target'){
      const target=mentionsOf(msg)[0]
      if(!target){
        await reply('🏴 Marque alguém usando @.')
        return true
      }
      const r=await inviteToClan(sender,target)
      clearQuickFlow(chat,sender)
      await reply(`🏴 Convite enviado para entrar no clã *${r.clan.name}*.`,{mentions:[target]})
      return true
    }

    if(flow.stage==='clan_transfer_target'){
      const target=mentionsOf(msg)[0]
      if(!target){
        await reply('👑 Marque um membro usando @.')
        return true
      }
      const r=await transferClanLeadership(sender,target)
      clearQuickFlow(chat,sender)
      await reply(`👑 Liderança do clã *${r.name}* transferida.`,{mentions:[target]})
      return true
    }

    if(flow.stage==='clan_kick_target'){
      const target=mentionsOf(msg)[0]
      if(!target){
        await reply('🚪 Marque um membro usando @.')
        return true
      }
      const r=await kickClanMember(sender,target)
      clearQuickFlow(chat,sender)
      await reply(`🚪 Membro removido do clã *${r.name}*.`,{mentions:[target]})
      return true
    }

    if(flow.stage==='clan_leave_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Cancelado.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Sim* ou *2 Não*.')
        return true
      }
      const r=await leaveClan(sender)
      clearQuickFlow(chat,sender)
      await reply(r.dissolved?`🏴 O clã *${r.name}* foi encerrado.`:`🏴 Você saiu do clã *${r.name}*.`)
      return true
    }

    if(flow.stage==='group_config'){
      if(!chat.endsWith('@g.us')){
        clearQuickFlow(chat,sender)
        await reply('💚 Esta configuração só existe dentro de grupos.')
        return true
      }
      if(!(await senderIsGroupAdmin(chat,sender))){
        clearQuickFlow(chat,sender)
        await reply('🔒 Apenas administradores deste grupo podem alterar estas configurações.')
        return true
      }

      if(input==='9'){
        setQuickFlow(chat,sender,'nav_group',{},90000)
        await reply(
`💚 *GRUPO / ASSINATURA*

1️⃣ Status do grupo
2️⃣ Assinar / renovar
3️⃣ Termos
4️⃣ ⚙️ Configurações do grupo

0️⃣ Sair`
        )
        return true
      }

      const map={
        '1':['economy_enabled','Economia'],
        '2':['rpg_enabled','RPG'],
        '3':['games_enabled','Minigames'],
        '4':['progression_enabled','Progressão'],
        '5':['welcome_enabled','Boas-vindas'],
        '6':['antilink_enabled','Anti-link'],
        '7':['antibadword_enabled','Anti-palavrão'],
        '8':['antidelete_enabled','Anti-delete'],
        '9':['antiflood_enabled','Antiflood']
      }
      const selected=map[input]
      if(!selected){
        await reply('⚙️ Escolha de *1 a 9* ou *0* para sair.')
        return true
      }
      const [key,label]=selected
      const current=await getGroupSettings(chat)
      const next=!(current?.[key]!==false)
      setQuickFlow(chat,sender,'group_config_confirm',{key,label,next},90000)
      await reply(
`⚙️ *${label.toUpperCase()}*

Estado atual: *${current?.[key]!==false?'ATIVADO ✅':'DESATIVADO ❌'}*

Deseja *${next?'ATIVAR':'DESATIVAR'}* este módulo?

1️⃣ Confirmar
2️⃣ Cancelar
9️⃣ Voltar`
      )
      return true
    }

    if(flow.stage==='group_config_confirm'){
      if(!chat.endsWith('@g.us')){
        clearQuickFlow(chat,sender)
        return true
      }
      if(!(await senderIsGroupAdmin(chat,sender))){
        clearQuickFlow(chat,sender)
        await reply('🔒 Apenas administradores deste grupo podem alterar estas configurações.')
        return true
      }
      if(input==='9' || input==='2'){
        const st=await getGroupSettings(chat)
        setQuickFlow(chat,sender,'group_config',{},5*60*1000)
        await reply(
`⚙️ *CONFIGURAÇÕES DO GRUPO*

1️⃣ Economia: *${st.economy_enabled?'ON ✅':'OFF ❌'}*
2️⃣ RPG: *${st.rpg_enabled?'ON ✅':'OFF ❌'}*
3️⃣ Minigames: *${st.games_enabled?'ON ✅':'OFF ❌'}*
4️⃣ Progressão: *${st.progression_enabled?'ON ✅':'OFF ❌'}*
5️⃣ Boas-vindas: *${st.welcome_enabled?'ON ✅':'OFF ❌'}*
6️⃣ Anti-link: *${st.antilink_enabled?'ON ✅':'OFF ❌'}*
7️⃣ Anti-palavrão: *${st.antibadword_enabled?'ON ✅':'OFF ❌'}*
8️⃣ Anti-delete: *${st.antidelete_enabled?'ON ✅':'OFF ❌'}*
9️⃣ Antiflood: *${st.antiflood_enabled?'ON ✅':'OFF ❌'}*

0️⃣ Sair`
        )
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Confirmar*, *2 Cancelar* ou *9 Voltar*.')
        return true
      }
      const {key,label,next}=flow.data
      const st=['welcome_enabled','antilink_enabled','antibadword_enabled','antidelete_enabled','antiflood_enabled'].includes(key) ? await setCommunitySetting(chat,key,next,sender) : await setGroupSetting(chat,key,next,sender)
      setQuickFlow(chat,sender,'group_config',{},5*60*1000)
      await reply(
`✅ *${label}* foi ${next?'ativado':'desativado'} neste grupo.

1️⃣ Economia: *${st.economy_enabled?'ON ✅':'OFF ❌'}*
2️⃣ RPG: *${st.rpg_enabled?'ON ✅':'OFF ❌'}*
3️⃣ Minigames: *${st.games_enabled?'ON ✅':'OFF ❌'}*
4️⃣ Progressão: *${st.progression_enabled?'ON ✅':'OFF ❌'}*
5️⃣ Boas-vindas: *${st.welcome_enabled?'ON ✅':'OFF ❌'}*
6️⃣ Anti-link: *${st.antilink_enabled?'ON ✅':'OFF ❌'}*
7️⃣ Anti-palavrão: *${st.antibadword_enabled?'ON ✅':'OFF ❌'}*
8️⃣ Anti-delete: *${st.antidelete_enabled?'ON ✅':'OFF ❌'}*
9️⃣ Antiflood: *${st.antiflood_enabled?'ON ✅':'OFF ❌'}*

9️⃣ Voltar
0️⃣ Sair`
      )
      return true
    }

    if(flow.stage==='nav_group'){
      if(input==='1'){
        if(!chat.endsWith('@g.us')){
          clearQuickFlow(chat,sender)
          await reply('💚 Esse status existe apenas dentro de grupos.')
          return true
        }
        const lic=await getGroupLicense(chat)
        clearQuickFlow(chat,sender)
        await reply(groupLicenseStatusText(lic))
        return true
      }
      if(input==='2'){
        if(!chat.endsWith('@g.us')){
          clearQuickFlow(chat,sender)
          await reply('Use a assinatura dentro do grupo que deseja ativar.')
          return true
        }
        const r=await createSubscriptionOrder(chat,sender)
        const link=await getPaymentLink()
        clearQuickFlow(chat,sender)
        await reply(`💚 *ASSINATURA ALPHA BOT*\n💰 R$ ${Number(r.order.amount).toLocaleString('pt-BR',{minimumFractionDigits:2})}\n🧾 Pedido: *${r.order.code}*\n\n💳 ${link}`)
        return true
      }
      if(input==='3'){
        const price=await getLaunchPrice()
        clearQuickFlow(chat,sender)
        await reply(`📄 *TERMOS RESUMIDOS*\n\nPreço atual: R$ ${Number(price).toLocaleString('pt-BR',{minimumFractionDigits:2})} / 30 dias.\nO Alpha Bot utiliza integração não oficial com o WhatsApp e pode sofrer desconexões ou limitações da plataforma.`)
        return true
      }
      if(input==='4'){
        if(!chat.endsWith('@g.us')){
          clearQuickFlow(chat,sender)
          await reply('⚙️ Use esta opção dentro do grupo que deseja configurar.')
          return true
        }
        if(!(await senderIsGroupAdmin(chat,sender))){
          clearQuickFlow(chat,sender)
          await reply('🔒 Apenas administradores deste grupo podem abrir as configurações.')
          return true
        }
        const lic=await getGroupLicense(chat)
        if(!lic || !groupLicenseIsActive(lic)){
          clearQuickFlow(chat,sender)
          await reply('🔒 As configurações ficam disponíveis quando o Alpha Bot está ativo neste grupo.')
          return true
        }
        const st=await getGroupSettings(chat)
        setQuickFlow(chat,sender,'group_config',{},5*60*1000)
        await reply(
`⚙️ *CONFIGURAÇÕES DO GRUPO*

1️⃣ Economia: *${st.economy_enabled?'ON ✅':'OFF ❌'}*
2️⃣ RPG: *${st.rpg_enabled?'ON ✅':'OFF ❌'}*
3️⃣ Minigames: *${st.games_enabled?'ON ✅':'OFF ❌'}*
4️⃣ Progressão: *${st.progression_enabled?'ON ✅':'OFF ❌'}*
5️⃣ Boas-vindas: *${st.welcome_enabled?'ON ✅':'OFF ❌'}*
6️⃣ Anti-link: *${st.antilink_enabled?'ON ✅':'OFF ❌'}*
7️⃣ Anti-palavrão: *${st.antibadword_enabled?'ON ✅':'OFF ❌'}*
8️⃣ Anti-delete: *${st.antidelete_enabled?'ON ✅':'OFF ❌'}*
9️⃣ Antiflood: *${st.antiflood_enabled?'ON ✅':'OFF ❌'}*

9️⃣ Voltar
0️⃣ Sair`
        )
        return true
      }
      await reply('💚 Escolha *1, 2, 3 ou 4*.')
      return true
    }

    clearQuickFlow(chat,sender)
    return false
  }


  if(!state.creds.registered && !pairingNumber){
    console.error('[WhatsApp] sessão sem login e PAIRING_NUMBER não configurado. Defina o novo número no Render e use um SESSION_ID novo.')
  }

  if(pairingNumber && !state.creds.registered){
    setTimeout(async()=>{
      try{
        const raw=await sock.requestPairingCode(pairingNumber)
        const code=raw?.match(/.{1,4}/g)?.join('-') || raw
        console.log('\n====================================')
        console.log('CÓDIGO DE PAREAMENTO WHATSAPP:',code)
        console.log('Número:',pairingNumber)
        console.log('====================================\n')
      }catch(err){console.error('[WhatsApp] falha ao gerar pairing code',err)}
    },3000)
  }

  sock.ev.on('connection.update',({connection,lastDisconnect})=>{
    if(connection==='connecting') setWhatsAppHealth('connecting')

    if(connection==='open'){
      if(reconnectTimer){ clearTimeout(reconnectTimer); reconnectTimer=null }
      reconnecting=false
      setWhatsAppHealth('open')
      console.log('[WhatsApp] ALPHA BOT CONECTADO')
      ;(async()=>{
        try{
          const now=Date.now()
          const {rows}=await db.query(
            `SELECT chat_jid,state,updated_at FROM trevo_games
             WHERE game_type='raid' AND state->>'status'='active'
             ORDER BY updated_at DESC`
          )
          for(let raidIndex=0;raidIndex<rows.length;raidIndex++){
            const row=rows[raidIndex]
            const raid=row.state||{}
            // Compensação única pela Raid mais recente interrompida por deadlock.
            // Mantém o marcador legado para não compensar novamente Raids que já receberam a antiga Caixa Épica.
            if(raidIndex===0 && !raid.deadlockEpicCompensated){
              const participantIds=Object.keys(raid.players||{}).sort()
              if(participantIds.length){
                await db.query('BEGIN')
                try{
                  for(const jid of participantIds){
                    await db.query(
                      `UPDATE wallets SET cash=cash+10000,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1`,
                      [jid]
                    )
                    await db.query(
                      `INSERT INTO transactions(from_jid,to_jid,amount,type,note)
                       VALUES('system',$1,10000,'raid_interruption_compensation','Compensação por interrupção da Raid')`,
                      [jid]
                    )
                  }
                  raid.deadlockEpicCompensated=Date.now()
                  raid.expiresAt=Date.now()+10*60*1000
                  await db.query(
                    `UPDATE trevo_games SET state=$1::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
                     WHERE chat_jid=$2 AND game_type='raid'`,
                    [JSON.stringify(raid),row.chat_jid]
                  )
                  await db.query('COMMIT')
                  await sock.sendMessage(row.chat_jid,{text:`💰 *COMPENSAÇÃO DA RAID*\n\nO banco interrompeu a luta por deadlock. Cada participante recebeu *R$ 10.000*.\n🔄 A Raid será retomada do estado salvo, sem cobrar nova chave.`}).catch(()=>{})
                }catch(compErr){
                  await db.query('ROLLBACK').catch(()=>{})
                  console.error('[RaidCompensation]',compErr?.message||compErr)
                }
              }
            }
            if(Number(raid.expiresAt||0)<=now){
              raid.expiresAt=now+5*60*1000
              await db.query(
                `UPDATE trevo_games SET state=$1::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
                 WHERE chat_jid=$2 AND game_type='raid'`,
                [JSON.stringify(raid),row.chat_jid]
              )
            }
            const raidReply=(text)=>sock.sendMessage(row.chat_jid,{text})
            const resumed=await runRaidCombat(row.chat_jid,raidReply)
            if(resumed){
              await sock.sendMessage(row.chat_jid,{text:`🔄 *RAID RETOMADA AUTOMATICAMENTE*\n\nO bot reconectou e continuou a luta da rodada *${Number(raid.round||0)}*.`}).catch(()=>{})
            }
          }
        }catch(err){
          console.error('[RaidResume]',err?.message||err)
        }
      })()
    }

    if(connection==='close'){
      setWhatsAppHealth('closed')
      const code=lastDisconnect?.error?.output?.statusCode
      const loggedOut=code===DisconnectReason.loggedOut
      const replaced=code===440

      if(replaced){
        console.log('[WhatsApp] sessão assumida por outra instância; encerrando esta instância')
        setTimeout(()=>process.exit(0),100)
        return
      }

      if(loggedOut){
        console.error('[WhatsApp] sessão deslogada; reinício automático não consegue recuperar sem novo pareamento')
        return
      }

      console.log('[WhatsApp] conexão fechada',code,'reconectando')
      scheduleReconnect()
    }
  })

  sock.ev.on('group-participants.update',async(event)=>{
    try{
      const chat=event?.id
      if(!chat?.endsWith('@g.us')) return
      const st=await getCommunitySettings(chat)
      if(!st?.welcome_enabled) return
      const people=event?.participants||[]
      if(event.action==='add'){
        const meta=await sock.groupMetadata(chat).catch(()=>null)
        for(const jid of people){
          const tag='@'+String(jid).split('@')[0].split(':')[0]
          const rules=String(st.rules_text||'').trim()
          await sock.sendMessage(chat,{text:`👋 *BEM-VINDO(A) AO GRUPO!*\n\n${tag}, seja bem-vindo(a) ao *${meta?.subject||'grupo'}*! 🎉${rules?'\n\n📜 *REGRAS*\n'+rules:''}\n\n🍀 Digite *!comandos* para conhecer o Alpha Bot.`,mentions:[jid]})
        }
      }else if(event.action==='remove'){
        for(const jid of people){
          const tag='@'+String(jid).split('@')[0].split(':')[0]
          await sock.sendMessage(chat,{text:`👋 ${tag} saiu do grupo. Até a próxima!`,mentions:[jid]}).catch(()=>{})
        }
      }
    }catch(err){ console.error('[boas-vindas]',err?.message||err) }
  })

  sock.ev.on('messages.delete',async(event)=>{
    for(const key of event?.keys||[]) await rememberDeletedMessage(key,'messages.delete')
  })

  sock.ev.on('messages.update',async(updates)=>{
    for(const entry of updates||[]){
      const change=entry?.update||{}
      const content=unwrapMessageContent(change.message)
      const protocol=content?.protocolMessage
      if(protocol?.type===0 && protocol?.key){
        await rememberDeletedMessage(protocol.key,'messages.update/protocol')
        continue
      }

      if(change.message===null && change.messageStubType!=null){
        await rememberDeletedMessage(entry?.key,'messages.update/revoke')
      }
    }
  })

  sock.ev.on('messages.upsert',async({messages,type})=>{
    trevoHealth.lastUpsertAt=Date.now()
    trevoHealth.messagesSeen=Number(trevoHealth.messagesSeen||0)+(messages?.length||0)
    if(type!=='notify') return
    for(const msg of messages){
      try{
        if(!msg?.message || msg.key.fromMe) continue
        trevoHealth.lastInboundAt=Date.now()
        const chat=msg.key.remoteJid
        if(!chat || chat==='status@broadcast') continue
        const rawSender=msg.key.participant || chat
        const senderIdentity=await resolvePlayerIdentity(sock,chat,rawSender,msg)
        const sender=senderIdentity.jid
        const body=textOf(msg).trim()
        const reply=(text,extra={})=>sock.sendMessage(chat,{text,...extra},{quoted:msg})
        const isGroup=chat.endsWith('@g.us')
        if(isGroup){
          const spawned=await maybeSpawnGroupEvent(chat)
          if(spawned) await sock.sendMessage(chat,{text:`${spawned.text}\n\n💰 Valor: *R$ ${fmt(spawned.reward)}*\n⚡ Primeiro a mandar *${prefix}pegar* leva!\n⏳ Some em 2 minutos.`}).catch(()=>{})
        }
        const ownerCanonical=canonicalPlayerJid(ownerJid)
        const senderCanonical=canonicalPlayerJid(sender)
        const senderDigits=String(senderCanonical||'').split('@')[0].replace(/\D/g,'')
        const ownerDigits=String(ownerCanonical||'').split('@')[0].replace(/\D/g,'')
        const altDigits=[msg.key?.participantAlt,msg.key?.remoteJidAlt]
          .filter(Boolean)
          .map(v=>String(canonicalPlayerJid(v)).split('@')[0].replace(/\D/g,''))
        const configuredOwnerDigits=ownerDigits || pairingNumber
        const isOwner=Boolean(configuredOwnerDigits) && (
          sender===ownerJid ||
          senderCanonical===ownerCanonical ||
          senderDigits===configuredOwnerDigits ||
          (pairingNumber && senderDigits===pairingNumber) ||
          altDigits.includes(configuredOwnerDigits) ||
          (pairingNumber && altDigits.includes(pairingNumber)) ||
          // No privado, o remoteJid é a própria conta do usuário e é a fonte mais estável.
          (!isGroup && String(chat||'').endsWith('@s.whatsapp.net') &&
            String(canonicalPlayerJid(chat)).split('@')[0].replace(/\D/g,'')===configuredOwnerDigits)
        )

        await consolidateUserIdentity(sender,senderIdentity.aliases,msg.pushName||'').catch(err=>{
          console.error('[identidade] falha ao consolidar cadastro',err?.message||err)
        })
        await cacheIncomingMessage(sock,msg)
        if(isGroup) await recordGroupActivity(chat,sender,body.startsWith(prefix)).catch(()=>{})
        if(isGroup && !isOwner && !(await senderIsGroupAdmin(chat,sender))){
          try{
            const cs=await getCommunitySettings(chat)
            if(cs.antiflood_enabled){
              const fk=chat+'|'+sender, now=Date.now()
              const recent=(floodTracker.get(fk)||[]).filter(t=>now-t<12000)
              recent.push(now); floodTracker.set(fk,recent)
              if(recent.length>=7){
                floodTracker.set(fk,[])
                const n=await addGroupWarning(chat,sender)
                await sock.sendMessage(chat,{delete:msg.key}).catch(()=>{})
                await reply(`🚦 *ANTIFLOOD:* muitas mensagens em sequência. Avisos: *${n}/3*.`)
                continue
              }
            }
          }catch(err){ console.error('[antiflood]',err?.message||err) }
        }
        if(isGroup && !isOwner && !(await senderIsGroupAdmin(chat,sender))){
          try{
            const cs=await getCommunitySettings(chat)
            const lowerBody=body.toLowerCase()
            const linkHit=/(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/)/i.test(body)
            const badHit=/\b(porra|caralho|fdp|filho da puta|vai se foder|vsf)\b/i.test(lowerBody)
            if((cs.antilink_enabled && linkHit) || (cs.antibadword_enabled && badHit)){
              await sock.sendMessage(chat,{delete:msg.key}).catch(()=>{})
              const reason=cs.antilink_enabled && linkHit?'link não permitido':'palavra bloqueada'
              const n=await addGroupWarning(chat,sender)
              await reply(`🛡️ Mensagem removida: *${reason}*. Avisos: *${n}/3*.`)
              if(n>=3){
                await reply('⚠️ Limite de avisos atingido. Um administrador pode usar *!limparavisos @pessoa* após revisar o caso.')
              }
              continue
            }
          }catch(err){ console.error('[moderacao]',err?.message||err) }
        }
        if(!body.startsWith(prefix)){
          let flow=getQuickFlow(chat,sender)
          if(!flow) flow=await recoverQuickFlow(chat,sender)
          if(!flow && /^[1-4]$/.test(body)){
            try{
              const r=await answerQuiz(chat,sender,Number(body))
              if(r.correct){
                if(isGroup) await progressGroupMission(chat,sender,'quiz')
                await reply(`✅ *Acertou!* +R$ ${fmt(r.reward)}\nResposta: *${r.correctText}*`)
              }else await reply(`❌ Errou. A resposta correta era *${r.correctAnswer}. ${r.correctText}*.`)
              continue
            }catch(err){
              if(!String(err?.message||'').includes('Não há quiz ativo')) throw err
            }
          }
          if(!flow) continue

          await ensureUser(sender,msg.pushName || '')
          const supportFlow=String(flow.stage||'').startsWith('support_')
          if(isGroup && !isOwner && !supportFlow){
            const license=await getGroupLicense(chat)
            if(!license || !groupLicenseIsActive(license)){
              clearQuickFlow(chat,sender)
              await reply('🔒 O acesso deste grupo terminou. Use *!statusgrupo*, *!assinar* ou *!suporte*.')
              continue
            }
          }

          await handleQuickGameFlow({chat,sender,body,reply,msg,isOwner,isGroup})
          continue
        }

        await ensureUser(sender,msg.pushName || '')
        const [rawCmd,...args]=body.slice(prefix.length).trim().split(/\s+/)
        const rawCmdLower=(rawCmd||'').toLowerCase()
        const compactMarketBuy=rawCmdLower.match(/^comprar#(\d+)$/)
        const spacedMarketBuy=rawCmdLower==='comprar' && /^#\d+$/.test(String(args[0]||''))
        if(compactMarketBuy) args.unshift('#'+compactMarketBuy[1])
        const cmd=(compactMarketBuy||spacedMarketBuy)?'compraritem':rawCmdLower
        const ownerTarget=mentionsOf(msg)[0] || sender
        const sleep=await resolvePlayerSleep(sender)
        if(sleep?.woke) await reply(`☀️ *VOCÊ ACORDOU!*\n🏠 Descanso: *${sleep.place}*\n✨ XP recebido: *+${sleep.xp_reward}*`)
        const sleepAllowed=new Set(['dormir','sono','acordar','saldo','balance','bal','perfil','profile','menu','comandos','commands','ping','meupet','statuspet'])
        if(sleep?.active&&!sleepAllowed.has(cmd)) return await reply(`😴 Você está dormindo em *${sleep.place}*.\n⏳ Acorda em *${duration(sleep.remaining)}*.\n🛡️ Enquanto dorme, não pode jogar, ser roubado ou atacado.`)

        if(cmd==='acordar'){
          if(sleep?.woke) continue
          if(!sleep?.active){
            await reply('😴 Você não está dormindo.')
            continue
          }
          const total=Math.max(1,Number(sleep.ends_at)-Number(sleep.started_at))
          const ratio=Math.min(1,Number(sleep.remaining||0)/total)
          const fee=Math.max(1500,Math.ceil((1500+13500*ratio)/100)*100)
          setQuickFlow(chat,sender,'wake_confirm',{quotedFee:fee},90000)
          await reply(`⏰ *ACORDAR AGORA?*\n\n🏠 Local: *${sleep.place}*\n⏳ Falta: *${duration(sleep.remaining)}*\n💸 Custo para acordar agora: *R$ ${fmt(fee)}*\n\n1️⃣ *Sim, acordar*\n2️⃣ *Não, continuar dormindo*\n\n_O valor cai conforme o horário normal de acordar se aproxima._`)
          continue
        }

        // O sono precisa ser despachado antes das licenças e dos módulos do grupo.
        // Assim ele funciona também no privado e não é engolido por um quick flow/configuração.
        if(['dormir','sono'].includes(cmd)){
          if(sleep?.woke) continue
          const r=await startPlayerSleep(sender)
          if(!r.started){
            await reply(`😴 Você já está dormindo em *${r.place}*.\n⏳ Tempo restante: *${duration(r.remaining)}*\n✨ Ao acordar: *+${r.xp_reward} XP*`)
            continue
          }
          clearQuickFlow(chat,sender)
          await reply(`😴 *BOA NOITE!*\n\n🏠 Local: *${r.place}*\n⏳ Duração: *${duration(r.remaining)}*\n✨ Ao acordar: *+${r.xp_reward} XP*\n❤️ Você: *+1 HP por minuto dormido*\n🐾 Pet: *+1 HP e +1 energia por minuto dormido*${r.fee?`\n💰 Aluguel pago: *R$ ${fmt(r.fee)}*`:''}\n\n🛡️ Durante o sono você não pode ser roubado nem atacado, e tentativas contra você não gastam o cooldown do outro jogador.`)
          continue
        }

        if(isGroup && !isOwner && !['termos','statusgrupo','assinar','plano','preco','pedido','configgrupo','configuragrupo','suporte','support','ajuda','chamado'].includes(cmd)){
          let license=await getGroupLicense(chat)
          if(!license) license=await ensureGroupTrial(chat)

          if(!groupLicenseIsActive(license)){
            return await reply(
`🔒 *ALPHA BOT BLOQUEADO NESTE GRUPO*

O período de acesso terminou ou este grupo foi bloqueado.

💚 Plano simbólico: *R$ 2 por 30 dias*
📄 Leia: *${prefix}termos*
📅 Consulte: *${prefix}statusgrupo*

Fale com o responsável pelo Alpha Bot para ativação.`
            )
          }
        }

        if(isGroup && !isOwner){
          const ECONOMY_CMDS=new Set(['economia','eco','saldo','balance','bal','daily','diario','streak','sequencia','sequência','trabalhar','work','trampo','all','tudo','uber','ifood','ifoodbike','depositar','deposit','dep','sacar','withdraw','saque','pix','transferir','transfer','ranking','rank','top','loja','shop','comprar','buy','vender','sell','piada','joke','horoscopo','horóscopo'])
          const RPG_CMDS=new Set(['perfil','profile','fazol','fazol','setfoto','fotoperfil','avatar','removerfoto','resetfoto','fotowpp','rpg','status','batalhar','batalha','battle','duelo','rankingrpg','rankrpg','toprpg','dungeon','masmorra','roubar','roubo','raid','raidstatus','chaveraid','entrar','go','entrarraide','iniciarraide','cancelarraide'])
          const GAME_CMDS=new Set(['games','jogos','minigames','minigame','roleta','cara','coroa','ppt','forca','letra','palavra','quiz','resposta','numero','adivinhar','chute','boss','atacar'])
          const PROGRESS_CMDS=new Set(['progressao','progressão','progresso','missoes','missões','missions','resgatarmissoes','resgatarmissao','claimmissions','cla','clã','clacofre','claajuda','clãajuda','criarcla','criarclã','claconvidar','clãconvidar','convidarcla','claaceitar','clãaceitar','aceitarcla','clapromover','clãpromover','claexpulsar','clãexpulsar','cladoar','clãdoar','doarcla','saircla','sairclã','clas','clãs','rankingclas','topclas','casas','imoveis','imóveis','comprarcasa','minhacasa','casa','carros','concessionaria','concessionária','comprarcarro','garagem','meuscarros','motos','motocicletas','comprarmoto','minhasmotos','garagemmotos','negocios','negócios','comprarnegocio','comprarnegócio','meusnegocios','meusnegócios','coletar','vendercarro','vendermoto','venderbike','venderbicicleta','patrimonio','patrimônio','rankingpatrimonio','rankingpatrimônio','toppatrimonio'])
          let key=null,label=null
          if(ECONOMY_CMDS.has(cmd)){ key='economy_enabled'; label='Economia' }
          else if(RPG_CMDS.has(cmd)){ key='rpg_enabled'; label='RPG' }
          else if(GAME_CMDS.has(cmd)){ key='games_enabled'; label='Minigames' }
          else if(PROGRESS_CMDS.has(cmd)){ key='progression_enabled'; label='Progressão' }
          if(key && !(await groupModuleEnabled(chat,key))){
            return await reply(`🔒 *${label}* foi desativado pelo administrador deste grupo.`)
          }
        }

        if(['sticker','s','stiker','fig','figurinha'].includes(cmd)){
          const source=stickerMediaOf(msg)
          if(!source){
            return await reply(
`🖼️ *CRIAR FIGURINHA*

Responda uma *foto*, *vídeo* ou *figurinha* com *${prefix}sticker*.

Também funciona enviando uma foto/vídeo com *${prefix}sticker* na legenda.

🎬 Vídeos usam os primeiros segundos automaticamente.`
            )
          }

          try{
            await sock.sendMessage(chat,{react:{text:'⏳',key:msg.key}})
          }catch{}

          try{
            const media=await downloadMediaMessage(
              source.raw,
              'buffer',
              {},
              {
                logger,
                reuploadRequest:sock.updateMediaMessage
              }
            )
            if(!media || !media.length) throw new Error('Não consegui baixar essa mídia.')

            const customPack=args.join(' ').trim()
            const sticker=await toStickerBuffer(Buffer.from(media),{
              packName:customPack || 'Alpha Bot',
              packPublish:'Alpha Bot'
            })

            await sock.sendMessage(
              chat,
              {
                sticker,
                mimetype:'image/webp',
                contextInfo:{forwardingScore:0,isForwarded:false}
              },
              {quoted:msg}
            )

            try{
              await sock.sendMessage(chat,{react:{text:'✅',key:msg.key}})
            }catch{}
          }catch(err){
            console.error('[sticker] erro',err)
            try{
              await sock.sendMessage(chat,{react:{text:'❌',key:msg.key}})
            }catch{}
            await reply('❌ Não consegui criar a figurinha. Tente outra foto ou um vídeo menor.')
          }

        } else if(['suporte','support','ajuda'].includes(cmd)){
          setQuickFlow(chat,sender,'support_menu',{},10*60*1000)
          await reply(
`🆘 *SUPORTE ALPHA BOT*

Como podemos ajudar?

1️⃣ 💳 Pagamento / assinatura
2️⃣ 🛠️ Problema técnico
3️⃣ ❓ Dúvida sobre comandos
4️⃣ 🐞 Reportar erro / bug
5️⃣ 💬 Outro assunto

0️⃣ Sair`
          )

        } else if(['chamado'].includes(cmd)){
          const code=String(args[0]||'').toUpperCase()
          if(!code) return await reply(`Uso: *${prefix}chamado SUP-XXXXXX*`)
          const ticket=await getSupportTicket(code)
          if(!ticket || (!isOwner && ticket.requester_jid!==sender)){
            return await reply('❌ Chamado não encontrado.')
          }
          const statusLabel={open:'ABERTO',answered:'RESPONDIDO'}[ticket.status]||String(ticket.status||'').toUpperCase()
          await reply(
`🆘 *${ticket.code}*

Status: *${statusLabel}*
Categoria: *${ticket.category}*
Criado: *${fmtDate(ticket.created_at)}*
${ticket.answer?'\n💬 Resposta:\n'+ticket.answer:''}`
          )

        } else if(['responder','responderchamado'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const code=String(args[0]||'').toUpperCase()
          const answer=args.slice(1).join(' ').trim()
          if(!code || !answer) return await reply(`Uso: *${prefix}responder SUP-XXXXXX sua resposta*`)
          const ticket=await answerSupportTicket(code,sender,answer)
          let delivered=false
          try{
            await sock.sendMessage(ticket.requester_jid,{text:
`🆘 *RESPOSTA DO SUPORTE ALPHA BOT*

Protocolo: *${ticket.code}*

💬 ${answer}

Se precisar de mais ajuda, use *!suporte*.`
            })
            delivered=true
          }catch(err){
            console.error('[suporte] falha ao enviar resposta',err?.message||err)
          }
          await reply(`✅ Chamado *${ticket.code}* respondido. ${delivered?'Resposta entregue.':'Não foi possível entregar automaticamente.'}`)

        } else if(['regras','rules'].includes(cmd)){
          if(!isGroup) return await reply('📜 Use este comando em um grupo.')
          const st=await getCommunitySettings(chat)
          await reply(st.rules_text ? `📜 *REGRAS DO GRUPO*\n\n${st.rules_text}` : '📜 Este grupo ainda não definiu regras.')

        } else if(['setregras'].includes(cmd)){
          if(!isGroup || !(await senderIsGroupAdmin(chat,sender))) return await reply('🔒 Apenas administradores do grupo podem definir as regras.')
          const rules=args.join(' ').trim()
          if(!rules) return await reply(`Uso: *${prefix}setregras texto das regras*`)
          await setGroupRules(chat,rules,sender)
          await reply('✅ Regras do grupo atualizadas.')

        } else if(['advertir','aviso','avisos','limparavisos'].includes(cmd)){
          if(!isGroup) return await reply('🛡️ Use este comando em um grupo.')
          const targetRaw=mentionsOf(msg)[0]
          if(!targetRaw) return await reply(`Uso: *${prefix}${cmd} @pessoa*`)
          const target=await resolvePlayerJid(sock,chat,targetRaw,msg)
          if(cmd==='avisos'){
            const n=await getGroupWarnings(chat,target)
            return await reply(`⚠️ Esta pessoa possui *${n} aviso(s)*.`,{mentions:[targetRaw]})
          }
          if(!(await senderIsGroupAdmin(chat,sender))) return await reply('🔒 Apenas administradores podem alterar avisos.')
          if(cmd==='limparavisos'){
            await clearGroupWarnings(chat,target)
            return await reply('✅ Avisos zerados.',{mentions:[targetRaw]})
          }
          const n=await addGroupWarning(chat,target)
          await reply(`⚠️ Advertência registrada. Total: *${n}/3*.`,{mentions:[targetRaw]})

        } else if(['abrirgrupo','fechargrupo'].includes(cmd)){
          if(!isGroup || !(await senderIsGroupAdmin(chat,sender))) return await reply('🔒 Apenas administradores podem alterar o grupo.')
          try{
            await sock.groupSettingUpdate(chat,cmd==='fechargrupo'?'announcement':'not_announcement')
            await reply(cmd==='fechargrupo'?'🔒 Grupo fechado. Apenas administradores podem enviar mensagens.':'🔓 Grupo aberto para mensagens.')
          }catch{ await reply('🤖 Preciso ser administrador para alterar essa configuração.') }

        } else if(['pet','pets','adotar','nomepet','meupet','meuspets','usarpet','statuspet','alimentar','banho','descansar','passear','treinarpet','aventurapet','petaventura','rankpet','duelopet'].includes(cmd)){
          try{
            if(cmd==='pet'||cmd==='pets') return await reply(`🐾 *PETS DO ALPHA BOT*\n\n🐶 Cachorro — Nv.1 • R$ 5.000\n🐱 Gato — Nv.2 • R$ 8.000\n🐰 Coelho — Nv.3 • R$ 12.000\n🦜 Papagaio — Nv.4 • R$ 18.000\n🐹 Hamster — Nv.5 • R$ 25.000\n🐢 Tartaruga — Nv.6 • R$ 35.000\n🦉 Coruja — Nv.7 • R$ 50.000\n🦊 Raposa — Nv.8 • R$ 70.000\n🐺 Lobo — Nv.10 • R$ 100.000\n🦅 Águia — Nv.12 • R$ 150.000\n🐼 Panda — Nv.14 • R$ 225.000\n🐯 Tigre — Nv.17 • R$ 350.000\n🦁 Leão — Nv.20 • R$ 500.000\n🦄 Unicórnio — Nv.25 • R$ 750.000\n🐉 Dragão — Nv.30 • R$ 1.000.000\n\n📌 *Como adotar:* !adotar espécie Nome\nEx.: *!adotar cachorro Rex*\n\n📚 Você pode ter vários pets. O novo pet entra na coleção e fica ativo.
🔄 Use *!meuspets* e *!usarpet ID* para trocar o pet ativo.\n💡 Use *!meupet* para ver seu pet atual.`)
            if(cmd==='adotar'){
              if(!args[0]) return await reply(`🐾 *ADOÇÃO DE PETS*\n\n🐶 Cachorro — Nv.1 • R$ 5.000\n🐱 Gato — Nv.2 • R$ 8.000\n🐰 Coelho — Nv.3 • R$ 12.000\n🦜 Papagaio — Nv.4 • R$ 18.000\n🐹 Hamster — Nv.5 • R$ 25.000\n🐢 Tartaruga — Nv.6 • R$ 35.000\n🦉 Coruja — Nv.7 • R$ 50.000\n🦊 Raposa — Nv.8 • R$ 70.000\n🐺 Lobo — Nv.10 • R$ 100.000\n🦅 Águia — Nv.12 • R$ 150.000\n🐼 Panda — Nv.14 • R$ 225.000\n🐯 Tigre — Nv.17 • R$ 350.000\n🦁 Leão — Nv.20 • R$ 500.000\n🦄 Unicórnio — Nv.25 • R$ 750.000\n🐉 Dragão — Nv.30 • R$ 1.000.000\n\n📚 Você pode colecionar vários pets. Cada um mantém seu próprio nível, XP, poder, HP e energia.\n\nEx.: *!adotar cachorro Rex*`)
              const pet=await adoptPet(sender,args[0],args.slice(1).join(' ')||msg.pushName||'Alpha')
              return await reply(`🐾 PET ADOTADO!\n\nVocê agora tem *${pet.name}*, um(a) *${pet.species}*.\n💰 Total pago: *R$ ${fmt(pet.fee)}*\n\nUse *!meupet* para cuidar dele.`)
            }
            if(cmd==='duelopet'){
              const targetRaw=mentionsOf(msg)[0]; if(!targetRaw) return await reply('Uso: *!duelopet @pessoa*')
              const target=await resolvePlayerJid(sock,chat,targetRaw,msg)
              const r=await petDuel(sender,target)
              return await reply(`🐾⚔️ *DUELO DE PETS*\n\n🏆 ${r.winner.name} venceu ${r.loser.name} em *${r.rounds} rodada(s)*!\n❤️ ${r.winner.name}: *${r.winner.hp}/${r.winner.max_hp}*\n💔 ${r.loser.name}: *${r.loser.hp}/${r.loser.max_hp}*\n\n+25 XP para o vencedor • +10 XP para o derrotado.`,{mentions:[targetRaw]})
            }
            if(cmd==='meuspets'){
              const pets=await listPets(sender)
              if(!pets.length) return await reply('🐾 Você ainda não tem pets. Use *!adotar cachorro Nome*.')
              return await reply('🐾 *SUA COLEÇÃO DE PETS*\n\n'+pets.map(p=>`${p.active?'🟢':'⚪'} *#${p.id??'-'} ${p.name}* — ${p.species} • Nv.${p.level} • ❤️ ${p.hp}/${petMaxHp(p.level,p.xp,p.species)} • ⚡ ${p.energy}/${petMaxEnergy(p.level,p.species)}`).join('\n')+'\n\n🟢 = pet ativo\nPara trocar: *!usarpet ID*')
            }
            if(cmd==='usarpet'){
              if(!args[0]) return await reply('🐾 Use *!meuspets* e depois *!usarpet ID*.')
              const p=await selectPet(sender,args[0])
              return await reply(p.already?`🐾 *${p.name}* já é seu pet ativo.`:`🐾 *PET ATIVO ALTERADO!*\n\n${p.name} (${p.species}) agora é seu companheiro ativo.\n⭐ Nv.${p.level} • ⚔️ ${p.power}\n❤️ ${p.hp}/${petMaxHp(p.level,p.xp,p.species)} • ⚡ ${p.energy}/${petMaxEnergy(p.level,p.species)}`)
            }
            if(cmd==='nomepet'){
              const newName=args.join(' ').trim()
              if(!newName) return await reply(`🐾 Uso: *${prefix}nomepet NovoNome*\n💰 Custo: *R$ 1.000*`)
              const p=await renamePet(sender,newName)
              return await reply(`🐾 *NOME ALTERADO!*\n\n${p.oldName} agora se chama *${p.name}*.\n💰 Custo: *R$ ${fmt(p.fee)}*`)
            }
            if(cmd==='rankpet'){
              const rows=await petLeaderboard(10)
              return await reply('🏆 *RANKING DE PETS*\n\n'+rows.map((p,i)=>`${i+1}º ${p.name} — Nv.${p.level} • ⚔️ ${p.power} (${p.push_name||'Jogador'})`).join('\n'))
            }
            if(cmd==='meupet'||cmd==='statuspet'){
              const p=await getPet(sender); if(!p) return await reply('🐾 Você ainda não tem pet. Use *!adotar cachorro Nome*.')
              const bonus=petStatusBonus(p)
              return await reply(`🐾 *STATUS DO PET — ${p.name.toUpperCase()}*\n\n🧬 Espécie: *${p.species}*\n🏷️ Tipo: *${petHpType(p.species)}*\n⭐ Nível: *${p.level}* • XP: *${p.xp}*\n⚔️ Poder: *${p.power}*\n❤️ HP: *${p.hp}/${petMaxHp(p.level,p.xp,p.species)}*\n🍖 Fome: *${p.hunger}/100*\n⚡ Energia: *${p.energy}/${petMaxEnergy(p.level,p.species)}*\n🏆 Duelos: *${p.wins}V / ${p.losses}D*\n\n👹 *BÔNUS NO BOSS*\n${bonus.label}\n✨ ${bonus.text}\n\n💡 HP cresce conforme *espécie + nível + XP*. Se zerar, o pet sai da luta. *!descansar* recupera energia e 35% do HP.`)
            }
            if(cmd==='petaventura'){
              const p=await petAdventure(sender)
              return await reply(`🌍 *PET AVENTURA CONCLUÍDA!*\n\n🐾 *${p.name}* explorou até ficar sem energia.\n⚡ Energia gasta: *${p.energySpent}*\n💰 Dinheiro encontrado: *R$ ${fmt(p.cash)}*\n✨ XP do pet: *+${p.xpGain}*${p.powerGain?`\n⚔️ Poder: *+${p.powerGain}*`:''}\n\n❤️ HP: *${p.hp}/${petMaxHp(p.level,p.xp,p.species)}*\n⚡ Energia atual: *${p.energy}/${petMaxEnergy(p.level,p.species)}*. Use *!descansar*.`)
            }
            const action={alimentar:'alimentar',banho:'banho',descansar:'descansar',passear:'passear',treinarpet:'treinar',aventurapet:'aventura'}[cmd]
            const p=await petAction(sender,action)
            const actionResult=cmd==='descansar'?'descansou e recuperou energia e HP!':cmd==='banho'?'tomou banho!':'completou a ação!'
            await reply(`🐾 *${p.name}* ${actionResult}\nNível ${p.level} • XP ${p.xp} • Poder ${p.power}\n❤️ ${p.hp}/${petMaxHp(p.level,p.xp,p.species)} • 🍖 ${p.hunger}/100 • ⚡ ${p.energy}/${petMaxEnergy(p.level,p.species)}`)
          }catch(err){ await reply('❌ '+(err?.message||'Não foi possível cuidar do pet.')) }

        } else if(['conquistas','achievements'].includes(cmd)){
          const rows=await getAchievements(sender)
          await reply(rows.length?'🏆 *SUAS CONQUISTAS*\n\n'+rows.map((x,i)=>`${i+1}. ${x}`).join('\n'):'🏆 Você ainda não desbloqueou conquistas. Continue jogando!')

        } else if(['topativo','atividade'].includes(cmd)){
          if(!isGroup) return await reply('📊 Use este comando em um grupo.')
          const rows=await weeklyActivityLeaderboard(chat,10)
          await reply('📊 *TOP ATIVIDADE — ÚLTIMOS 7 DIAS*\n\n'+(rows.map((x,i)=>`${i+1}º ${x.push_name} — ${x.messages} msgs • ${x.commands} cmds`).join('\n')||'Sem atividade registrada ainda.'))

        } else if(['casar','aceitarcasamento','divorciar','casal'].includes(cmd)){
          try{
            if(cmd==='casal'){
              const r=await getRelationship(sender)
              return await reply(r?`💍 Você está em um relacionamento com *${r.partner_name||'seu par'}*.`:'💔 Você está solteiro(a).')
            }
            if(cmd==='divorciar'){
              const partner=await divorceRelationship(sender)
              return await reply('💔 Relacionamento encerrado.',{mentions:[partner]})
            }
            const targetRaw=mentionsOf(msg)[0]
            if(!targetRaw) return await reply(`Uso: *${prefix}${cmd} @pessoa*`)
            const target=await resolvePlayerJid(sock,chat,targetRaw,msg)
            if(cmd==='casar'){
              await proposeRelationship(sender,target)
              return await reply('💍 Pedido de casamento enviado! A pessoa pode responder com *!aceitarcasamento @você*.',{mentions:[targetRaw]})
            }
            await acceptRelationship(sender,target)
            await reply('💍 *CASAMENTO CONFIRMADO!* 🎉',{mentions:[targetRaw]})
          }catch(err){ await reply('❌ '+(err?.message||'Não foi possível concluir.')) }

        } else if(['mercado','anunciar','compraritem','comprarmercado','cancelarvenda'].includes(cmd)){
          try{
            if(cmd==='mercado'){
              const rows=await listMarket(15)
              if(!rows.length) return await reply('🏪 O mercado está vazio.')
              return await reply('🏪 *MERCADO ENTRE JOGADORES*\n\n'+rows.map(x=>{ const sec=Number(x.remaining_seconds||0); const min=Math.max(1,Math.ceil(sec/60)); return `#${x.id} • ${x.name} ×${x.quantity} — R$ ${Number(x.price).toLocaleString('pt-BR')}\n👤 ${x.seller_name||'Jogador'}\n⏳ Expira em: *${min} min*` }).join('\n\n')+`\n\n🕐 Anúncios duram *1 hora*. Ao expirar, o item volta ao inventário.\n↩️ Cancelar: *!cancelarvenda ID*\n🛒 Comprar: *!comprar#ID*`)
            }
            if(cmd==='anunciar'){
              const items=(await getInventory(sender)).filter(i=>Number(i.quantity||0)>0)
              if(!items.length) return await reply('🎒 Seu inventário está vazio.')
              setQuickFlow(chat,sender,'market_sell_select',{items:items.map(i=>({item_id:i.item_id,name:i.name,quantity:Number(i.quantity||0),rarity:i.rarity}))},5*60*1000)
              let text='🏪 *ANUNCIAR ITEM*\n\n'
              items.forEach((i,idx)=>{text+=`*${idx+1}.* ${rarityLabel(i.rarity)} — *${i.name}* ×${i.quantity}\n`})
              text+='\n👉 Responda apenas com o *número do item*.\n0️⃣ Cancelar'
              return await reply(text)
            }
            if(cmd==='compraritem'){
              const rows=await listMarket(50)
              if(!rows.length) return await reply('🏪 Não há anúncios disponíveis agora.')
              const directRaw=String(args[0]||'').replace(/^#/,'')
              const directId=Number(directRaw)
              if(Number.isInteger(directId)&&directId>0){
                const x=rows.find(r=>Number(r.id)===directId)
                if(!x) return await reply(`❌ O anúncio *#${directId}* não existe ou já foi vendido/cancelado.`)
                if(x.seller_jid===sender || x.seller===sender) return await reply('⚠️ Você não pode comprar o seu próprio anúncio.')
                const item={id:x.id,name:x.name,quantity:Number(x.quantity||1),price:Number(x.price||0),seller_name:x.seller_name||'Jogador'}
                setQuickFlow(chat,sender,'market_buy_confirm',item,90000)
                return await reply(`🛒 *COMPRAR ANÚNCIO #${item.id}?*\n\n📦 *${item.name}* ×${item.quantity}\n👤 Vendedor: *${item.seller_name}*\n💰 Valor: *R$ ${item.price.toLocaleString('pt-BR')}*\n\n1️⃣ Sim\n2️⃣ Não`)
              }
              const ownFiltered=rows.filter(x=>x.seller_jid!==sender && x.seller!==sender)
              const available=ownFiltered.length?ownFiltered:rows
              const items=available.map(x=>({id:x.id,name:x.name,quantity:Number(x.quantity||1),price:Number(x.price||0),seller_name:x.seller_name||'Jogador'}))
              if(items.length===1){
                const x=items[0]
                setQuickFlow(chat,sender,'market_buy_confirm',x,90000)
                return await reply(`🛒 *CONFIRMAR COMPRA?*\n\n📦 *${x.name}* ×${x.quantity}\n👤 Vendedor: *${x.seller_name}*\n💰 Valor: *R$ ${x.price.toLocaleString('pt-BR')}*\n\n1️⃣ Sim\n2️⃣ Não`)
              }
              setQuickFlow(chat,sender,'market_buy_select',{items},5*60*1000)
              let text='🛒 *ITENS À VENDA*\n\n'
              items.forEach((x,i)=>{text+=`*${i+1}.* #${x.id} • *${x.name}* ×${x.quantity}\n👤 ${x.seller_name} • 💰 R$ ${x.price.toLocaleString('pt-BR')}\n\n`})
              text+='👉 Use *!comprar#ID* para ir direto. Ex.: *!comprar#3*\n0️⃣ Cancelar'
              return await reply(text)
            }
            if(cmd==='comprarmercado'){
              const x=await buyMarketListing(sender,args[0])
              return await reply(`✅ Compra concluída: *${x.name} ×${x.quantity}*.`)
            }
            const x=await cancelMarketListing(sender,args[0])
            await reply(`↩️ Anúncio #${x.id} cancelado e item devolvido ao inventário.`)
          }catch(err){ await reply('❌ '+(err?.message||'Erro no mercado.')) }

        } else if(['dado','chance','escolher','ship','verdade','desafio'].includes(cmd)){
          if(cmd==='dado') return await reply(`🎲 Caiu *${1+Math.floor(Math.random()*6)}*.`)
          if(cmd==='chance') return await reply(`🎯 Chance: *${Math.floor(Math.random()*101)}%*.`)
          if(cmd==='escolher'){
            const opts=args.join(' ').split('|').map(x=>x.trim()).filter(Boolean)
            if(opts.length<2) return await reply('Uso: *!escolher pizza | hambúrguer | sushi*')
            return await reply('🤖 Eu escolho: *'+opts[Math.floor(Math.random()*opts.length)]+'*')
          }
          if(cmd==='ship'){
            const m=mentionsOf(msg); if(m.length<2) return await reply('Uso: *!ship @pessoa1 @pessoa2*')
            return await reply(`💘 Compatibilidade: *${Math.floor(Math.random()*101)}%* 💞`,{mentions:m.slice(0,2)})
          }
          const truths=['Qual foi a última mentira que você contou?','Quem do grupo você levaria para uma viagem?','Qual hábito seu quase ninguém conhece?','Qual foi sua maior vergonha?']
          const dares=['Mande um áudio cantando por 10 segundos.','Troque sua foto por 10 minutos.','Elogie alguém do grupo sem ironia.','Mande o último emoji usado 5 vezes.']
          return await reply((cmd==='verdade'?'🤔 *VERDADE*\n':'🔥 *DESAFIO*\n')+(cmd==='verdade'?truths:dares)[Math.floor(Math.random()*4)])

        } else if(['banir','kick','expulsar','promover','rebaixar'].includes(cmd)){
          if(!isGroup) return await reply('⚙️ Use este comando dentro de um grupo.')
          if(!(await senderIsGroupAdmin(chat,sender))) return await reply('🔒 Apenas administradores do grupo podem usar este comando.')
          const targetRaw=mentionsOf(msg)[0]
          if(!targetRaw) return await reply(`Uso: *${prefix}${cmd} @pessoa*`)
          const meta=await sock.groupMetadata(chat)
          const target=await resolvePlayerJid(sock,chat,targetRaw,msg)
          const findParticipant=(jid)=>meta.participants?.find(p=>{
            const ids=[p.id,p.jid,p.lid,p.phoneNumber].filter(Boolean)
            return ids.includes(jid) || ids.map(canonicalPlayerJid).includes(canonicalPlayerJid(jid))
          })
          const meRaw=sock.user?.id
          const me=canonicalPlayerJid(meRaw)
          const botPart=findParticipant(meRaw)||findParticipant(me)
          if(!botPart?.admin) return await reply('🤖 Eu também preciso ser administrador do grupo para fazer isso.')
          const targetPart=findParticipant(targetRaw)||findParticipant(target)
          if(!targetPart) return await reply('⚠️ Não encontrei essa pessoa entre os participantes do grupo.')
          const targetId=targetPart.id || targetPart.jid || targetRaw
          if(canonicalPlayerJid(targetId)===me || targetId===sock.user?.lid) return await reply('🤖 Não vou aplicar esse comando em mim mesmo.')
          if(cmd==='banir'||cmd==='kick'||cmd==='expulsar'){
            if(targetPart.admin) return await reply('🔒 Por segurança, não removo outro administrador. Rebaixe-o primeiro.')
            await sock.groupParticipantsUpdate(chat,[targetId],'remove')
            return await reply('👢 Participante removido do grupo.',{mentions:[targetRaw]})
          }
          if(cmd==='promover'){
            if(targetPart.admin) return await reply('ℹ️ Essa pessoa já é administradora.')
            await sock.groupParticipantsUpdate(chat,[targetId],'promote')
            return await reply('👑 Participante promovido a administrador.',{mentions:[targetRaw]})
          }
          if(!targetPart.admin) return await reply('ℹ️ Essa pessoa não é administradora.')
          await sock.groupParticipantsUpdate(chat,[targetId],'demote')
          return await reply('⬇️ Administrador rebaixado para participante.',{mentions:[targetRaw]})

        } else if(['xingar','arrogante','gado','burro'].includes(cmd)){
          if(!isGroup) return await reply('😂 Use esse comando em um grupo.')
          const target=mentionsOf(msg)[0]
          if(!target) return await reply(`Uso: *${prefix}${cmd} @pessoa*`)
          const tag='@'+String(target).split('@')[0]
          const fixed={
            arrogante:`${tag} tá com 99 de confiança e 3 de humildade. 🗿`,
            gado:`${tag} ouviu um “oi” e já escolheu o nome dos filhos. 🐂`,
            burro:`${tag} tentou pensar duas vezes e deu timeout. 🧠💀`
          }
          const memes=[
            `${tag} fala muito e entrega pouco. 📢`,
            `${tag} foi refutado pelo próprio Wi-Fi. 📶`,
            `${tag} tem 99 de confiança e 3 de habilidade. 🗿`,
            `${tag} entrou na discussão sem argumento e saiu sem dignidade. 😂`,
            `${tag} está jogando no modo tutorial e ainda pediu ajuda. 🎮`,
            `${tag} é a prova de que o botão “tentar novamente” existe por um motivo. 🔄`,
            `${tag} acordou e escolheu passar vergonha no grupo. 🤡`,
            `${tag} tem opinião premium com argumento versão grátis. 💀`
          ]
          const text=fixed[cmd] || memes[Math.floor(Math.random()*memes.length)]
          await reply(text,{mentions:[target]})

        } else if(['configgrupo','configuragrupo'].includes(cmd)){
          if(!isGroup) return await reply('⚙️ Use este comando dentro do grupo que deseja configurar.')
          if(!(await senderIsGroupAdmin(chat,sender))) return await reply('🔒 Apenas administradores deste grupo podem abrir as configurações.')
          const lic=await getGroupLicense(chat)
          if(!lic || !groupLicenseIsActive(lic)) return await reply('🔒 As configurações ficam disponíveis quando o Alpha Bot está ativo neste grupo.')
          const st=await getGroupSettings(chat)
          setQuickFlow(chat,sender,'group_config',{},5*60*1000)
          await reply(
`⚙️ *CONFIGURAÇÕES DO GRUPO*

1️⃣ Economia: *${st.economy_enabled?'ON ✅':'OFF ❌'}*
2️⃣ RPG: *${st.rpg_enabled?'ON ✅':'OFF ❌'}*
3️⃣ Minigames: *${st.games_enabled?'ON ✅':'OFF ❌'}*
4️⃣ Progressão: *${st.progression_enabled?'ON ✅':'OFF ❌'}*
5️⃣ Boas-vindas: *${st.welcome_enabled?'ON ✅':'OFF ❌'}*
6️⃣ Anti-link: *${st.antilink_enabled?'ON ✅':'OFF ❌'}*
7️⃣ Anti-palavrão: *${st.antibadword_enabled?'ON ✅':'OFF ❌'}*
8️⃣ Anti-delete: *${st.antidelete_enabled?'ON ✅':'OFF ❌'}*
9️⃣ Antiflood: *${st.antiflood_enabled?'ON ✅':'OFF ❌'}*

9️⃣ Voltar
0️⃣ Sair`
          )

        } else if(['economia','eco'].includes(cmd)){
          setQuickFlow(chat,sender,'nav_economy',{},90000)
          await reply(
`💰 *ECONOMIA*

1️⃣ Ver saldo
2️⃣ Daily + sequência 🔥
3️⃣ Trabalhar
4️⃣ Depositar
5️⃣ Sacar
6️⃣ Ranking dos mais ricos
7️⃣ PIX para jogador

0️⃣ Sair`
          )

        } else if(['itens','item','mochila'].includes(cmd)){
          setQuickFlow(chat,sender,'nav_items',{},90000)
          await reply(
`🛒 *ITENS E INVENTÁRIO*

1️⃣ Loja
2️⃣ Inventário
3️⃣ Equipar
4️⃣ Usar poção
5️⃣ Abrir caixas

0️⃣ Sair`
          )

        } else if(['rpg'].includes(cmd)){
          setQuickFlow(chat,sender,'nav_rpg',{},90000)
          await reply(
`⚔️ *RPG*

1️⃣ Status
2️⃣ Dungeon
3️⃣ Batalhar com alguém
4️⃣ Roubar alguém
5️⃣ Ranking RPG
6️⃣ ⚔️ Raids cooperativas

0️⃣ Sair`
          )

        } else if(['progressao','progressão','progresso'].includes(cmd)){
          setQuickFlow(chat,sender,'nav_progress',{},90000)
          await reply(
`📋 *PROGRESSÃO*

1️⃣ Missões diárias
2️⃣ Resgatar missões
3️⃣ Casas
4️⃣ Carros
5️⃣ Patrimônio
6️⃣ Ranking de patrimônio

0️⃣ Sair`
          )

        } else if(['grupo','assinatura'].includes(cmd)){
          setQuickFlow(chat,sender,'nav_group',{},90000)
          await reply(
`💚 *GRUPO / ASSINATURA*

1️⃣ Status do grupo
2️⃣ Assinar / renovar
3️⃣ Termos
4️⃣ ⚙️ Configurações do grupo

0️⃣ Sair`
          )

        } else if(['clans','clanes','clãsmenu'].includes(cmd)){
          const clan=await getClanForUser(sender)
          setQuickFlow(chat,sender,'clan_menu',{},90000)
          if(!clan){
            await reply(
`🏴 *CLÃS*

1️⃣ Criar um clã
2️⃣ Aceitar convite
3️⃣ Ranking de clãs

0️⃣ Sair`
            )
          }else{
            const leader=clan.role==='leader'
            await reply(
`🏴 *CLÃ ${clan.name}*

1️⃣ Ver informações
2️⃣ Doar ao cofre
3️⃣ Convidar pessoa
4️⃣ Ranking de clãs
${leader?'5️⃣ Transferir liderança\n6️⃣ Expulsar membro\n7️⃣ Sair do clã':'5️⃣ Sair do clã'}

0️⃣ Sair`
            )
          }

        } else if(['minigames','minigame'].includes(cmd)){
          setQuickFlow(chat,sender,'main',{},90000)
          await reply(
`🎮 *MINIGAMES DO ALPHA BOT*

1️⃣ 🎰 Roleta
2️⃣ 🪙 Cara ou Coroa
3️⃣ ✊ Pedra, Papel e Tesoura
4️⃣ 🔤 Forca
5️⃣ 🧠 Quiz
6️⃣ 🔢 Adivinhe o Número
7️⃣ 👹 Boss

0️⃣ Sair`
          )

        } else if(['comandos','comando','commands','cmds'].includes(cmd)){
          // Uma única fonte para o catálogo. Evita a lista antiga ficar desatualizada.
          await showCommandsMainMenu(chat,sender,reply)

        } else if(['ping','p'].includes(cmd)){
          await reply('🍀 Pong! Alpha Bot online e conectado ao Neon.')

        } else if(['saldo','balance','bal'].includes(cmd)){
          const p=await getProfile(sender)
          await reply(`💰 *Saldo*\n\n🪙 Carteira: R$ ${fmt(p.cash)}\n🏦 Banco: R$ ${fmt(p.bank)}\n📊 Total: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)

        } else if(['perfil','profile'].includes(cmd)){
          const mentioned=mentionsOf(msg)[0]
          const profileIdentity=await resolvePlayerIdentity(sock,chat,mentioned || sender,msg)
          const profileTarget=profileIdentity.jid

          try{
            if(!mentioned) await ensureUser(profileTarget,msg.pushName||'')
            if(mentioned && !profileTarget?.endsWith('@s.whatsapp.net')){
              return await reply('⚠️ Não consegui identificar o número dessa pessoa no grupo. Peça para ela enviar qualquer comando do bot e tente novamente.')
            }
            if(mentioned){
              await consolidateUserIdentity(profileTarget,profileIdentity.aliases)
            }
            const existing=await getProfile(profileTarget)
            if(!existing){
              return await reply('⚠️ Não encontrei o cadastro dessa pessoa. Peça para ela enviar qualquer comando do bot e tente novamente.')
            }
            await sendAlphaProfile(sock,chat,profileTarget,msg,profileIdentity.aliases)
          }catch(err){
            console.error('[perfil] erro ao carregar perfil',profileTarget,err)
            await reply('⚠️ Não consegui carregar esse perfil agora. Tente novamente em alguns segundos.')
          }

        } else if(['setfoto','fotoperfil','avatar','removerfoto','resetfoto','fotowpp'].includes(cmd)){
          await reply(`ℹ️ O card de perfil foi desativado. Agora o *${prefix}perfil* é exibido somente em texto.`)

        } else if(['daily','diario'].includes(cmd)){
          const r=await claimDaily(sender)
          if(!r.ok) await reply(`⏳ Daily já coletado hoje.\n🔥 Sequência atual: *${r.streak} dia${r.streak===1?'':'s'}*.\n🌙 Volte em aproximadamente ${duration(r.remaining)}.`)
          else {
            await progressDailyMission(sender,'daily')
            await reply(dailyResultText(r))
          }

        } else if(['streak','sequencia','sequência'].includes(cmd)){
          const s=await getDailyStreak(sender)
          const status=s.claimedToday?'✅ Daily de hoje já coletado.':'🎁 Daily de hoje disponível.'
          await reply(
`🔥 *SEQUÊNCIA DAILY*

🔥 Atual: *${s.streak} dia${s.streak===1?'':'s'}*
🏅 Recorde: *${s.bestStreak} dia${s.bestStreak===1?'':'s'}*
${status}

🎯 Próxima recompensa: *Dia ${s.next.day} — ${s.next.label}*
⏳ Faltam *${s.next.days} dia${s.next.days===1?'':'s'}* mantendo a sequência.`
          )

        } else if(['all','tudo'].includes(cmd)){
          const results=[]
          let grossTotal=0,taxTotal=0,netTotal=0
          const add=async(label,icon,fn)=>{
            try{
              const r=await fn()
              if(!r?.ok){
                results.push(`${icon} *${label}:* ⏳ cooldown — ${duration(r?.remaining||0)}`)
                return
              }
              grossTotal+=Number(r.gross||0); taxTotal+=Number(r.tax||0); netTotal+=Number(r.amount??r.total??0)
              results.push(`${icon} *${label}:* R$ ${fmt(r.gross)} bruto • TAXADE ${r.taxRate}%: -R$ ${fmt(r.tax)} • *R$ ${fmt(r.amount??r.total??0)} líquido*${Number(r.eventMultiplier||1)>1?' 🔥 *2X*':''}`)
              await progressDailyMission(sender,'work')
              if(isGroup) await progressGroupMission(chat,sender,'work')
            }catch(err){
              results.push(`${icon} *${label}:* ⚠️ ${String(err?.message||'indisponível')}`)
            }
          }
          await add('Trabalho','💼',()=>work(sender,3))
          await add('Uber','🚗',()=>driveUber(sender,3))
          await add('iFood','🍔',()=>deliverIfood(sender,3))
          await reply(
`⚡ *ALL — ATIVIDADES EM LOTE*

${results.join('\n')}

💵 Bruto executado: *R$ ${fmt(grossTotal)}*
🧾 TAXADE te pegou 3×: *-R$ ${fmt(taxTotal)}*
💰 Líquido recebido: *R$ ${fmt(netTotal)}*

🏪 *!coletar* não faz parte do !all.`
          )

        } else if(['trabalhar','work','trampo'].includes(cmd)){
          const r=await work(sender)
          if(!r.ok) await reply(`⏳ Você já trabalhou. Tente novamente em ${duration(r.remaining)}.`)
          else {
            await progressDailyMission(sender,'work')
          if(isGroup) await progressGroupMission(chat,sender,'work')
            await reply(workResultText(r))
          }

        } else if(['carreira','emprego','profissao','profissão'].includes(cmd)){
          const r=await getCareer(sender)
          let text=`💼 *MINHA CARREIRA*\n\n🏷️ Cargo: *${r.rank.name}*\n📈 XP profissional: *${r.career_xp}*\n🧾 Expedientes: *${r.total_shifts}*\n💵 Multiplicador salarial: *x${r.rank.mult.toFixed(2)}*`
          if(r.next) text+=`\n🎯 Próximo: *${r.next.name}* — faltam ${Math.max(0,r.next.xp-Number(r.career_xp))} XP.`
          else text+='\n🏆 Cargo máximo alcançado!'
          await reply(text)

        } else if(['vendercarro'].includes(cmd)){
          if(!args.length) return await reply(`🚗 Use *${prefix}vendercarro número* conforme sua *${prefix}garagem*.\n⚠️ Revenda: *70% do valor pago* (30% de desvalorização).`)
          const garage=await getGarage(sender)
          const idx=Number(args[0])
          const selected=/^\d+$/.test(args[0]||'') ? garage[idx-1] : garage.find(x=>x.id===args.join(' ').toLowerCase())
          if(!selected) return await reply(`❌ Carro não encontrado na sua garagem. Use *${prefix}garagem*.`)
          setQuickFlow(chat,sender,'confirm_sell_car',{id:selected.id,name:selected.name,resale:Math.floor(Number(selected.price_paid||selected.price)*0.70)},90000)
          await reply(`⚠️ *CONFIRMAR VENDA*\n\n🚗 ${selected.name}\n💰 Você recebe: *R$ ${fmt(Math.floor(Number(selected.price_paid||selected.price)*0.70))}*\n📉 Desvalorização: *30%*\n\nResponda *SIM* para vender ou *NÃO* para cancelar.`)

        } else if(['vendermoto','venderbike','venderbicicleta'].includes(cmd)){
          if(!args.length) return await reply(`🚲🏍️ Use *${prefix}vendermoto número* conforme *${prefix}minhasmotos*.\n⚠️ Revenda: *70% do valor pago*.`)
          const garage=await getMotorcycleGarage(sender)
          const idx=Number(args[0])
          const selected=/^\d+$/.test(args[0]||'') ? garage[idx-1] : garage.find(x=>x.id===args.join(' ').toLowerCase())
          if(!selected) return await reply(`❌ Veículo não encontrado. Use *${prefix}minhasmotos*.`)
          setQuickFlow(chat,sender,'confirm_sell_motorcycle',{id:selected.id,name:selected.name,resale:Math.floor(Number(selected.price_paid||selected.price)*0.70)},90000)
          await reply(`⚠️ *CONFIRMAR VENDA*\n\n🚲🏍️ ${selected.name}\n💰 Você recebe: *R$ ${fmt(Math.floor(Number(selected.price_paid||selected.price)*0.70))}*\n📉 Desvalorização: *30%*\n\nResponda *SIM* para vender ou *NÃO* para cancelar.`)

        } else if(['negocios','negócios'].includes(cmd)){
          const owned=await getBusinesses(sender)
          setQuickFlow(chat,sender,'business_buy_select',{},90000)
          let text='🏪 *NEGÓCIOS — RENDA PASSIVA*\n\n'
          BUSINESSES.forEach((b,i)=>{
            const has=owned.some(x=>x.id===b.id)
            text+=`*${i+1}.* *${b.name}* — R$ ${fmt(b.price)}\n   💵 R$ ${fmt(b.profitHour)}/h • acumula ${b.capacityHours}h${has?' ✅':''}\n`
          })
          text+=`\n👉 Responda *só com o número* para comprar.\n🛒 Ou use *${prefix}comprarnegocio N*\n💰 Lucros: *${prefix}coletar*\n🏢 Seus negócios: *${prefix}meusnegocios*\n0️⃣ Cancelar`
          await reply(text)

        } else if(['comprarnegocio','comprarnegócio'].includes(cmd)){
          if(!args.length) return await reply(`🏪 Veja *${prefix}negocios* e use *${prefix}comprarnegocio número*.`)
          const b=await buyBusiness(sender,args.join(' '))
          await reply(`🏪 *NEGÓCIO COMPRADO!*\n\n*${b.name}*\n💰 Investimento: R$ ${fmt(b.price)}\n📈 Lucro: R$ ${fmt(b.profitHour)}/h\n⏳ Acumula até ${b.capacityHours}h.\n\nUse *${prefix}coletar* para receber os lucros.`)

        } else if(['meusnegocios','meusnegócios'].includes(cmd)){
          const rows=await getBusinesses(sender)
          if(!rows.length) return await reply(`🏪 Você ainda não possui negócios. Veja *${prefix}negocios*.`)
          setQuickFlow(chat,sender,'business_manage_select',{ids:rows.map(b=>b.id)},90000)
          let text='🏢 *MEUS NEGÓCIOS*\n\n'
          rows.forEach((b,i)=>{
            const level=Math.max(1,Number(b.level||1)), mult=1+(level-1)*0.25
            text+=`*${i+1}.* *${b.name}* — Nv. ${level}/5\n   💵 R$ ${fmt(Math.floor(b.profitHour*mult))}/h • ⏳ ${b.capacityHours+level-1}h\n`
          })
          text+='\n🔧 Responda com o número para fazer upgrade.\n0️⃣ Sair'
          await reply(text.trim())

        } else if(['missaogrupo','missãogrupo','missaocoletiva','missãocoletiva','missao','missão','missaostatus','missãostatus','statusmissao','statusmissão'].includes(cmd)){
          if(!isGroup) return await reply('👥 Esse comando funciona somente em grupos.')
          const b=await getGroupMissionLeaderboard(chat), m=b.mission
          const unit=m.mission_type==='quiz'?'acertos':m.mission_type==='battle'?'batalhas':'ações'
          const how=m.mission_type==='battle'?`⚔️ *Como fazer:* use *${prefix}batalhar*, marque outro jogador do grupo e conclua a batalha. Cada batalha concluída soma *+1*.`:m.mission_type==='quiz'?`🧠 *Como fazer:* responda corretamente aos quizzes do grupo. Cada acerto soma *+1*.`:`💼 *Como fazer:* conclua trabalhos/entregas válidos no grupo. Cada ação concluída soma *+1*.`
          let out=`🤝 *MISSÃO COLETIVA DA SEMANA*\n\n🎯 ${m.title}\n${how}\n\n📊 Meta: *${m.target} ${unit}*\n📈 Progresso: *${m.progress}/${m.target}*\n💰 Prêmio total: *R$ ${fmt(m.reward_cash)}*\n\n🏆 *CONTRIBUIÇÕES*\n`
          if(!b.rows.length) out+='Ninguém contribuiu ainda.\n'
          else b.rows.forEach((x,i)=>out+=`${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.'} *${x.push_name||'Jogador'}* — ${x.contribution} ${unit}${m.completed?' • R$ '+fmt(x.share):''}\n`)
          out+=m.completed?`\n✅ Concluída! Use *${prefix}resgatarmissao*.`:`\n💡 Quanto mais você contribuir, maior será sua parte do prêmio.`
          await reply(out)

        } else if(['resgatarmissao','resgatarmissão'].includes(cmd)){
          if(!isGroup) return await reply('👥 Esse comando funciona somente em grupos.')
          const r=await claimGroupMission(chat,sender)
          const unit=r.mission.mission_type==='quiz'?'acertos':r.mission.mission_type==='battle'?'batalhas':'ações'
          let out=`🎉 *RECOMPENSA COLETIVA!*\nSua contribuição: *${r.contribution} ${unit}*\n💰 Você recebeu: *R$ ${fmt(r.share)}*\n\n🏆 *RESULTADO DA MISSÃO*\n`
          r.leaderboard.forEach((x,i)=>out+=`${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.'} *${x.push_name||'Jogador'}* — ${x.contribution} ${unit} • *R$ ${fmt(x.share)}*\n`)
          await reply(out)

        } else if(['pegar'].includes(cmd)){
          if(!isGroup) return
          const r=await claimGroupEvent(chat,sender)
          await reply(`⚡ *VOCÊ FOI O MAIS RÁPIDO!*\n💰 Pegou *R$ ${fmt(r.reward_cash)}* do evento!`)

        } else if(['coletar'].includes(cmd)){
          const r=await collectBusinesses(sender)
          if(!r.total) return await reply('⏳ Seus negócios ainda não geraram pelo menos R$ 1 de lucro.')
          let text='💰 *LUCROS COLETADOS!*\n\n'
          r.details.forEach(x=>text+=`🏪 ${x.name}: *R$ ${fmt(Number(x.earned)*(Number(r.eventMultiplier||1)>1?Number(r.eventMultiplier):1))}*${Number(r.eventMultiplier||1)>1?` _(base R$ ${fmt(x.earned)} ×2)_`:''}\n`)
          text+=`${Number(r.eventMultiplier||1)>1?'\n🔥 *EVENTO 2X APLICADO*':''}\n💵 Bruto: *R$ ${fmt(r.gross)}*\n🧾 *TAXADE te pegou* (${r.taxRate}%): *-R$ ${fmt(r.tax)}*\n💰 Líquido recebido: *R$ ${fmt(r.total)}*`
          await reply(text)

        } else if(['motos','motocicletas'].includes(cmd)){
          const owned=await getMotorcycleGarage(sender)
          let text='🚲🏍️ *DELIVERY — BICICLETAS E MOTOS*\n\n'
          MOTORCYCLES.forEach((m,i)=>{
            const has=owned.some(x=>x.id===m.id)
            text+=`${i+1}️⃣ *${m.name}* — R$ ${fmt(m.price)}${has?' ✅':''}\n`
          })
          text+=`\n🛒 *Responda só com o número* para comprar.\n⌨️ Ou use *${prefix}comprarmoto número ou nome*.\n🍔 Moto: *${prefix}ifood* • Bicicleta: *${prefix}ifoodbike*.`
          setQuickFlow(chat,sender,'delivery_vehicle_buy',{},90000)
          await reply(text)

        } else if(['comprarmoto'].includes(cmd)){
          if(!args.length) return await reply(`🏍️ Use *${prefix}motos* para ver as opções e depois *${prefix}comprarmoto número ou nome*.`)
          const m=await buyMotorcycle(sender,args.join(' '))
          await reply(`🚲🏍️ *Veículo comprado!*\n\n${m.name}\n💰 R$ ${fmt(m.price)}\n\n🍔 Agora você pode usar *${prefix}ifood*.`)

        } else if(['minhasmotos','garagemmotos'].includes(cmd)){
          const rows=await getMotorcycleGarage(sender)
          if(!rows.length) return await reply(`🚲🏍️ Sua garagem de delivery está vazia. Veja *${prefix}motos*.`)
          let text='🚲🏍️ *MEUS VEÍCULOS DE DELIVERY*\n\n'
          rows.forEach((m,i)=>text+=`${i+1}. *${m.name}* — R$ ${fmt(m.price)}\n`)
          await reply(text.trim())

        } else if(['ifood','ifoodbike'].includes(cmd)){
          const r=await deliverIfood(sender)
          if(!r.ok){
            await reply(`🍔 Sua frota já trabalhou. Próxima rodada em *${duration(r.remaining)}*.`)
          }else{
            await progressDailyMission(sender,'work')
            if(isGroup) await progressGroupMission(chat,sender,'work')
            let text='🍔 *IFOOD — FROTA EM ROTA*\n\n'
            r.details.forEach(x=>{
              text+=`${x.vehicle.id==='bicicleta'?'🚲':'🏍️'} *${x.vehicle.name}* — R$ ${fmt(Number(x.total)*Number(r.eventMultiplier||1))}${Number(r.eventMultiplier||1)>1?` _(base R$ ${fmt(x.total)} ×2)_`:''}${x.tip?` (gorjeta base R$ ${fmt(x.tip)})`:''}\n`
            })
            text+=`${Number(r.eventMultiplier||1)>1?'\n🔥 *EVENTO 2X APLICADO*':''}\n💵 Bruto da frota: *R$ ${fmt(r.gross)}*\n🧾 *TAXADE te pegou* (${r.taxRate}%): *-R$ ${fmt(r.tax)}*\n💰 *LÍQUIDO RECEBIDO: R$ ${fmt(r.total)}*\n⏳ Nova rodada em ${Math.ceil(r.cooldown/60)} minutos.`
            await reply(text)
          }

        } else if(['uber'].includes(cmd)){
          const r=await driveUber(sender)
          if(!r.ok){
            await reply(`🚗 Sua frota já trabalhou. Próxima rodada em *${duration(r.remaining)}*.`)
          }else{
            await progressDailyMission(sender,'work')
            if(isGroup) await progressGroupMission(chat,sender,'work')
            let text='🚗 *UBER — FROTA NA RUA*\n\n'
            r.details.forEach(x=>{
              text+=`🚘 *${x.car.name}* (${x.category}) — R$ ${fmt(Number(x.total)*Number(r.eventMultiplier||1))}${Number(r.eventMultiplier||1)>1?` _(base R$ ${fmt(x.total)} ×2)_`:''}${x.tip?` (gorjeta base R$ ${fmt(x.tip)})`:''}\n`
            })
            text+=`\n💵 Bruto da frota: *R$ ${fmt(r.gross)}*\n🧾 *TAXADE te pegou* (${r.taxRate}%): *-R$ ${fmt(r.tax)}*\n💰 *LÍQUIDO RECEBIDO: R$ ${fmt(r.total)}*\n⏳ Nova rodada em ${Math.ceil(r.cooldown/60)} minutos.`
            await reply(text)
          }

        } else if(['depositar','deposit','dep'].includes(cmd)){
          const depositAll=['total','tudo'].includes(normalizeItemText(args[0]||''))
          const amount=depositAll?'total':parseAmount(args[0])
          if(!amount){
            setQuickFlow(chat,sender,'deposit_amount',{},90000)
            return await reply(
`🏦 *DEPOSITAR*

1️⃣ R$ 100
2️⃣ R$ 500
3️⃣ R$ 1.000
4️⃣ R$ 5.000
5️⃣ Máximo possível
6️⃣ Outro valor

0️⃣ Cancelar`
            )
          }
          const r=await deposit(sender,amount)
          await reply(`🏦 Depósito concluído.\n🪙 Carteira: R$ ${fmt(r.cash)}\n🏦 Banco: R$ ${fmt(r.bank)}`)

        } else if(['sacar','withdraw','saque'].includes(cmd)){
          const withdrawAll=['tudo','total'].includes(normalizeItemText(args[0]||''))
          let amount=parseAmount(args[0])
          if(withdrawAll){
            const p=await getProfile(sender)
            amount=Number(p?.bank||0)
            if(amount<1) return await reply('🏦 Você não tem saldo no banco para sacar.')
          }
          if(!amount){
            setQuickFlow(chat,sender,'withdraw_amount',{},90000)
            return await reply(
`💵 *SACAR*

1️⃣ R$ 100
2️⃣ R$ 500
3️⃣ R$ 1.000
4️⃣ R$ 5.000
5️⃣ Todo o saldo do banco
6️⃣ Outro valor

0️⃣ Cancelar`
            )
          }
          const r=await withdraw(sender,amount)
          await reply(`💵 Saque concluído.\n🪙 Carteira: R$ ${fmt(r.cash)}\n🏦 Banco: R$ ${fmt(r.bank)}`)

        } else if(['pix','transferir','transfer'].includes(cmd)){
          const target=mentionsOf(msg)[0]
          const amount=parseAmount(args.find(a=>/^\d[\d.,]*$/.test(a)))
          if(!target){
            setQuickFlow(chat,sender,'pix_target',{},90000)
            return await reply('💸 Marque agora a pessoa que vai receber o PIX.')
          }
          if(!amount){
            setQuickFlow(chat,sender,'pix_amount',{target},90000)
            return await reply(
`💸 *VALOR DO PIX*

1️⃣ R$ 100
2️⃣ R$ 500
3️⃣ R$ 1.000
4️⃣ R$ 5.000
5️⃣ Outro valor

0️⃣ Cancelar`
            )
          }
          const r=await transfer(sender,target,amount)
          await reply(`💸 *PIX realizado!*\n\n➡️ Enviado: R$ ${fmt(r.amount)}\n🧾 Taxa: R$ ${fmt(r.fee)}\n💰 Total debitado: R$ ${fmt(r.total)}`,{mentions:[target]})

        } else if(['piada','joke'].includes(cmd)){
          setQuickFlow(chat,sender,'fun_confirm',{service:'joke',price:FUN_PRICES.joke},90000)
          await reply('😂 Comprar uma *Piada do Alpha Bot* por *R$ '+fmt(FUN_PRICES.joke)+'*?\n\n1️⃣ Comprar\n2️⃣ Cancelar')

        } else if(['horoscopo','horóscopo'].includes(cmd)){
          setQuickFlow(chat,sender,'horoscope_sign',{},90000)
          let text='🔮 *ESCOLHA SEU SIGNO*\n\n'
          SIGNS.forEach((sg,i)=>text+='*'+(i+1)+'.* '+sg[1]+'\n')
          text+='\n0️⃣ Sair'
          await reply(text)

        } else if(['loja','shop'].includes(cmd)){
          await showShopCategoryMenu(chat,sender,reply)

        } else if(['comprar','buy'].includes(cmd)){
          const id=resolveShopItem(args[0])
          const qty=parseInt(args[1]||'1',10)
          if(!id){
            await showShopCategoryMenu(chat,sender,reply)
            return
          }
          const r=await buyItem(sender,id,qty)
          await progressDailyMission(sender,'shop')
          await reply(`🛒 Compra concluída!\n📦 ${r.item.name} ×${r.qty}\n💸 R$ ${fmt(r.total)}`)

        } else if(BOX_IDS.includes(cmd)){
          const items=await getInventory(sender)
          const box=items.find(i=>i.item_id===cmd)
          if(!box) return await reply('🎁 Você não possui essa caixa.')
          await showBoxQuantityMenu(chat,sender,reply,box)

        } else if(SHOP_IDS.includes(cmd) && !BOX_IDS.includes(cmd)){
          const r=await buyItem(sender,cmd,1)
          await progressDailyMission(sender,'shop')
          await reply(`🛒 Compra rápida concluída!\n📦 ${r.item.name} ×1\n💸 R$ ${fmt(r.total)}`)

        } else if(['inventario','inventory','inv'].includes(cmd)){
          await showInventoryMenu(chat,sender,reply)

        } else if(['vender','sell'].includes(cmd)){
          await showSellMenu(chat,sender,reply)

        } else if(['venderrepetidos','venderduplicados'].includes(cmd)){
          const r=await sellDuplicateEquipment(sender)
          if(!r.types) return await reply('💰 Você não tem equipamentos repetidos vendáveis agora.\n\nO Alpha mantém *1 cópia de cada arma/armadura*. Itens lendários não são vendidos automaticamente.')
          let text='💰 *REPETIDOS VENDIDOS!*\n\n'
          r.sold.forEach(i=>{ text+='• *'+i.name+'* ×'+i.qty+' — R$ '+fmt(i.total)+'\n' })
          text+='\n🧮 Unidades vendidas: *'+r.totalUnits+'*'
          text+='\n💵 Total recebido: *R$ '+fmt(r.total)+'*'
          text+='\n🪙 Carteira: *R$ '+fmt(r.cash)+'*'
          text+='\n\n🛡️ 1 cópia de cada equipamento foi preservada.'
          await reply(text)

        } else if(['uparitem','upgradeitem','melhoraritem'].includes(cmd)){
          const items=await listUpgradeableEquipment(sender)
          if(!items.length) return await reply('⬆️ Você ainda não possui arma ou armadura para aprimorar.')
          const available=items.filter(i=>i.next)
          if(!available.length) return await reply('🏆 Todos os seus equipamentos já estão no *Lv.10*.')
          setQuickFlow(chat,sender,'upgrade_select',{items:available.map(i=>({itemId:i.item_id}))},5*60*1000)
          let text='⬆️ *UPAR EQUIPAMENTO*\n\n'
          available.forEach((i,n)=>{
            const stat=i.category==='weapon'
              ? `${i.current.atk} → ${i.next.atk} ATK`
              : `${i.current.def} → ${i.next.def} DEF`
            text+=`*${n+1}.* ${rarityLabel(i.rarity)} — *${i.name}*\n   ⭐ Lv.${i.level} → Lv.${Number(i.level)+1} • ${stat}\n   💰 R$ ${fmt(i.cost)}\n`
          })
          text+='\n💡 Cada nível adiciona cerca de *4% do atributo base*. Máximo: *Lv.10*.\n👉 Responda apenas com o número.\n0️⃣ Cancelar'
          await reply(text)

        } else if(['equipar','equip'].includes(cmd)){
          const items=await getInventory(sender)
          const equipables=items.filter(i=>['weapon','armor'].includes(i.category))
          if(!equipables.length) return await reply('⚙️ Você não possui arma ou armadura para equipar.')

          const query=args.join(' ').trim()
          if(!query){
            await showEquipmentMenu(chat,sender,reply)
            return
          }

          const anyItem=resolveOwnedItem(items,query)
          if(anyItem && !['weapon','armor'].includes(anyItem.category)){
            if(BOX_IDS.includes(anyItem.item_id)){
              return await reply(`🎁 *${anyItem.name}* não é equipamento.\nAbra pelo *${prefix}inventario*.`)
            }
            return await reply(`❌ *${anyItem.name}* não pode ser equipado.`)
          }

          const item=resolveOwnedItem(items,query,['weapon','armor'])
          if(!item){
            return await reply(`❌ Não encontrei esse equipamento no seu inventário.\nUse *${prefix}equipar* para escolher pela lista.`)
          }

          const r=await equipItem(sender,item.item_id)
          const tipo=r.category==='weapon'?'arma':'armadura'
          await reply(`✅ *EQUIPADO!*\n\n${r.name} agora é sua ${tipo} ativa.`)

        } else if(['usar','use'].includes(cmd)){
          const items=await getInventory(sender)
          const usable=items.filter(i=>i.category==='consumable')
          const query=args.join(' ').trim()

          if(!query){
            if(!usable.length) return await reply('🧪 Você não possui poções utilizáveis no momento.')
            setQuickFlow(chat,sender,'use_select',{items:usable.map(i=>i.item_id)},90000)
            let text='🧪 *QUAL ITEM QUER USAR?*\n\n'
            usable.forEach((i,idx)=>text+=`*${idx+1}.* ${i.name} ×${i.quantity}\n`)
            text+='\n👉 Responda apenas com o número.\n0️⃣ Cancelar'
            return await reply(text)
          }

          const item=resolveOwnedItem(items,query,['consumable'])
          if(!item){
            const anyItem=resolveOwnedItem(items,query)
            if(anyItem?.item_id==='caixa_sorte'){
              return await reply(`🎁 Para abrir a Caixa da Sorte, use *${prefix}caixa_sorte*.`)
            }
            return await reply(`❌ Não encontrei uma poção com esse nome.\nUse *${prefix}usar* para ver as opções.`)
          }

          if(item.item_id==='energetico_pet'){
            const r=await usePetEnergyItem(sender,item.item_id)
            await reply(`⚡ *ENERGÉTICO PET USADO!*\n\n🐾 ${r.petName}\n🔋 Energia: *${r.before} → ${r.energy}/${r.max}*\n⚡ Recuperado: *+${r.recovered}*\n📦 Restam: *${r.remaining}*`)
          }else if(['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica'].includes(item.item_id)){
            const r=await usePetPotion(sender,item.item_id)
            await reply(`🐾🧪 *${r.name} usada!*\n❤️ ${r.petName}: +${r.healed} HP\nHP atual: *${r.hp}/${r.maxHp}*\n📦 Restam: *${r.remaining}*`)
          }else{
            const r=await usePotion(sender,item.item_id)
            await reply(`🧪 *${r.name} usada!*\n❤️ +${r.healed} HP\nHP atual: ${r.hp}/${r.maxHp}`)
          }

        } else if(['curarpet','curapet','petcura'].includes(cmd)){
          const aliases={
            comum:'pocao_pet_comum',common:'pocao_pet_comum',
            rara:'pocao_pet_rara',raro:'pocao_pet_rara',rare:'pocao_pet_rara',
            epica:'pocao_pet_epica','épica':'pocao_pet_epica',epico:'pocao_pet_epica','épico':'pocao_pet_epica',epic:'pocao_pet_epica'
          }
          const requested=normalizeItemText(args.join(' '))
          let itemId=aliases[requested]||null
          if(requested && !itemId){
            const items=await getInventory(sender)
            const petPotions=items.filter(i=>['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica'].includes(i.item_id))
            itemId=resolveOwnedItem(petPotions,requested,['consumable'])?.item_id||null
            if(!itemId) return await reply(`❌ Não encontrei essa poção de pet.\nUse *${prefix}curarpet comum*, *rara* ou *epica*.`)
          }
          const r=await usePetPotion(sender,itemId)
          await reply(`🐾🧪 *${r.name} usada!*\n\n🐾 ${r.petName}\n❤️ HP: *${r.before} → ${r.hp}/${r.maxHp}*\n💚 Recuperado: *+${r.healed}*\n📦 Restam: *${r.remaining}*\n\n💡 Sem escolher raridade, *!curarpet* usa a menor poção suficiente disponível.`)

        } else if(['energiapet','energia_pet','petenergia'].includes(cmd)){
          const r=await usePetEnergyItem(sender,'energetico_pet')
          await reply(`⚡ *ENERGÉTICO PET USADO!*\n\n🐾 ${r.petName}\n🔋 Energia: *${r.before} → ${r.energy}/${r.max}*\n⚡ Recuperado: *+${r.recovered}*\n📦 Restam: *${r.remaining}*`)

        } else if(['status'].includes(cmd)){
          const mentioned=mentionsOf(msg)[0]
          const statusTarget=await resolvePlayerJid(sock,chat,mentioned || sender,msg)
          const p=await getCombatProfile(statusTarget)
          await reply(
`⚔️ *STATUS RPG — ${p.push_name || 'Jogador'}*

⭐ Nível: ${p.level}
✨ EXP: ${p.exp}/${p.level*100}
❤️ HP: ${p.hp}/${p.max_hp}
⚔️ ATK: ${p.effective_atk} (${p.base_atk} base + ${p.weapon_atk} arma)
🛡️ DEF: ${p.effective_def} (${p.base_def} base + ${p.armor_def} armadura)
💨 SPD: ${p.spd}

🗡️ Arma: ${p.weapon_name} *Lv.${p.weapon_level||1}*
🥋 Armadura: ${p.armor_name} *Lv.${p.armor_level||1}*

🏆 Vitórias: ${p.win}
💀 Derrotas: ${p.loss}`
          )

        } else if(['batalhar','batalha','battle','duelo'].includes(cmd)){
          const targetMention=mentionsOf(msg)[0]
          if(!targetMention){
            setQuickFlow(chat,sender,'battle_target',{},90000)
            return await reply('⚔️ Marque agora a pessoa que você quer desafiar.')
          }
          const targetIdentity=await resolvePlayerIdentity(sock,chat,targetMention,msg)
          const target=targetIdentity.jid
          if(!target?.endsWith('@s.whatsapp.net')){
            return await reply('⚠️ Não consegui identificar essa pessoa. Peça para ela enviar qualquer comando e tente novamente.')
          }
          await consolidateUserIdentity(target,targetIdentity.aliases)
          const r=await battle(sender,target)
          if(!r.ok) return await reply(`⏳ Você poderá batalhar novamente em ${duration(r.remaining)}.`)

          const last=r.log.slice(-6)
          let text='⚔️ *BATALHA DO ALPHA BOT*\n\n'
          for(const l of last){
            text+=`${l.crit?'💥 CRÍTICO! ':'⚔️ '}${l.from} causou *${l.dmg}* em ${l.to} — ❤️ ${l.hp}\n`
          }
          text+=`\n🏆 *Vencedor: ${r.winner.name}*\n💰 Prêmio: R$ ${fmt(r.reward)}\n✨ EXP: +${r.winXpGain||40} vencedor / +${r.loseXpGain||15} derrotado${Number(r.eventMultiplier||1)>1?'\n🔥 *EVENTO 2X ATIVO*':''}`
          if(r.winExp.levels>0) text+=`\n⬆️ ${r.winner.name} subiu ${r.winExp.levels} nível(is)!`
          if(r.loseExp.levels>0) text+=`\n⬆️ ${r.loser.name} subiu ${r.loseExp.levels} nível(is)!`
          await progressDailyMission(sender,'battle')
      if(isGroup) await progressGroupMission(chat,sender,'battle')
          await reply(text,{mentions:[target]})

        } else if(['rankingrpg','rankrpg','toprpg'].includes(cmd)){
          const rows=await combatLeaderboard(10)
          if(!rows.length) return await reply('⚔️ Ainda não há jogadores no ranking RPG.')
          let text='⚔️ *RANKING RPG*\n\n'
          rows.forEach((r,i)=>{
            const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`
            text+=`${medal} *${r.push_name || 'Jogador'}* — Nv.${r.level} | ${r.win}V/${r.loss}D\n`
          })
          await reply(text.trim())

        } else if(['ranking','rank','top'].includes(cmd)){
          const rows=await leaderboard(10,await currentGroupPlayerJids(chat))
          if(!rows.length) return await reply('🏆 Ainda não há jogadores no ranking.')
          let text='🏆 *RANKING — MAIS RICOS*\n\n'
          rows.forEach((r,i)=>{
            const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`
            text+=`${medal} *${r.push_name || 'Jogador'}* — R$ ${fmt(r.total)}\n`
          })
          await reply(text.trim())



        } else if(['missoes','missões','missions'].includes(cmd)){
          const r=await getDailyMissions(sender)
          let text='📋 *MISSÕES DIÁRIAS*\n\n'
          for(const m of r.missions){
            const done=Number(m.progress)>=Number(m.target)
            const reward=[
              Number(m.reward_cash)>0?`R$ ${fmt(m.reward_cash)}`:null,
              Number(m.reward_box)>0?`${m.reward_box}x Caixa da Sorte`:null
            ].filter(Boolean).join(' + ')
            text+=`${done?'✅':'⬜'} *${m.title}* — ${m.progress}/${m.target}\n🎁 ${reward}${m.claimed?' _(resgatada)_':''}\n\n`
          }
          text+=`Use *${prefix}resgatarmissoes* para coletar missões concluídas.`
          await reply(text.trim())

        } else if(['resgatarmissoes','resgatarmissao','claimmissions'].includes(cmd)){
          const r=await claimDailyMissions(sender)
          if(!r.claimed) return await reply('📋 Você não tem missão concluída e não resgatada agora.')
          await reply(
`🎁 *MISSÕES RESGATADAS!*

✅ Missões: ${r.claimed}
💰 Dinheiro: R$ ${fmt(r.cash)}
🎁 Caixas da Sorte: ${r.boxes}`
          )

        } else if(['cla','clã','clacofre'].includes(cmd)){
          const c=await getClanForUser(sender)
          setQuickFlow(chat,sender,'clan_menu',{},90000)
          if(!c){
            return await reply(
`🏴 *CLÃS*

1️⃣ Criar um clã
2️⃣ Aceitar convite
3️⃣ Ranking de clãs

0️⃣ Sair`
            )
          }
          const leader=c.role==='leader'
          await reply(
`🏴 *CLÃ ${c.name}*

1️⃣ Ver informações
2️⃣ Doar ao cofre
3️⃣ Convidar pessoa
4️⃣ Ranking de clãs
${leader?'5️⃣ Transferir liderança\n6️⃣ Expulsar membro\n7️⃣ Sair do clã':'5️⃣ Sair do clã'}

0️⃣ Sair`
          )

        } else if(['claajuda','clãajuda'].includes(cmd)){
          await reply(
`🏴 *COMANDOS DE CLÃ*

${prefix}cla — informações do seu clã
${prefix}criarcla Nome — criar por R$ 10.000
${prefix}claconvidar @pessoa — convidar
${prefix}claaceitar — aceitar convite
${prefix}cladoar 1000 — doar ao cofre
${prefix}clapromover @pessoa — transferir liderança
${prefix}claexpulsar @pessoa — expulsar membro
${prefix}saircla — sair do clã
${prefix}clas — ranking de clãs`
          )

        } else if(['criarcla','criarclã'].includes(cmd)){
          const name=args.join(' ')
          if(!name){
            setQuickFlow(chat,sender,'clan_create_name',{},90000)
            return await reply('🏴 Digite agora o nome do clã.\n💰 Custo: R$ 10.000')
          }
          const c=await createClan(sender,name)
          await reply(`🏴 Clã *${c.name}* criado!\n👑 Você é o líder.\n💰 Custo: R$ 10.000`)

        } else if(['claconvidar','clãconvidar','convidarcla'].includes(cmd)){
          const target=mentionsOf(msg)[0]
          if(!target){
            setQuickFlow(chat,sender,'clan_invite_target',{},90000)
            return await reply('🏴 Marque agora a pessoa que deseja convidar.')
          }
          const r=await inviteToClan(sender,target)
          await reply(
`🏴 Convite enviado para entrar no clã *${r.clan.name}*.\nA pessoa deve usar *${prefix}claaceitar* em até 24h.`,
            {mentions:[target]}
          )

        } else if(['claaceitar','clãaceitar','aceitarcla'].includes(cmd)){
          const r=await acceptClanInvite(sender)
          await reply(`🏴 Você entrou no clã *${r.name}*!`)

        } else if(['clapromover','clãpromover'].includes(cmd)){
          const target=mentionsOf(msg)[0]
          if(!target){
            setQuickFlow(chat,sender,'clan_transfer_target',{},90000)
            return await reply('👑 Marque agora o membro que receberá a liderança.')
          }
          const r=await transferClanLeadership(sender,target)
          await reply(`👑 Liderança do clã *${r.name}* transferida.`,{mentions:[target]})

        } else if(['claexpulsar','clãexpulsar'].includes(cmd)){
          const target=mentionsOf(msg)[0]
          if(!target){
            setQuickFlow(chat,sender,'clan_kick_target',{},90000)
            return await reply('🚪 Marque agora o membro que deseja expulsar.')
          }
          const r=await kickClanMember(sender,target)
          await reply(`🚪 Membro removido do clã *${r.name}*.`,{mentions:[target]})

        } else if(['cladoar','clãdoar','doarcla'].includes(cmd)){
          const amount=parseAmount(args[0])
          if(!amount){
            setQuickFlow(chat,sender,'clan_donate',{},90000)
            return await reply(
`💰 *QUANTO DOAR AO CLÃ?*

1️⃣ R$ 100
2️⃣ R$ 1.000
3️⃣ R$ 5.000
4️⃣ R$ 10.000
5️⃣ Outro valor

0️⃣ Cancelar`
            )
          }
          const r=await donateClan(sender,amount)
          await reply(
`🏴 *DOAÇÃO AO CLÃ*

💰 Doado: R$ ${fmt(r.amount)}
🏦 Cofre: R$ ${fmt(r.treasury)}
⭐ Nível do clã: ${r.level}`
          )

        } else if(['saircla','sairclã'].includes(cmd)){
          const r=await leaveClan(sender)
          if(r.dissolved) await reply(`🏴 O clã *${r.name}* foi encerrado porque você era o único membro.`)
          else await reply(`🏴 Você saiu do clã *${r.name}*.`)

        } else if(['clas','clãs','rankingclas','topclas'].includes(cmd)){
          const rows=await listClans(10)
          if(!rows.length) return await reply('🏴 Ainda não existem clãs.')
          let text='🏴 *RANKING DE CLÃS*\n\n'
          rows.forEach((c,i)=>{
            const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`
            text+=`${medal} *${c.name}* — Nv.${c.level} | ${c.members} membros | R$ ${fmt(c.treasury)}\n`
          })
          await reply(text.trim())

        } else if(['casas','imoveis','imóveis'].includes(cmd)){
          setQuickFlow(chat,sender,'house_select',{},90000)
          let text='🏠 *IMÓVEIS DO ALPHA BOT*\n\n'
          HOUSES.forEach((h,i)=>text+=`*${i+1}.* ${h.name} — R$ ${fmt(h.price)}\n`)
          text+='\n🏡 Sua casa atual vale 60% como entrada em uma melhor.\n👉 *Responda com o número do imóvel.*\n0️⃣ Cancelar'
          await reply(text)

        } else if(['comprarcasa'].includes(cmd)){
          const input=args[0]
          if(!input){
            setQuickFlow(chat,sender,'house_select',{},90000)
            let text='🏠 *QUAL IMÓVEL QUER COMPRAR?*\n\n'
            HOUSES.forEach((h,i)=>text+=`*${i+1}.* ${h.name} — R$ ${fmt(h.price)}\n`)
            text+='\n0️⃣ Cancelar'
            return await reply(text)
          }
          const r=await buyHouse(sender,input)
          let text=`🏠 *NOVA CASA!*\n\n🏡 ${r.house.name}\n💰 Valor: R$ ${fmt(r.house.price)}\n`
          if(r.previous) text+=`🔁 Entrada da ${r.previous.name}: R$ ${fmt(r.tradeIn)}\n`
          text+=`💸 Pago agora: R$ ${fmt(r.cost)}`
          await reply(text)

        } else if(['minhacasa','casa'].includes(cmd)){
          const h=await getHome(sender)
          if(!h) return await reply(`🏠 Você ainda não possui imóvel. Veja *${prefix}casas*.`)
          await reply(`🏠 *SUA CASA*\n\n🏡 ${h.name}\n💰 Valor patrimonial: R$ ${fmt(h.price)}`)

        } else if(['carros','concessionaria','concessionária'].includes(cmd)){
          setQuickFlow(chat,sender,'car_select',{},90000)
          let text='🚗 *CONCESSIONÁRIA DO ALPHA BOT*\n\n'
          CARS.forEach((c,i)=>text+=`*${i+1}.* ${c.name} — R$ ${fmt(c.price)}\n`)
          text+='\n🚗 Garagem atual comporta até 5 carros.\n👉 *Responda com o número do carro.*\n0️⃣ Cancelar'
          await reply(text)

        } else if(['comprarcarro'].includes(cmd)){
          const input=args[0]
          if(!input){
            setQuickFlow(chat,sender,'car_select',{},90000)
            let text='🚗 *QUAL CARRO QUER COMPRAR?*\n\n'
            CARS.forEach((c,i)=>text+=`*${i+1}.* ${c.name} — R$ ${fmt(c.price)}\n`)
            text+='\n0️⃣ Cancelar'
            return await reply(text)
          }
          const c=await buyCar(sender,input)
          await reply(`🚗 *CARRO COMPRADO!*\n\n🔑 ${c.name}\n💰 R$ ${fmt(c.price)}`)

        } else if(['garagem','meuscarros'].includes(cmd)){
          const cars=await getGarage(sender)
          if(!cars.length) return await reply(`🚗 Sua garagem está vazia. Veja *${prefix}carros*.`)
          let text=`🚗 *SUA GARAGEM* — ${cars.length}/5\n\n`
          cars.forEach((c,i)=>text+=`${i+1}. *${c.name}* — R$ ${fmt(c.price)}\n`)
          await reply(text.trim())

        } else if(['patrimonio','patrimônio'].includes(cmd)){
          const p=await getPatrimony(sender)
          await reply(
`💎 *SEU PATRIMÔNIO*

🪙 Carteira: R$ ${fmt(p.cash)}
🏦 Banco: R$ ${fmt(p.bank)}
🎒 Itens: R$ ${fmt(p.inventory_value)}
🏠 Imóvel: R$ ${fmt(p.home_value)}
🚗 Carros: R$ ${fmt(p.cars_value)}
🏍️ Motos/Bike: R$ ${fmt(p.motorcycles_value)}
🏪 Negócios: R$ ${fmt(p.businesses_value)}

💰 *Total: R$ ${fmt(p.total)}*`
          )

        } else if(['rankingpatrimonio','rankingpatrimônio','toppatrimonio'].includes(cmd)){
          const rows=await patrimonyLeaderboard(10)
          if(!rows.length) return await reply('💎 Ainda não há dados de patrimônio.')
          let text='💎 *RANKING DE PATRIMÔNIO*\n\n'
          rows.forEach((r,i)=>{
            const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`
            text+=`${medal} *${r.push_name||'Jogador'}* — R$ ${fmt(r.total)}\n`
          })
          await reply(text.trim())

        } else if(['futebol','fut'].includes(cmd)){
          await reply('⚽ *ALPHA FUTEBOL*\n\n*!partidas* — jogos brasileiros de hoje\n*!partidas amanha* — jogos de amanhã\n*!tabela* — Brasileirão Série A\n*!time Corinthians* — último e próximo jogo\n\n💡 *!jogos* continua sendo o menu de minigames.')
        } else if(['partidas','jogoshoje'].includes(cmd)){
          const tomorrow=['amanha','amanhã'].includes((args[0]||'').toLowerCase()); const fs=await footballToday(tomorrow?1:0)
          await reply('⚽ *JOGOS '+(tomorrow?'DE AMANHÃ':'DE HOJE')+' — BRASIL*\n\n'+formatFixtures(fs))
        } else if(['tabela','brasileirao','brasileirão'].includes(cmd)){
          const rows=await brazilStandings(); if(!rows.length)return await reply('📊 Classificação indisponível agora.'); let out='🇧🇷 *BRASILEIRÃO SÉRIE A — TABELA*\n\n'; rows.slice(0,20).forEach(r=>out+=(r.position||r.rank)+'. *'+r.team.name+'* — '+r.points+' pts | '+(r.playedGames??r.all?.played??0)+'J | '+(r.won??r.all?.win??0)+'V '+(r.draw??r.all?.draw??0)+'E '+(r.lost??r.all?.lose??0)+'D\n'); await reply(out.trim())
        } else if(['time','clube'].includes(cmd)){
          const q=args.join(' ').trim(); if(!q)return await reply('Uso: *'+prefix+'time Corinthians*'); const r=await teamSummary(q); await reply('⚽ *'+r.team.name.toUpperCase()+'*\n\n⬅️ *Último jogo*\n'+formatTeamFixture(r.last)+'\n\n➡️ *Próximo jogo*\n'+formatTeamFixture(r.next))
        } else if(['games','jogos','minigames','minigame'].includes(cmd)){
          setQuickFlow(chat,sender,'main',{},90000)
          await reply(
`🎮 *MINIGAMES DO ALPHA BOT*

1️⃣ 🎰 Roleta
2️⃣ 🪙 Cara ou Coroa
3️⃣ ✊ Pedra, Papel e Tesoura
4️⃣ 🔤 Forca
5️⃣ 🧠 Quiz
6️⃣ 🔢 Adivinhe o Número
7️⃣ 👹 Boss

👉 *Responda apenas com o número do jogo.*
Você não precisa usar ! enquanto estiver neste menu.

0️⃣ Sair

_Os comandos antigos continuam funcionando normalmente._`
          )

        } else if(['roleta','roletagrupo'].includes(cmd)){
          const sub=(args[0]||'').toLowerCase()
          if(cmd==='roletagrupo' || ['grupo','galera','multi'].includes(sub)){
            const offset=cmd==='roletagrupo'?0:1
            const amount=parseAmount(args[offset]); const choice=(args[offset+1]||'').toLowerCase()
            if(!amount||!choice) return await reply(`Uso: *${prefix}roleta grupo 1000 vermelho*`)
            const player=await resolvePlayerJid(sock,chat,sender,msg)
            await createGroupRoulette(chat,player,amount,choice)
            return await reply(`🎰 *ROLETA COLETIVA ABERTA!*\n\nSua aposta: *R$ ${fmt(amount)} — ${choice}*\n\n👥 Quem quiser jogar tem *2 minutos* para mandar:\n*${prefix}apostar 500 preto*\n\nQuando todos entrarem, você pode usar *${prefix}girar*.`)
          }
          const amount=parseAmount(args[0])
          const choice=(args[1]||'').toLowerCase()
          if(!amount||!choice) return await reply(`Uso: *${prefix}roleta 100 vermelho*\nColetiva: *${prefix}roleta grupo 1000 vermelho*`)
          const player=await resolvePlayerJid(sock,chat,sender,msg)
          const r=await roulette(player,amount,choice)
          const result=r.payout>0
            ? `🎉 Você ganhou R$ ${fmt(r.payout)}! Lucro: R$ ${fmt(r.profit)}`
            : `💸 Você perdeu R$ ${fmt(r.amount)}.`
          await progressDailyMission(player,'game')
          await reply(`🎰 *ROLETA*\n\nNúmero: *${r.number}*\nCor: *${r.color}*\nSua escolha: *${r.choice}*\n\n${result}`)

        } else if(['apostar','entrarroleta'].includes(cmd)){
          const amount=parseAmount(args[0]); const choice=(args[1]||'').toLowerCase()
          if(!amount||!choice) return await reply(`Uso: *${prefix}apostar 500 preto*`)
          const player=await resolvePlayerJid(sock,chat,sender,msg)
          await joinGroupRoulette(chat,player,amount,choice)
          await reply(`✅ Você entrou na roleta coletiva com *R$ ${fmt(amount)}* no *${choice}*.`)

        } else if(['girar','girarroleta'].includes(cmd)){
          const player=await resolvePlayerJid(sock,chat,sender,msg)
          const r=await spinGroupRoulette(chat,player)
          let out=`🎰 *ROLETA COLETIVA*\n\n🎯 Número: *${r.number}*\n🎨 Cor: *${r.color.toUpperCase()}*\n\n`
          for(const x of r.results){
            out+=`@${String(x.jid).split('@')[0]} — R$ ${fmt(x.amount)} no ${x.choice}: ${x.payout>0?`🏆 ganhou R$ ${fmt(x.payout)}`:'💸 perdeu'}\n`
          }
          await reply(out.trim(),{mentions:r.results.map(x=>x.jid)})

        } else if(['cara','coroa'].includes(cmd)){
          const choice=cmd
          const targetRaw=mentionsOf(msg)[0]
          const amount=parseAmount(args.find(a=>/^\d[\d.,]*$/.test(a)))
          if(targetRaw){
            if(!amount) return await reply(`Uso: *${prefix}${choice} @pessoa 5000*`)
            const target=await resolvePlayerJid(sock,chat,targetRaw,msg)
            const challenger=await resolvePlayerJid(sock,chat,sender,msg)
            const r=await createCoinDuel(chat,challenger,target,amount,choice)
            return await reply(`🪙 *DESAFIO — CARA OU COROA*\n\n💰 Aposta de cada jogador: *R$ ${fmt(r.amount)}*\n🪙 Você escolheu: *${r.choice}*\n💵 Prêmio total: *R$ ${fmt(r.amount*2)}*\n\nA pessoa marcada tem *2 minutos* para usar *${prefix}aceitar*.`,{mentions:[targetRaw]})
          }
          if(!amount) return await reply(`Uso: *${prefix}${choice} 100*\nPvP: *${prefix}${choice} @pessoa 5000*`)
          const player=await resolvePlayerJid(sock,chat,sender,msg)
          const r=await coinFlip(player,amount,choice)
          await progressDailyMission(player,'game')
          await reply(`🪙 *CARA OU COROA*\n\nResultado: *${r.result}*\nVocê escolheu: *${r.choice}*\n${r.payout>0?`🎉 Ganhou R$ ${fmt(r.payout)}!`:`💸 Perdeu R$ ${fmt(r.amount)}.`}`)

        } else if(['aceitar'].includes(cmd)){
          const player=await resolvePlayerJid(sock,chat,sender,msg)
          const r=await acceptCoinDuel(chat,player)
          await progressDailyMission(player,'game')
          await progressDailyMission(r.challenger,'game')
          await reply(`🪙 *CARA OU COROA — PvP*\n\nResultado: *${r.result.toUpperCase()}*\n💰 Pote: *R$ ${fmt(r.pot)}*\n🏆 Vencedor: @${String(r.winner).split('@')[0]}\n\nO prêmio foi creditado automaticamente.`,{mentions:[r.winner]})

        } else if(['ppt'].includes(cmd)){
          const targetRaw=mentionsOf(msg)[0]
          if(targetRaw){
            const amount=parseAmount(args.find(a=>/^\d[\d.,]*$/.test(a)))
            const choice=args.map(x=>String(x).toLowerCase()).find(x=>['pedra','papel','tesoura'].includes(x))
            if(!amount||!choice) return await reply(`Uso PvP: *${prefix}ppt @pessoa 5000 pedra*`)
            const target=await resolvePlayerJid(sock,chat,targetRaw,msg), challenger=await resolvePlayerJid(sock,chat,sender,msg)
            const r=await createRpsDuel(chat,challenger,target,amount,choice)
            return await reply(`✊ *DESAFIO PPT*\n\n💰 Cada jogador: R$ ${fmt(r.amount)}\n💵 Pote: R$ ${fmt(r.amount*2)}\n\nA pessoa marcada tem 2 minutos para usar *${prefix}aceitarppt pedra|papel|tesoura*.`,{mentions:[targetRaw]})
          }
          const choice=(args[0]||'').toLowerCase()
          if(!choice) return await reply(`Uso: *${prefix}ppt pedra*\nPvP: *${prefix}ppt @pessoa 5000 pedra*`)
          const r=rps(choice), emoji=r.result==='vitoria'?'🏆':r.result==='empate'?'🤝':'💀'
          await progressDailyMission(sender,'game')
          await reply(`✊ *PEDRA, PAPEL E TESOURA*\n\nVocê: *${r.choice}*\nAlpha Bot: *${r.bot}*\n\n${emoji} *${r.result.toUpperCase()}*`)

        } else if(cmd==='aceitarppt'){
          const player=await resolvePlayerJid(sock,chat,sender,msg), r=await acceptRpsDuel(chat,player,args[0])
          await reply(r.winner?`✊ *PPT PvP*\n\n🏆 Vencedor: @${String(r.winner).split('@')[0]}\n💰 Pote: R$ ${fmt(r.pot)}`:`🤝 *EMPATE!* As apostas foram devolvidas.`,{mentions:r.winner?[r.winner]:[r.challenger,player]})

        } else if(cmd==='torneio'){
          if(!isGroup) return await reply('🏆 Torneios funcionam em grupos.')
          const amount=parseAmount(args[0])||0, host=await resolvePlayerJid(sock,chat,sender,msg)
          const r=await createTournament(chat,host,amount)
          await reply(`🏆 *TORNEIO ABERTO!*\n\n💰 Entrada: R$ ${fmt(r.amount)}\n⏱️ Inscrições por 5 minutos.\n\nUse *${prefix}entrartorneio*.\nO criador inicia com *${prefix}iniciartorneio*.`)

        } else if(cmd==='entrartorneio'){
          const player=await resolvePlayerJid(sock,chat,sender,msg),r=await joinTournament(chat,player)
          await reply(`🏆 Você entrou no torneio! Participantes: *${r.players.length}*.`)

        } else if(cmd==='iniciartorneio'){
          const player=await resolvePlayerJid(sock,chat,sender,msg),r=await startTournament(chat,player)
          await reply(`🏆 *TORNEIO ENCERRADO!*\n\n👥 Participantes: ${r.players.length}\n🏆 Campeão: @${String(r.winner).split('@')[0]}\n💰 Prêmio: R$ ${fmt(r.pot)}`,{mentions:[r.winner]})

        } else if(['forca'].includes(cmd)){
          const r=await startHangman(chat)
          if(r.already) return await reply(`🔤 Já existe uma forca ativa.\nDica: *${r.hint}*\nPalavra: ${r.word.split('').map(ch=>r.letters.includes(ch)?ch:'_').join(' ')}\n❤️ Vidas: ${r.lives}`)
          await progressDailyMission(sender,'game')
          await reply(`🔤 *FORCA INICIADA!*\n\nDica: *${r.hint}*\nPalavra: ${r.word.split('').map(()=> '_').join(' ')}\n❤️ Vidas: 6\n\nUse *${prefix}letra a* ou *${prefix}palavra resposta*`)

        } else if(['letra'].includes(cmd)){
          const r=await hangmanLetter(chat,args[0])
          if(r.repeat) return await reply(`🔁 Essa letra já foi usada.\n${r.masked}\n❤️ Vidas: ${r.lives}`)
          if(r.won) return await reply(`🎉 *FORCA VENCIDA!*\nA palavra era *${r.word}*.`)
          if(r.lost) return await reply(`💀 *FORCA ENCERRADA!*\nA palavra era *${r.word}*.`)
          await reply(`🔤 ${r.masked}\n❤️ Vidas: ${r.lives}\n❌ Erros: ${r.wrong.join(', ')||'nenhum'}`)

        } else if(['palavra'].includes(cmd)){
          const guess=args.join(' ')
          if(!guess) return await reply(`Uso: *${prefix}palavra resposta*`)
          const r=await hangmanWord(chat,guess)
          if(r.won) return await reply(`🎉 *ACERTOU!* A palavra era *${r.word}*.`)
          if(r.lost) return await reply(`💀 Acabaram as vidas. A palavra era *${r.word}*.`)
          await reply(`❌ Não é essa.\n${r.masked}\n❤️ Vidas: ${r.lives}`)

        } else if(['quiz'].includes(cmd)){
          const q=await startQuiz(chat)
          if(q.already){
            let text=`🧠 *JÁ EXISTE UM QUIZ ATIVO*\n\n${q.q}\n\n`
            q.a.forEach((a,i)=>text+=`*${i+1}.* ${a}\n`)
            text+=`\n⏳ Expira em cerca de *${q.remaining}s*.\nResponda apenas com *1, 2, 3 ou 4*.`
            return await reply(text)
          }
          await progressDailyMission(sender,'game')
          let text=`🧠 *QUIZ DO ALPHA BOT*\n\n${q.q}\n\n`
          q.a.forEach((a,i)=>text+=`*${i+1}.* ${a}\n`)
          text+=`\n⏳ Você tem *2 minutos*.\nResponda apenas com *1, 2, 3 ou 4*.`
          await reply(text)

        } else if(['resposta'].includes(cmd)){
          const n=parseInt(args[0]||'0',10)
          const r=await answerQuiz(chat,sender,n)
          if(r.correct){
            if(isGroup) await progressGroupMission(chat,sender,'quiz')
            await reply(`✅ *Acertou!* +R$ ${fmt(r.reward)}\nResposta: *${r.correctText}*`)
          }
          else await reply(`❌ Errou. A resposta correta era *${r.correctAnswer}. ${r.correctText}*.`)

        } else if(['numero','adivinhar'].includes(cmd)){
          const r=await startNumberGame(chat)
          if(r.already) return await reply(`🔢 Já existe um número secreto ativo de 1 a 100.\nUse *${prefix}chute 50*.`)
          await progressDailyMission(sender,'game')
          await reply(`🔢 *ADIVINHE O NÚMERO*\n\nEscolhi um número de *1 a 100*.\nVocês têm até *10 tentativas*.\nUse *${prefix}chute 50*.`)

        } else if(['chute'].includes(cmd)){
          const guess=parseInt(args[0]||'0',10)
          const r=await guessNumber(chat,sender,guess)
          if(r.won) return await reply(`🎉 *ACERTOU!* O número era *${r.number}*.\nTentativas: ${r.attempts}\n💰 Prêmio: R$ ${fmt(r.reward)}`)
          if(r.lost) return await reply(`💀 Acabaram as tentativas. O número era *${r.number}*.`)
          await reply(`❌ Não foi dessa vez. O número é *${r.hint}* que ${guess}.\nTentativas restantes: ${r.left}`)

        } else if(['invocarpet','altarpets','altarpets','lojalendaria'].includes(cmd)){
          const inv=await getInventory(sender)
          const materialQty=id=>Number(inv.find(i=>i.item_id===id)?.quantity||0)
          const choice=Number(args[0]||0)

          if(!choice){
            let text='🔮 *ALTAR DE PETS LENDÁRIOS*\n\n'
            LEGENDARY_PET_SUMMONS.forEach((a,i)=>{
              text+=`*${i+1}.* Raid Lv.${a.raidLevel} — *${a.materialName}*\n`
              text+=`   Você possui: *${materialQty(a.materialId)}/100*\n`
              a.pets.forEach(p=>{ text+=`   • ${p.name} — *${p.chance}%*\n` })
              text+='\n'
            })
            text+='💠 Cada invocação custa *100 materiais* e sempre entrega *1 pet lendário*.\n\n👉 Use *!invocarpet N*. Ex.: *!invocarpet 2*.'
            return await reply(text)
          }

          const altar=LEGENDARY_PET_SUMMONS[choice-1]
          if(!altar) return await reply(`🔮 Escolha um altar de *1 a ${LEGENDARY_PET_SUMMONS.length}*.`)
          const owned=materialQty(altar.materialId)
          let text=`🔮 *ALTAR — RAID Lv.${altar.raidLevel}*\n\n🧩 Material: *${altar.materialName}*\n📦 Você possui: *${owned}/100*\n💠 Custo: *100*\n\n🎲 *CHANCES*\n`
          altar.pets.forEach(p=>{ text+=`• ${p.name} — *${p.chance}%*\n` })
          if(owned<100) return await reply(text+`\n❌ Faltam *${100-owned}* materiais para invocar.`)
          setQuickFlow(chat,sender,'legendary_pet_summon_confirm',{materialId:altar.materialId},90000)
          return await reply(text+'\n1️⃣ *Invocar agora*\n2️⃣ Cancelar')

        } else if(['chaveraid'].includes(cmd)){
          const level=Number(args[0]||0)
          const cfg=getRaidCatalog().find(r=>r.level===level)
          if(!cfg) return await reply('🔑 Níveis de chave disponíveis: *10, 15, 20, 25, 30, 40 e 50*.\nEx.: *!chaveraid 20*')
          const p=await getProfile(sender)
          if(Number(p?.level||1)<level) return await reply(`🔒 Você precisa estar no *nível ${level}* para comprar essa chave.`)
          const r=await buyItem(sender,cfg.keyId,1)
          await reply(`🔑 *CHAVE DE RAID COMPRADA!*\n\n⚔️ Raid: *${cfg.name} — Lv.${level}*\n💸 Pago: *R$ ${fmt(r.total)}*\n\nUse *!raid ${level}* para abrir uma sala.`)

        } else if(['raid','raidstatus'].includes(cmd)){
          if(!isGroup) return await reply('⚔️ As Raids funcionam dentro de grupos.')
          let active=await getRaidStatus(chat)
          if(active?.status==='failed' && active.failReason==='round_limit'){
            active.status='active'
            delete active.failReason
            active.expiresAt=Date.now()+10*60*1000
            await db.query(`UPDATE trevo_games SET state=$1::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
              WHERE chat_jid=$2 AND game_type='raid'`,[JSON.stringify(active),chat])
            await reply(`🔄 *RAID REATIVADA*\n\nA luta foi retomada da rodada *${Number(active.round||0)}* com o Boss em *${Number(active.hp||0).toLocaleString('pt-BR')}/${Number(active.maxHp||0).toLocaleString('pt-BR')} HP*.\n\n🔑 Nenhuma nova chave foi cobrada.`)
            runRaidCombat(chat,reply)
            return
          }
          if(active && ['lobby','active'].includes(active.status) && Number(active.expiresAt||0)>Date.now()){
            const players=Object.values(active.players||{})
            let text=`⚔️ *RAID ${active.status==='lobby'?'AGUARDANDO':'EM ANDAMENTO'}*\n\n👹 *${active.name} — Lv.${active.level}*\n❤️ HP: *${Number(active.hp).toLocaleString('pt-BR')}/${Number(active.maxHp).toLocaleString('pt-BR')}*\n⚔️ ATK: *${active.atk}*\n👥 Jogadores: *${players.length}/5*\n`
            if(active.status==='lobby') text+='\n👉 *!entrar* para entrar.\n🚀 Host: *!go* quando houver pelo menos 2.'
            else{
              text+='\n📊 Dano atual:\n'+players.sort((a,b)=>Number(b.damage||0)-Number(a.damage||0)).map(p=>`• ${p.alive?'🟢':'💀'} *${p.name}* — ${Number(p.damage||0).toLocaleString('pt-BR')}`).join('\n')
              runRaidCombat(chat,reply)
            }
            return await reply(text)
          }
          const level=Number(args[0]||0)
          if(!level){
            const raids=getRaidCatalog()
            let text='⚔️ *RAIDS DO ALPHA*\n\n'
            raids.forEach(r=>{text+=`*Lv.${r.level} — ${r.name}*\n❤️ ${r.hp.toLocaleString('pt-BR')} HP • ⚔️ ${r.atk} ATK\n🔑 Chave: R$ ${fmt(r.keyPrice)} • 🧩 ${r.material.name}\n\n`})
            text+='Abra com *!raid NÍVEL*. Ex.: *!raid 20*\nCompre a chave com *!chaveraid NÍVEL*.'
            return await reply(text)
          }
          const r=await createRaid(chat,sender,msg.pushName||'Jogador',level)
          await progressDailyMission(sender,'game')
          await reply(`⚔️ *SALA DE RAID ABERTA!*\n\n👹 *${r.name} — Lv.${r.level}*\n❤️ HP: *${r.maxHp.toLocaleString('pt-BR')}*\n⚔️ ATK: *${r.atk}*\n🔑 A chave só será consumida quando a luta começar.\n👥 Máximo: *5 jogadores* • mínimo: *2*\n⏳ Sala aberta por *5 minutos*.\n\n👉 Seus irmãos podem usar *!entrar*.\n🚀 Depois use *!go*.`)

        } else if(['entrar','entrarraide'].includes(cmd)){
          if(!isGroup) return await reply('⚔️ Entre em uma Raid dentro do grupo.')
          const r=await joinRaid(chat,sender,msg.pushName||'Jogador')
          await reply(r.already?`⚔️ Você já está na Raid *${r.name}*.`:`✅ *ENTROU NA RAID!*\n\n👹 ${r.name} — Lv.${r.level}\n👥 Jogadores: *${Object.keys(r.players||{}).length}/5*\n\nAguarde o host usar *!go*.`)

        } else if(['cancelarraide'].includes(cmd)){
          if(!isGroup) return await reply('⚔️ Use dentro do grupo.')
          await cancelRaid(chat,sender)
          await reply('✅ Raid cancelada. Como a luta não começou, a chave foi preservada.')

        } else if(['go','iniciarraide'].includes(cmd)){
          if(!isGroup) return await reply('⚔️ Use dentro do grupo.')
          const r=await startRaid(chat,sender)
          await reply(`🚨 *RAID INICIADA!*\n\n👹 *${r.name} — Lv.${r.level}*\n❤️ HP: *${r.maxHp.toLocaleString('pt-BR')}*\n⚔️ ATK: *${r.atk}*\n👥 Jogadores: *${Object.keys(r.players||{}).length}*\n\n🔑 Chave consumida.\n⚔️ Combate automático iniciado.\n🧪 Se alguém cair, o Alpha usa uma poção automaticamente; sem cura, o jogador sai da Raid.\n🐾 O pet participa, gasta 1 de energia por rodada e recebe XP se o grupo vencer.\n🏆 Recompensas serão proporcionais à colaboração.`)
          runRaidCombat(chat,reply)

        } else if(['eventoboss','bossevento','superbossevento'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          if(!isGroup) return await reply(`🌘 Use *${prefix}eventoboss* dentro do grupo onde quer controlar o evento.`)
          const action=normalizeItemText(args[0]||'status')
          if(['ativar','on','iniciar','start'].includes(action)){
            const r=await activateBossEvent(chat)
            if(r.already) return await reply(`🌘 *BOSS DE EVENTO JÁ ESTÁ ATIVO*\n\n👹 *${r.name}*\n❤️ HP: *${Number(r.hp).toLocaleString('pt-BR')}/${Number(r.maxHp).toLocaleString('pt-BR')}*\n⚔️ ATK: *${r.atk}*\n\nUse *!boss* para ver e *!atacar* para lutar.`)
            return await reply(`🌘 *BOSS DE EVENTO ATIVADO!*\n\n👹 *${r.name}*\n❤️ HP: *${Number(r.maxHp).toLocaleString('pt-BR')}*\n⚔️ ATK: *${r.atk}*\n\n✨ EXP elevada para jogador\n🐾 EXP elevada para o pet\n🎁 Top 3 recebe caixa garantida\n🏅 Chance de dropar *Insígnia do Eclipse* — raridade *Evento Único*\n\n⚠️ O evento fica ativo até o Boss ser derrotado ou você usar *!eventoboss desativar*.\n⚔️ Todos podem usar *!boss* e *!atacar*.`)
          }
          if(['desativar','off','parar','encerrar','stop'].includes(action)){
            const r=await deactivateBossEvent(chat)
            if(r.already) return await reply('🌘 Não há Boss de Evento ativo neste grupo.')
            return await reply(`✅ *BOSS DE EVENTO ENCERRADO*\n\n👹 ${r.name}\n❤️ Restavam *${Number(r.hp).toLocaleString('pt-BR')}/${Number(r.maxHp).toLocaleString('pt-BR')} HP*.\n\nO Boss normal/semanal volta a funcionar normalmente.`)
          }
          const r=await getBossEventStatus(chat)
          if(!r) return await reply(`🌘 *BOSS DE EVENTO: INATIVO*\n\n⏰ Próximo spawn automático: *sexta às 19:00* (horário de São Paulo).\n\nO comando *${prefix}eventoboss ativar* continua disponível apenas como acionamento manual de emergência.`)
          return await reply(`🌘 *BOSS DE EVENTO: ATIVO*\n\n👹 *${r.name}*\n❤️ HP: *${Number(r.hp).toLocaleString('pt-BR')}/${Number(r.maxHp).toLocaleString('pt-BR')}*\n⚔️ ATK: *${r.atk}*\n\nPara encerrar manualmente: *${prefix}eventoboss desativar*.`)

        } else if(['boss'].includes(cmd)){
          const r=await startBoss(chat)
          if(r.cooldown) return await reply(`⏳ *BOSS COMUM EM COOLDOWN*\n\nO próximo Golem do Alpha poderá aparecer em aproximadamente *${r.remainingMinutes} min*.\n\n👹 O Superboss semanal continua sendo um evento separado, disponível apenas uma vez por fim de semana.`)
          const bossPet=await getPet(sender)
          const bossPetBonus=bossPet?petStatusBonus(bossPet):null
          const petLine=bossPetBonus?`\n🐾 Seu pet: *${bossPet.name}* — ${bossPetBonus.label}\n✨ ${bossPetBonus.text}`:'\n🐾 Você está sem pet. Use *!pets* para ver os companheiros disponíveis.'
          const bossLabel=r.mode==='event'?'BOSS DE EVENTO':(r.mode==='weekly'?'SUPERBOSS SEMANAL':'BOSS COMUM')
          const schedule=r.mode==='weekly'?`\n📅 Sexta 00:00 → sábado 23:59\n⏰ Encerra: *${r.endsLabel}* (São Paulo)`:(r.mode==='event'?'\n🌘 Evento especial ativado manualmente pelo dono.':'')
          if(r.already) return await reply(`👹 *${bossLabel} — ${r.name}*\n❤️ HP: *${Number(r.hp).toLocaleString('pt-BR')}/${Number(r.maxHp).toLocaleString('pt-BR')}*${schedule}${petLine}\n\n⚔️ *${prefix}atacar* leva o pet.\n🛡️ *${prefix}atacar sempet* luta sozinho e preserva a energia dele.`)
          await progressDailyMission(sender,'game')
          const rewardInfo=r.mode==='event'
            ?'✨ *Evento especial:* muita EXP para jogador e pet, caixas por colocação e chance da *Insígnia do Eclipse (Evento Único)*.'
            :(r.mode==='weekly'?'💰 Fundo semanal de *R$ 150.000*, bônus por colocação e drops exclusivos.':'💰 Recompensas comuns proporcionais ao dano. O Superboss volta na próxima sexta-feira.')
          await reply(`👹 *${bossLabel} APARECEU!*\n\n*${r.name}*\n❤️ HP: *${Number(r.hp).toLocaleString('pt-BR')}/${Number(r.maxHp).toLocaleString('pt-BR')}*${schedule}\n${rewardInfo}${petLine}\n\n⚔️ Todos podem usar *${prefix}atacar* para iniciar o combate automático.`)

        } else if(['atacar'].includes(cmd)){
          const usePet=!['sempet','sozinho'].includes(normalizeItemText(args[0]||''))
          const started=await runBossSession(chat,sender,msg.pushName||'Jogador',reply,usePet)
          if(!started) return await reply('⚔️ Você já está em uma sessão automática contra o Boss.')
          await reply(`⚔️ *COMBATE AUTOMÁTICO INICIADO!*\n\n${usePet?'🐾 Pet participando: bônus ativos e *2 de energia por ataque*.':'🛡️ Você foi sem o pet: energia preservada, mas sem os bônus dele.'}\n⏱️ Duração: até *5 minutos*\n🥊 Ataque automático: a cada *10 segundos*\n🧪 Se você cair, o bot tentará usar uma poção automaticamente.\n\nUse *!boss* para acompanhar a vida do Boss.`)

        } else if(['dungeon','masmorra'].includes(cmd)){
          const r=await dungeon(sender)
          if(!r.ok) return await reply(`⏳ Você poderá entrar novamente na dungeon em ${duration(r.remaining)}.`)
          await progressDailyMission(sender,'dungeon')
          if(r.won){
            let text=`🏰 *DUNGEON CONCLUÍDA!*\n\n👹 Inimigo: *${r.monster}*\n❤️ HP restante: ${r.hp}/${r.maxHp}\n💰 Recompensa: R$ ${fmt(r.cash)}\n✨ EXP: +${r.exp}`
            if(r.level.levels>0) text+=`\n⬆️ Você subiu ${r.level.levels} nível(is)!`
            await reply(text)
          }else{
            await reply(`💀 *DERROTA NA DUNGEON*\n\n👹 ${r.monster} venceu.\n❤️ Você se recuperou para ${r.hp}/${r.maxHp}\n✨ Consolação: +${r.exp} EXP`)
          }

        } else if(['roubar','roubo','fazol'].includes(cmd)){
          const targetMention=mentionsOf(msg)[0]
          if(!targetMention) return await reply(`Uso no grupo: *${prefix}roubar @pessoa* ou *${prefix}fazoL @pessoa*`)
          const targetIdentity=await resolvePlayerIdentity(sock,chat,targetMention,msg)
          const target=targetIdentity.jid
          if(!target?.endsWith('@s.whatsapp.net')){
            return await reply('⚠️ Não consegui identificar essa pessoa. Peça para ela enviar qualquer comando e tente novamente.')
          }
          await consolidateUserIdentity(target,targetIdentity.aliases)
          let r
          try{ r=await robPlayer(sender,target) }
          catch(err){
            if(cmd==='fazol' && String(err?.message||'').includes('praticamente sem dinheiro')) return await reply('🍺 *É SÓ PRA TOMAR UMA CERVEJINHA!* 😂\n\nSó que essa pessoa tá tão quebrada que não paga nem a gelada. Escolhe outra vítima! 🍻',{mentions:[targetMention]})
            throw err
          }
          if(!r.ok) return await reply(cmd==='fazol'?`🍺 A cervejinha vai ter que esperar... tente novamente em ${duration(r.remaining)}.`:`⏳ Você poderá tentar outro roubo em ${duration(r.remaining)}.`)
          if(r.success){
            const successText=cmd==='fazol'
              ? `🍺 *É SÓ PRA ELE TOMAR UMA CERVEJINHA!*\n\n💰 Você roubou *R$ ${fmt(r.amount)}*.\n\n_“Não é roubo não... é só pra tomar uma cervejinha.”_ 😂`
              : `🕵️ *ROUBO BEM-SUCEDIDO!*\n💰 Você roubou *R$ ${fmt(r.amount)}*.`
            await reply(successText,{mentions:[targetMention]})
          } else {
            const failText=cmd==='fazol'
              ? `🚓 *A CERVEJINHA DEU RUIM!* 😂\n💸 Multa: R$ ${fmt(r.fine)}\nDessa vez não deu pra tomar a gelada.`
              : `🚓 *VOCÊ FOI PEGO!*\n💸 Multa: R$ ${fmt(r.fine)}\nTente novamente mais tarde.`
            await reply(failText,{mentions:[targetMention]})
          }

        } else if(['snipe','apagada','apagou'].includes(cmd)){
          if(!isGroup) return await reply('Use este comando dentro de um grupo.')
          let deleted=lastDeletedByChat.get(chat)
          if(!deleted || Date.now()-deleted.deletedAt>SNIPE_TTL_MS){
            try{ deleted=await getLastDeletedSnipe(chat) }catch{}
          }
          if(!deleted || Date.now()-deleted.deletedAt>SNIPE_TTL_MS) return await reply('🕵️ Não tenho nenhuma mensagem apagada recente deste grupo.')

          const who=deleted.pushName ? '*'+deleted.pushName+'*' : '@'+String(deleted.sender||'').split('@')[0]
          const content=[deleted.mediaLabel,deleted.text].filter(Boolean).join(deleted.mediaLabel&&deleted.text?' — ':'') || 'Mensagem sem texto'
          const caption='🕵️ *ÚLTIMA MENSAGEM APAGADA*\n\n👤 '+who+'\n💬 '+content+'\n\n_A memória do !snipe expira em 30 minutos._'
          const mentions=deleted.pushName?[]:[deleted.sender]

          if(deleted.mediaBuffer?.length){
            const media=Buffer.from(deleted.mediaBuffer)
            if(deleted.mediaType==='imageMessage'){
              await sock.sendMessage(chat,{image:media,caption,mentions},{quoted:msg})
            }else if(deleted.mediaType==='videoMessage'){
              await sock.sendMessage(chat,{video:media,mimetype:deleted.mimeType||'video/mp4',caption,mentions},{quoted:msg})
            }else if(deleted.mediaType==='audioMessage'){
              await sock.sendMessage(chat,{audio:media,mimetype:deleted.mimeType||'audio/ogg; codecs=opus',ptt:false},{quoted:msg})
              await reply(caption,{mentions})
            }else if(deleted.mediaType==='stickerMessage'){
              await sock.sendMessage(chat,{sticker:media,mimetype:'image/webp'},{quoted:msg})
              await reply(caption,{mentions})
            }else{
              await reply(caption,{mentions})
            }
          }else{
            await reply(caption+(deleted.mediaLabel?'\n\n⚠️ A mídia era grande demais ou não pôde ser armazenada.':''),{mentions})
          }

        } else if(['termos'].includes(cmd)){
          const price=await getLaunchPrice()
          await reply(
`📄 *TERMOS DO ALPHA BOT — RESUMO*

🎉 *Preço de lançamento:* R$ ${price.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} por grupo / 30 dias
🎁 *Teste:* 3 dias grátis no primeiro uso do grupo

⚠️ *Aviso importante*
O Alpha Bot utiliza integração não oficial com o WhatsApp. Por esse motivo, podem ocorrer desconexões, limitações ou bloqueios do número utilizado pelo bot por decisão da própria plataforma.

Ao contratar o acesso, o responsável pelo grupo declara estar ciente desse risco. O Alpha Bot não garante funcionamento ininterrupto nem pode impedir eventuais restrições aplicadas pelo WhatsApp.

O pagamento refere-se ao acesso às funcionalidades do bot durante o período contratado, enquanto o serviço estiver disponível.

🚫 Spam, automações abusivas ou uso que coloque o bot em risco podem resultar na suspensão do grupo.`
          )

        } else if(['statusgrupo'].includes(cmd)){
          if(!isGroup) return await reply('Este comando funciona dentro de grupos.')
          const lic=await getGroupLicense(chat)
          let text=groupLicenseStatusText(lic)
          if(!lic) text+=`\n\nO teste começa quando alguém usar um comando normal do Alpha Bot pela primeira vez.\nPara contratar direto, use *${prefix}assinar*.`
          else if(lic.plan==='trial') text+='\n🎁 Este grupo está no período de teste grátis.'
          else if(lic.plan!=='permanent') text+=`\n💚 Plano atual: R$ ${Number(await getLaunchPrice()).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} / 30 dias.`
          await reply(text)

        } else if(['assinar','plano','preco'].includes(cmd)){
          if(!isGroup) return await reply('Use este comando dentro do grupo que deseja assinar.')
          const r=await createSubscriptionOrder(chat,sender)
          const price=Number(r.order.amount)
          const paymentLink=await getPaymentLink()
          await reply(
`💚 *ALPHA BOT — ASSINATURA*

🎉 Preço de lançamento: *R$ ${price.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}*
📅 Acesso: *30 dias*
🧾 Pedido: *${r.order.code}*

💳 *PAGAMENTO PELO MERCADO PAGO*
${paymentLink}

Após o pagamento, envie o comprovante ao responsável pelo Alpha Bot junto com o código *${r.order.code}*.

⏳ O pedido fica válido por 24 horas.
📄 Antes de pagar, leia *${prefix}termos*.

_${r.reused?'Este grupo já tinha um pedido pendente; reutilizei o mesmo código.':'Pedido criado para este grupo.'}_`
          )

        } else if(['pedido'].includes(cmd)){
          const code=String(args[0]||'').toUpperCase()
          if(!code) return await reply(`Uso: *${prefix}pedido ALPHA-XXXXXX*`)
          const order=await getSubscriptionOrder(code)
          if(!order) return await reply('❌ Pedido não encontrado.')
          if(!isOwner && order.chat_jid!==chat) return await reply('⛔ Esse pedido pertence a outro grupo.')
          const labels={pending:'PENDENTE',approved:'APROVADO',cancelled:'CANCELADO',expired:'EXPIRADO'}
          await reply(
`🧾 *PEDIDO ${order.code}*

Status: *${labels[order.status]||order.status}*
Valor: *R$ ${Number(order.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}*
Criado em: *${fmtDate(order.created_at)}*
Expira em: *${fmtDate(order.expires_at)}*`
          )

        } else if(['setlinkpagamento','setlink'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const value=args.join(' ').trim()
          if(!value) return await reply(`Uso: *${prefix}setlinkpagamento https://...*`)
          const link=await setPaymentLink(value)
          await reply(`👑 Link de pagamento atualizado:\n${link}`)

        } else if(['pedidos'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const rows=await listPendingSubscriptionOrders(30)
          if(!rows.length) return await reply('🧾 Nenhum pedido pendente.')
          let text='🧾 *PEDIDOS PENDENTES*\n\n'
          rows.forEach((r,i)=>{
            text+=`${i+1}. *${r.code}* — R$ ${Number(r.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}\n   criado: ${fmtDate(r.created_at)}\n`
          })
          text+=`\nPara aprovar: *${prefix}aprovarpedido ALPHA-XXXXXX*`
          await reply(text)

        } else if(['aprovarpedido'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const code=String(args[0]||'').toUpperCase()
          if(!code) return await reply(`Uso: *${prefix}aprovarpedido ALPHA-XXXXXX*`)
          const r=await approveSubscriptionOrder(code,sender)
          await reply(
`✅ *PEDIDO APROVADO*

🧾 ${r.code}
💰 R$ ${Number(r.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
📅 Grupo liberado até: *${fmtDate(r.paid_until)}*`
          )
          try{
            await sock.sendMessage(r.chat_jid,{text:
`💚 *PAGAMENTO CONFIRMADO!*

🧾 Pedido: *${r.code}*
✅ Alpha Bot liberado por mais *30 dias*.
📅 Validade: *${fmtDate(r.paid_until)}*

Obrigado por apoiar o Alpha Bot 🍀`
            })
          }catch(err){
            console.error('[assinatura] não foi possível avisar o grupo',err?.message||err)
          }

        } else if(['cancelarpedido'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const code=String(args[0]||'').toUpperCase()
          if(!code) return await reply(`Uso: *${prefix}cancelarpedido ALPHA-XXXXXX*`)
          const r=await cancelSubscriptionOrder(code)
          await reply(`🚫 Pedido *${r.code}* cancelado.`)

        } else if(['setpreco'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const raw=args[0]
          if(!raw) return await reply(`Uso: *${prefix}setpreco 5*`)
          const value=await setLaunchPrice(raw)
          await reply(`👑 Preço de lançamento atualizado para *R$ ${value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} / 30 dias*.`)

        } else if(['ativargrupo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          if(!isGroup) return await reply('Use este comando dentro do grupo que deseja ativar.')
          const mode=String(args[0]||'30').toLowerCase()
          if(['permanente','vitalicio','vitalício','infinito'].includes(mode)){
            await activateGroupLicense(chat,null,sender,'permanent')
            return await reply('👑 *GRUPO PERMANENTE ATIVADO!*\n♾️ Este grupo agora tem acesso vitalício ao Alpha Bot.\n📅 Validade: *Sem expiração*')
          }
          const days=parseInt(mode,10)
          const lic=await activateGroupLicense(chat,days,sender,'basic')
          await reply(`👑 Grupo ativado por *${days} dias*.\n📅 Validade: *${fmtDate(lic.paid_until)}*`)

        } else if(['bloqueargrupo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          if(!isGroup) return await reply('Use este comando dentro do grupo que deseja bloquear.')
          await blockGroupLicense(chat,sender)
          await reply('🔒 Grupo bloqueado pelo dono.')

        } else if(['gruposativos'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const rows=await listGroupLicenses(50)
          if(!rows.length) return await reply('Nenhum grupo registrado ainda.')
          const named=await Promise.all(rows.map(async r=>{
            try{
              const meta=await sock.groupMetadata(r.chat_jid)
              return {...r,group_name:meta?.subject||'Grupo sem nome'}
            }catch{
              return {...r,group_name:'Grupo registrado'}
            }
          }))
          let text='👑 *GRUPOS REGISTRADOS*\n\n'
          named.forEach((r,i)=>{
            const active=groupLicenseIsActive(r)
            const permanent=String(r.plan||'').toLowerCase()==='permanent'
            const plan=permanent?'Permanente':String(r.plan||'Plano')
            text+=`${i+1}. ${active?'✅':'❌'} *${r.group_name}*\n   Plano: *${plan}*\n   Validade: *${permanent?'Sem expiração':fmtDate(r.paid_until)}*\n\n`
          })
          await reply(text.trim())

        } else if(['reset','resetsaldo','resetxp','resetinventario','resettotal'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')

          let kind=cmd
          if(cmd==='reset') kind=String(args[0]||'').toLowerCase()
          const aliases={
            saldo:'resetsaldo',carteira:'resetsaldo',resetsaldo:'resetsaldo',
            xp:'resetxp',exp:'resetxp',resetxp:'resetxp',
            inventario:'resetinventario','inventário':'resetinventario',resetinventario:'resetinventario',
            total:'resettotal',resettotal:'resettotal'
          }
          kind=aliases[kind]||kind

          if(!['resetsaldo','resetxp','resetinventario','resettotal'].includes(kind)){
            return await reply(
`Uso:
*${prefix}reset saldo [@pessoa]*
*${prefix}reset xp [@pessoa]*
*${prefix}reset inventario [@pessoa]*
*${prefix}reset total [@pessoa]*`
            )
          }

          if(kind==='resettotal'){
            setQuickFlow(chat,sender,'admin_confirm',{action:'resettotal',target:ownerTarget},5*60*1000)
            return await reply(
'⚠️ *RESET TOTAL* apaga saldo, banco, EXP, nível, inventário, equipamentos, vitórias/derrotas, missões, casa, carros e cooldowns do jogador.\n\n1️⃣ Confirmar\n2️⃣ Cancelar',
              {mentions:ownerTarget===sender?[]:[ownerTarget]}
            )
          }

          if(kind==='resetsaldo'){
            const r=await ownerResetBalance(ownerTarget)
            return await reply(`👑 Saldo resetado. Carteira e banco agora estão em *R$ 0*.\nAntes: R$ ${fmt(r.oldCash+r.oldBank)}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})
          }
          if(kind==='resetxp'){
            const r=await ownerResetExp(ownerTarget)
            return await reply(`👑 EXP resetada. Nível *${r.oldLevel} → 1* e EXP *${fmt(r.oldExp)} → 0*.`,{mentions:ownerTarget===sender?[]:[ownerTarget]})
          }
          const r=await ownerResetInventory(ownerTarget)
          return await reply(`👑 Inventário resetado. *${fmt(r.removed)} item(ns)* removidos.`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['set','setsaldo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          if(cmd==='set' && String(args[0]||'').toLowerCase()!=='saldo'){
            return await reply(`Uso: *${prefix}set saldo 5000* ou *${prefix}set saldo @pessoa 5000*`)
          }
          const amountToken=args.find(a=>/^\d[\d.]*$/.test(a))
          if(amountToken===undefined) return await reply(`Uso: *${prefix}setsaldo 5000* ou *${prefix}setsaldo @pessoa 5000*`)
          const amount=parseAmount(amountToken)
          if(!Number.isSafeInteger(amount) || amount<0) return await reply('Valor inválido.')
          const r=await ownerSetBalance(ownerTarget,amount)
          await reply(`👑 Saldo definido: R$ ${fmt(r.oldCash)} → *R$ ${fmt(r.cash)}*\n🏦 Banco mantido: R$ ${fmt(r.bank)}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['addsaldo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const amount=parseAmount(args.find(a=>/^\d[\d.,]*$/.test(a)))
          if(!amount) return await reply(`Uso: *${prefix}addsaldo 50000* ou *${prefix}addsaldo @pessoa 50000*`)
          const p=await ownerAddBalance(ownerTarget,amount)
          await reply(`👑 Saldo adicionado.\n💰 Novo saldo: R$ ${fmt(p.cash)}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['remsaldo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const amount=parseAmount(args.find(a=>/^\d[\d.,]*$/.test(a)))
          if(!amount) return await reply(`Uso: *${prefix}remsaldo 10000* ou *${prefix}remsaldo @pessoa 10000*`)
          const r=await ownerRemoveBalance(ownerTarget,amount)
          await reply(`👑 Saldo removido: R$ ${fmt(r.removed)}\n💰 Saldo atual: R$ ${fmt(r.cash)}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['addexp'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const amount=parseAmount(args.find(a=>/^\d+$/.test(a)))
          if(!amount) return await reply(`Uso: *${prefix}addexp 500* ou *${prefix}addexp @pessoa 500*`)
          const r=await ownerAddExp(ownerTarget,amount)
          await reply(`👑 EXP adicionada: +${fmt(amount)}\n⭐ Nível: ${r.level}\n✨ EXP atual: ${r.exp}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['setnivel'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const level=parseInt(args.find(a=>/^\d+$/.test(a))||'0',10)
          if(!level) return await reply(`Uso: *${prefix}setnivel 10* ou *${prefix}setnivel @pessoa 10*`)
          const r=await ownerSetLevel(ownerTarget,level)
          await reply(`👑 Nível alterado: ${r.oldLevel} → ${r.level}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['curar'].includes(cmd)){
          const items=await getInventory(sender)
          const potions=items.filter(i=>i.category==='consumable' && ['pocao_p','pocao_m','pocao_g','elixir_supremo'].includes(i.item_id))

          if(!potions.length){
            return await reply(`🧪 Você não possui nenhuma poção no inventário.\nCompre uma em *${prefix}loja* para recuperar HP.`)
          }

          const profile=await getCombatProfile(sender)
          if(Number(profile.hp)>=Number(profile.max_hp)){
            return await reply(`❤️ Seu HP já está cheio: *${profile.hp}/${profile.max_hp}*.`)
          }

          const requested=args.join(' ').trim()
          let potion=null
          if(requested){
            potion=resolveOwnedItem(potions,requested,['consumable'])
            if(!potion) return await reply(`❌ Não encontrei essa poção no seu inventário.\nUse *${prefix}curar* para escolher uma.`)
          }

          if(!potion){
            if(potions.length===1){
              potion=potions[0]
            }else{
              setQuickFlow(chat,sender,'use_select',{items:potions.map(i=>i.item_id)},90000)
              let text=`🧪 *QUAL POÇÃO QUER USAR PARA SE CURAR?*\n\n❤️ HP atual: *${profile.hp}/${profile.max_hp}*\n\n`
              potions.forEach((i,idx)=>text+=`*${idx+1}.* ${i.name} ×${i.quantity}\n`)
              text+='\n👉 Responda apenas com o número.\n0️⃣ Cancelar'
              return await reply(text)
            }
          }

          const r=await usePotion(sender,potion.item_id)
          await reply(`🧪 *${r.name} usada!*\n❤️ +${r.healed} HP\nHP atual: *${r.hp}/${r.maxHp}*\n📦 1 poção consumida do inventário.`)

        } else if(['daritem'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const itemArg=args.find(a=>SHOP_IDS.includes(a.toLowerCase()))
          const qtyArg=args.find(a=>/^\d+$/.test(a))
          const qty=parseInt(qtyArg||'1',10)
          if(!itemArg) return await reply(`Uso: *${prefix}daritem espada_ferro 1* ou *${prefix}daritem @pessoa espada_ferro 1*`)
          const r=await ownerGrantItem(ownerTarget,itemArg.toLowerCase(),qty)
          await reply(`👑 Item entregue: ${r.item.name} ×${r.qty}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['evento','evento2x','bonus2x'].includes(cmd)){
          const event=await getDoubleRewardEvent()
          if(!event.active){
            return await reply('⏱️ *EVENTO 2X*\n\nNenhum evento de bônus está ativo agora.')
          }
          const remaining=Math.max(1,Math.ceil(Number(event.remainingMs||0)/1000))
          await reply(`🔥 *EVENTO 2X ATIVO!*\n\n💰 Dinheiro de recompensas: *x${event.moneyMultiplier}*\n✨ XP: *x${event.xpMultiplier}*\n⏱️ Tempo restante: *${duration(remaining)}*\n\n✅ O multiplicador acima é lido diretamente do evento ativo no banco.\n🎯 Apostas, transferências, vendas, compras e compensações não são multiplicadas.`)

        } else if(['eventodobro','dobroevento','ativar2x'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          const action=String(args[0]||'').toLowerCase()
          if(['off','desativar','parar','stop'].includes(action)){
            await stopDoubleRewardEvent(sender)
            return await reply('🛑 *EVENTO 2X ENCERRADO*\n\nOs multiplicadores de dinheiro e XP voltaram ao normal.')
          }
          const minutes=args[0] ? parseInt(args[0],10) : 20
          if(!Number.isInteger(minutes)||minutes<1||minutes>180){
            return await reply(`Uso: *${prefix}eventodobro* para 20 minutos ou *${prefix}eventodobro 30*.\nPara encerrar: *${prefix}eventodobro off*.`)
          }
          const event=await startDoubleRewardEvent(minutes,sender)
          await reply(`🔥🔥 *EVENTO 2X ATIVADO!* 🔥🔥\n\n⏱️ Duração: *${minutes} minutos*\n💰 Recompensas em dinheiro: *2x*\n✨ XP: *2x*\n\n🏃 Aproveitem enquanto está ativo!\nUse *${prefix}evento* para consultar o tempo restante.`)

        } else if(['admin','ownermenu','adminmenu','donocomandos'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          await showAdminMainMenu(chat,sender,reply)

        } else if(['comandos','comando','commands','cmds'].includes(cmd)){
          await showCommandsMainMenu(chat,sender,reply)

        } else if(['menu','help','ajuda'].includes(cmd)){
          await showMainMenu(chat,sender,reply)
        } else {
          const UNKNOWN_COMMAND_REPLIES=["🤖 *Esse comando veio de onde, Beta?*\\\nUse *!comandos* antes de inventar moda.","🍀 *Tentativa interessante.* Resultado: absolutamente nada.\\\nUse *!comandos*.","🤖 *Beta tentando desbloquear comando secreto... falhou.*\\\nTenta *!comandos*.","💀 Nem eu sei o que você tentou fazer.\\\nUse *!comandos* e volta preparado.","🧠 Esse comando não passou nem da fase de testes.\\\nConsulta *!comandos*, Beta.","📡 Procurei esse comando em todo o sistema. Nada.\\\nUse *!comandos*.","🤨 Você acabou de criar um comando que nem eu conheço.\\\nVai de *!comandos*.","🚫 Comando clandestino detectado.\\\nOs oficiais estão em *!comandos*.","🎲 Quase desbloqueou um segredo. Quase.\\\nUse *!comandos*.","🤖 Alpha não fala esse dialeto de Beta.\\\nDigite *!comandos*.","🫠 Eu poderia fingir que entendi... mas não.\\\nUse *!comandos*.","🏆 Parabéns: você encontrou exatamente zero comandos.\\\nAgora tenta *!comandos*.","📖 Manual do Beta perdido?\\\n* !comandos* resolve. ","⚠️ Comando imaginário detectado.\\\nPara comandos reais: *!comandos*.","🍀 O Alpha julgou sua tentativa. Veredito: tente *!comandos*."]
          const picked=UNKNOWN_COMMAND_REPLIES[Math.floor(Math.random()*UNKNOWN_COMMAND_REPLIES.length)]
          await reply(picked)
        }
      }catch(err){
        console.error('[mensagem] erro',err)
        try{
          const chat=msg.key.remoteJid
          await sock.sendMessage(chat,{text:`❌ ${err.message || 'Ocorreu um erro.'}`},{quoted:msg})
        }catch{}
      }
    }
  })
}

start().catch(err=>{
  console.error('[fatal]',err)
  process.exit(1)
})
