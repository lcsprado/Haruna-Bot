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
  initDatabase, ensureUser, consolidateUserIdentity, getProfile, getDailyStreak, claimDaily, work,
  deposit, withdraw, transfer, getShop, buyItem, purchaseService, getInventory, sellItem, sellItemsBatch, leaderboard, getPlayerRanks, getProfileAvatar, setProfileAvatar, removeProfileAvatar,
  equipItem, getEquipmentInfo, usePotion, getCombatProfile, battle, combatLeaderboard,
  acquireRuntimeLock, ownerAddBalance, ownerRemoveBalance, ownerAddExp,
  ownerSetBalance, ownerResetBalance, ownerResetExp, ownerResetInventory, ownerResetTotal,
  ownerSetLevel, ownerHeal, ownerGrantItem,
  getGroupLicense, ensureGroupTrial, activateGroupLicense, blockGroupLicense,
  listGroupLicenses, groupLicenseIsActive, getGroupSettings, setGroupSetting,
  getLaunchPrice, setLaunchPrice,
  getPaymentLink, setPaymentLink,
  createSubscriptionOrder, getSubscriptionOrder, listPendingSubscriptionOrders,
  approveSubscriptionOrder, cancelSubscriptionOrder,
  createSupportTicket, getSupportTicket, listOpenSupportTickets, answerSupportTicket,
  saveQuickFlow, getStoredQuickFlow, deleteQuickFlow, cleanupQuickFlows,
  saveSnipeMessage, markSnipeDeleted, getLastDeletedSnipe, cleanupSnipeMessages,
  openLuckyBox, openLuckyBoxes, openLootBoxes, dungeon, robPlayer,
  initCommunityPack, getCommunitySettings, setCommunitySetting, setGroupRules,
  addGroupWarning, getGroupWarnings, clearGroupWarnings,
  adoptPet, getPet, petAction, petLeaderboard,
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
  startBoss, attackBoss
} from './games.js'
import {
  initProgression, HOUSES, CARS,
  getDailyMissions, progressDailyMission, claimDailyMissions,
  getClanForUser, createClan, inviteToClan, acceptClanInvite, transferClanLeadership,
  kickClanMember, leaveClan, donateClan, listClans,
  getHome, buyHouse, getGarage, buyCar, driveUber,
  getPatrimony, patrimonyLeaderboard
} from './progression.js'
import { toStickerBuffer } from './sticker.js'
import { renderProfileCard } from './profile-card.js'
import { footballToday, brazilStandings, teamSummary, formatFixtures, formatTeamFixture } from './football.js'

const logger=pino({level:process.env.LOG_LEVEL || 'info'})
const prefix=process.env.PREFIX || '!'
const pairingNumber=(process.env.PAIRING_NUMBER || '').replace(/\D/g,'')
const sessionId=process.env.SESSION_ID || 'default'
const ownerJid=process.env.OWNER_JID || ''

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
const quickFlowKey=(chat,sender)=>`${chat}|${sender}`
function setQuickFlow(chat,sender,stage,data={},ttlMs=90000){
  const key=quickFlowKey(chat,sender)
  const flow={stage,data,expiresAt:Date.now()+ttlMs}
  quickGameFlows.set(key,flow)
  saveQuickFlow(key,chat,sender,stage,data,flow.expiresAt)
    .catch(err=>console.error('[flow] falha ao persistir menu',err?.message||err))
}
function getQuickFlow(chat,sender){
  const key=quickFlowKey(chat,sender)
  const flow=quickGameFlows.get(key)
  if(!flow) return null
  if(flow.expiresAt<=Date.now()){
    quickGameFlows.delete(key)
    deleteQuickFlow(key).catch(()=>{})
    return null
  }
  return flow
}
async function recoverQuickFlow(chat,sender){
  const key=quickFlowKey(chat,sender)
  const stored=await getStoredQuickFlow(key)
  if(!stored) return null
  quickGameFlows.set(key,stored)
  return stored
}
function clearQuickFlow(chat,sender){
  const key=quickFlowKey(chat,sender)
  quickGameFlows.delete(key)
  deleteQuickFlow(key).catch(err=>console.error('[flow] falha ao limpar menu persistido',err?.message||err))
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

0️⃣ Sair

_Responda apenas com o número._`
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

function luckyBoxSummary(r){
  let text=`🎁 *CAIXAS — RESULTADO*\n\n📦 Caixas abertas: *${r.opened}*\n`
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
  const [p,clan,home,cars,pat,streak,ranks]=await Promise.all([
    getCombatProfile(jid),getClanForUser(jid),getHome(jid),getGarage(jid),
    getPatrimony(jid),getDailyStreak(jid),getPlayerRanks(jid)
  ])
  if(!p) throw new Error('Perfil não encontrado.')

  let avatar=null
  const customAvatar=await getProfileAvatar(jid)
  if(customAvatar?.buffer?.length){
    avatar=customAvatar.buffer
  }else{
    const photoCandidates=[
      ...identityAliases.filter(value=>value?.endsWith('@lid')),
      jid,
      ...identityAliases.filter(value=>!value?.endsWith('@lid'))
    ].filter((value,index,list)=>value && list.indexOf(value)===index)
    for(const candidate of photoCandidates){
      try{
        const photo=await Promise.race([
          sock.profilePictureUrl(candidate,'image'),
          new Promise(resolve=>setTimeout(()=>resolve(null),2500))
        ])
        if(!photo) continue
        const res=await fetch(photo,{signal:AbortSignal.timeout(5000)})
        if(res.ok){
          avatar=Buffer.from(await res.arrayBuffer())
          break
        }
      }catch{}
    }
  }

  const wins=Number(p.win||0),loss=Number(p.loss||0)
  const title=alphaTitle(p,pat.total)
  const badge=founderBadge(p)
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

  const card=await renderProfileCard({
    name:p.push_name||'Jogador',
    title,
    badge,
    avatar,
    level:Number(p.level||1),
    exp:Number(p.exp||0),
    hp:Number(p.hp||0),
    maxHp:Number(p.max_hp||0),
    atk:Number(p.effective_atk||0),
    def:Number(p.effective_def||0),
    spd:Number(p.spd||0),
    wins,
    losses:loss,
    combatRank:Number(ranks.combatRank||0),
    economyRank:Number(ranks.economyRank||0),
    players:Number(ranks.players||0),
    balance:Number(p.cash||0)+Number(p.bank||0),
    patrimony:Number(pat.total||0),
    streak:Number(streak.streak||0),
    bestStreak:Number(streak.bestStreak||0),
    weapon:p.weapon_name||'Sem arma',
    armor:p.armor_name||'Sem armadura',
    clan:clan?.name||'Sem clã',
    home:home?.name||'Nenhuma',
    cars:Array.isArray(cars)?cars.length:0,
    pet:'Em breve',
    achievements
  })

  await sock.sendMessage(chat,{
    image:card,
    caption:`👤 *${p.push_name||'Jogador'}* • ${title}\n🍀 *ALPHA BOT* — digite *!perfil* para gerar o seu.`
  },{quoted:msg})
}
function dailyResultText(r){
  let text=`🔥 *DAILY ALPHA*\n\n💰 +R$ ${fmt(r.totalCash)}\n🔥 Sequência: *${r.streak} dia${r.streak===1?'':'s'}*\n🏅 Recorde: *${r.bestStreak} dia${r.bestStreak===1?'':'s'}*`
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
  'pocao_p','pocao_m','pocao_g','elixir_supremo',
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
  legendary:['🟠','Lendário']
}

function rarityLabel(rarity){
  const [icon,label]=RARITY_META[rarity]||['⚪',String(rarity||'Comum')]
  return `${icon} ${label}`
}

function shopCategoryLabel(category){
  if(category==='consumable') return '🧪 POÇÕES'
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

1️⃣ 🧪 Poções
2️⃣ ⚔️ Armas
3️⃣ 🛡️ Armaduras
4️⃣ 🎁 Caixas
5️⃣ 🎭 Diversão

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
      '2️⃣ 🧪 Poções — '+potions.reduce((a,i)=>a+Number(i.quantity),0)+' un.\n'+
      '3️⃣ 🎁 Caixas — '+boxes.reduce((a,i)=>a+Number(i.quantity),0)+' un.\n'+
      '4️⃣ 📦 Outros — '+others.length+' tipos\n'+
      '5️⃣ 💰 Vender itens\n\n'+
      '0️⃣ Sair'
    )
  }

  async function showEquipmentMenu(chat,sender,reply){
    const [items,p]=await Promise.all([getInventory(sender),getCombatProfile(sender)])
    const equipables=items.filter(i=>['weapon','armor'].includes(i.category))
    if(!equipables.length){
      clearQuickFlow(chat,sender)
      await reply('⚙️ Você não possui arma ou armadura para equipar.')
      return
    }
    setQuickFlow(chat,sender,'equip_select',{items:equipables.map(i=>i.item_id)},5*60*1000)
    let text='⚙️ *EQUIPAMENTOS*\n\n'
    text+='🗡️ Arma atual: *'+p.weapon_name+'*'+(p.weapon_atk?' +'+p.weapon_atk+' ATK':'')+'\n'
    text+='🛡️ Armadura atual: *'+p.armor_name+'*'+(p.armor_def?' +'+p.armor_def+' DEF':'')+'\n\n'
    equipables.forEach((i,idx)=>{
      const info=getEquipmentInfo(i.item_id)
      const stat=i.category==='weapon' ? '+'+Number(info?.atk||0)+' ATK' : '+'+Number(info?.def||0)+' DEF'
      const active=(p.weapon_id===i.item_id || p.armor_id===i.item_id) ? ' ✅ *ATIVO*' : ''
      text+='*'+(idx+1)+'.* '+rarityLabel(i.rarity)+' — *'+i.name+'* ×'+i.quantity+'\n   '+stat+active+'\n'
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
  async function handleQuickGameFlow({chat,sender,body,reply,msg,isOwner=false}){
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

    const mainMenu=async()=>{
      setQuickFlow(chat,sender,'nav_main',{},90000)
      await reply(
`🍀 *ALPHA BOT — MENU PRINCIPAL*

1️⃣ 👤 Meu perfil
2️⃣ 💰 Economia
3️⃣ 🛒 Itens e inventário
4️⃣ ⚔️ RPG
5️⃣ 🎮 Minigames
6️⃣ 📋 Progressão
7️⃣ 🏴 Clãs
8️⃣ 💚 Grupo / assinatura
9️⃣ 🆘 Falar com suporte
📚 Catálogo completo: *!comandos*

✨ *Extra rápido:* responda uma foto ou vídeo com *!sticker*.
🖼️ *Seu card:* use *!setfoto* numa foto para personalizar o *!perfil*.

👉 *Responda apenas com o número.*

0️⃣ Sair`
      )
    }

    const commandPages={
      '1':`👤 *PERFIL, CONTA & SOCIAL*

*!perfil* — gera seu card
*!perfil @pessoa* — vê o card de outra pessoa
*!setfoto* — define foto personalizada do card
*!removerfoto* — volta à foto do WhatsApp
*!daily* — coleta a recompensa diária
*!streak* — mostra sua sequência
*!casar @pessoa* — envia pedido de casamento
*!aceitarcasamento @pessoa* — aceita o pedido
*!casal* — mostra seu relacionamento
*!divorciar* — encerra o relacionamento
*!conquistas* — badges e objetivos desbloqueados
*!ping* — verifica se o Alpha está online

9️⃣ Voltar • 0️⃣ Fechar`,
      '2':`💰 *ECONOMIA & DIVERSÃO*

*!economia* — abre o menu de economia
*!saldo* — carteira, banco e total
*!trabalhar* — trabalha para ganhar dinheiro
*!uber* — faz uma corrida usando seu melhor carro
*!depositar valor* — deposita no banco
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

9️⃣ Voltar • 0️⃣ Fechar`,
      '3':`🛒 *LOJA, INVENTÁRIO & MERCADO*

*!itens* — abre o menu de itens
*!loja* — abre a loja
*!comprar item quantidade* — compra da loja
*!inventario* — abre seu inventário
*!vender* — vende itens ao sistema
*!equipar* — equipa arma ou armadura
*!usar* — usa um consumível

🏪 *Mercado entre jogadores*
*!mercado* — lista anúncios
*!anunciar ITEM QTD PREÇO* — cria anúncio
*!comprarmercado ID* — compra um anúncio
*!cancelarvenda ID* — cancela seu anúncio

9️⃣ Voltar • 0️⃣ Fechar`,
      '4':`⚔️ *RPG, COMBATE & PETS*

*!rpg* — abre o menu de RPG
*!status* — mostra seus atributos
*!batalhar @pessoa* — desafia outro jogador
*!dungeon* — entra em uma dungeon
*!roubar @pessoa* / *!fazoL @pessoa* — tenta roubar
*!rankingrpg* — ranking de combate

🐾 *Pets*
*!adotar* — lista os 15 pets, preços e níveis\n*!adotar cachorro Nome* — adota ou troca seu pet
*!meupet* — mostra seu pet
*!alimentar* — alimenta
*!banho* — dá banho
*!passear* — passeia
*!treinarpet* — treina
*!aventurapet* — manda para aventura
*!rankpet* — ranking de pets
*!duelopet @pessoa* — duelo entre pets

9️⃣ Voltar • 0️⃣ Fechar`,
      '5':`🎮 *MINIGAMES*

*!games* / *!minigames* — menu de jogos
*!roleta valor cor* — roleta
*!cara valor* / *!coroa valor* — cara ou coroa
*!ppt pedra|papel|tesoura* — contra o Alpha
*!ppt @pessoa 5000 pedra* — desafia jogador valendo dinheiro
*!aceitarppt pedra* — aceita desafio de PPT
*!roletagrupo 5000 vermelho* — abre roleta coletiva
*!entrarroleta 5000 preto* — entra na roleta coletiva
*!girarroleta* — criador gira a roleta
*!torneio 5000* — cria torneio com aposta
*!entrartorneio* — entra no torneio
*!iniciartorneio* — criador inicia
*!forca* — inicia a forca
*!letra a* — tenta uma letra
*!palavra resposta* — tenta a palavra
*!quiz* — inicia quiz
*!resposta 1* — responde o quiz
*!numero* — adivinhe o número
*!chute 50* — dá um palpite
*!boss* — inicia/mostra o boss
*!atacar* — ataca o boss

9️⃣ Voltar • 0️⃣ Fechar`,
      '6':`📋 *PROGRESSÃO & PATRIMÔNIO*

*!progressao* — menu de progressão
*!missoes* — missões diárias
*!resgatarmissoes* — coleta recompensas
*!casas* — lista imóveis
*!comprarcasa número* — compra imóvel
*!minhacasa* — mostra sua casa
*!carros* — concessionária
*!comprarcarro número* — compra carro
*!garagem* — mostra seus carros
*!patrimonio* — patrimônio total
*!rankingpatrimonio* — ranking de patrimônio

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
*!promover @pessoa* — promove a ADM
*!rebaixar @pessoa* — remove ADM

⚙️ No *!configgrupo*: Anti-link, Anti-palavrão, Anti-delete, Antiflood, Boas-vindas e módulos do Alpha.

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
        await mainMenu()
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
        await reply(
`👹 *${r.name}*

❤️ ${r.hp}/${r.maxHp}

1️⃣ Atacar
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
        await reply(
`👹 *${r.name}*

❤️ ${r.hp}/${r.maxHp}

1️⃣ Atacar
0️⃣ Sair do modo rápido

_Enquanto estiver neste modo, mande apenas 1 para atacar._`
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
        await reply('👹 Mande *1* para atacar ou *0* para sair.')
        return true
      }
      const r=await attackBoss(chat,sender,msg.pushName||'Jogador')
      if(r.cooldown){
        await reply(`⏳ Aguarde *${r.remaining}s* para atacar novamente.`)
        return true
      }
      if(r.dead){
        await afterGame('boss',{},
`💥 *BOSS DERROTADO!*
Dano final: ${r.damage}
👥 Participantes: ${r.players}
💰 Cada participante recebeu R$ ${fmt(r.rewardEach)}`
        )
      }else{
        await reply(`⚔️ Você causou *${r.damage}* de dano!\n👹 Boss: ❤️ ${r.hp}/${r.maxHp}\n\nMande *1* para atacar novamente.`)
      }
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
4️⃣ Usar poção
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
          await reply(`💼 Você trabalhou como *${r.job}* e ganhou *R$ ${fmt(r.amount)}*.`)
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
        const p=await getProfile(sender)
        amount=flow.stage==='deposit_amount'
          ? Math.max(0,Number(p.cash))
          : Number(p.bank)
      }
      if(!amount || amount<1){
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
          await reply('🧪 Você não possui poções utilizáveis.')
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
        await reply('🛒 *ITENS E INVENTÁRIO*\n\n1️⃣ Loja\n2️⃣ Inventário\n3️⃣ Equipar\n4️⃣ Usar poção\n5️⃣ Abrir caixas\n\n0️⃣ Sair')
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
          await reply('🧪 Você não possui poções.')
          return true
        }
        setQuickFlow(chat,sender,'use_select',{items:usable.map(i=>i.item_id)},90000)
        let text='🧪 *POÇÕES*\n\n'
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
      if(!['1','2','3','4'].includes(input)){
        await reply('🍀 Escolha *1, 2, 3, 4 ou 5*.')
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
      const r=await usePotion(sender,flow.data.itemId)
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

Você vai abrir *${stock} Caixa(s) da Sorte* de uma vez.

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
      await reply('⚔️ Escolha de *1 a 5*.')
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
      setWhatsAppHealth('open')
      console.log('[WhatsApp] ALPHA BOT CONECTADO')
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
      setTimeout(()=>start().catch(err=>{
        console.error('[WhatsApp] falha na reconexão',err)
      }),3000)
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

          await handleQuickGameFlow({chat,sender,body,reply,msg,isOwner})
          continue
        }

        await ensureUser(sender,msg.pushName || '')
        const [rawCmd,...args]=body.slice(prefix.length).trim().split(/\s+/)
        const cmd=(rawCmd||'').toLowerCase()
        const ownerTarget=mentionsOf(msg)[0] || sender

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
          const ECONOMY_CMDS=new Set(['economia','eco','saldo','balance','bal','daily','diario','streak','sequencia','sequência','trabalhar','work','trampo','uber','depositar','deposit','dep','sacar','withdraw','saque','pix','transferir','transfer','ranking','rank','top','loja','shop','comprar','buy','vender','sell','piada','joke','horoscopo','horóscopo'])
          const RPG_CMDS=new Set(['perfil','profile','fazol','fazol','setfoto','fotoperfil','avatar','removerfoto','resetfoto','fotowpp','rpg','status','batalhar','batalha','battle','duelo','rankingrpg','rankrpg','toprpg','dungeon','masmorra','roubar','roubo'])
          const GAME_CMDS=new Set(['games','jogos','minigames','minigame','roleta','cara','coroa','ppt','forca','letra','palavra','quiz','resposta','numero','adivinhar','chute','boss','atacar'])
          const PROGRESS_CMDS=new Set(['progressao','progressão','progresso','missoes','missões','missions','resgatarmissoes','resgatarmissao','claimmissions','cla','clã','clacofre','claajuda','clãajuda','criarcla','criarclã','claconvidar','clãconvidar','convidarcla','claaceitar','clãaceitar','aceitarcla','clapromover','clãpromover','claexpulsar','clãexpulsar','cladoar','clãdoar','doarcla','saircla','sairclã','clas','clãs','rankingclas','topclas','casas','imoveis','imóveis','comprarcasa','minhacasa','casa','carros','concessionaria','concessionária','comprarcarro','garagem','meuscarros','patrimonio','patrimônio','rankingpatrimonio','rankingpatrimônio','toppatrimonio'])
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

        } else if(['adotar','meupet','alimentar','banho','passear','treinarpet','aventurapet','rankpet','duelopet'].includes(cmd)){
          try{
            if(cmd==='adotar'){
              if(!args[0]) return await reply(`🐾 *ADOÇÃO DE PETS*\n\n🐶 Cachorro — Nv.1 • R$ 5.000\n🐱 Gato — Nv.2 • R$ 8.000\n🐰 Coelho — Nv.3 • R$ 12.000\n🦜 Papagaio — Nv.4 • R$ 18.000\n🐹 Hamster — Nv.5 • R$ 25.000\n🐢 Tartaruga — Nv.6 • R$ 35.000\n🦉 Coruja — Nv.7 • R$ 50.000\n🦊 Raposa — Nv.8 • R$ 70.000\n🐺 Lobo — Nv.10 • R$ 100.000\n🦅 Águia — Nv.12 • R$ 150.000\n🐼 Panda — Nv.14 • R$ 225.000\n🐯 Tigre — Nv.17 • R$ 350.000\n🦁 Leão — Nv.20 • R$ 500.000\n🦄 Unicórnio — Nv.25 • R$ 750.000\n🐉 Dragão — Nv.30 • R$ 1.000.000\n\n🔄 Se já tiver um pet, a troca custa mais *R$ 25.000*. O novo pet começa do zero.\n\nEx.: *!adotar cachorro Rex*`)
              const pet=await adoptPet(sender,args[0],args.slice(1).join(' ')||msg.pushName||'Alpha')
              return await reply(`🐾 ${pet.replaced?'PET TROCADO!':'PET ADOTADO!'}\n\nVocê agora tem *${pet.name}*, um(a) *${pet.species}*.\n💰 Total pago: *R$ ${fmt(pet.fee)}*${pet.changeFee?`\n🔄 Inclui R$ ${fmt(pet.changeFee)} de taxa de troca.`:''}\n\nUse *!meupet* para cuidar dele.`)
            }
            if(cmd==='duelopet'){
              const targetRaw=mentionsOf(msg)[0]; if(!targetRaw) return await reply('Uso: *!duelopet @pessoa*')
              const target=await resolvePlayerJid(sock,chat,targetRaw,msg)
              const r=await petDuel(sender,target)
              return await reply(`🐾⚔️ *DUELO DE PETS*\n\n🏆 ${r.winner.name} venceu ${r.loser.name}!\n+25 XP para o vencedor • +10 XP para o desafiante derrotado.`,{mentions:[targetRaw]})
            }
            if(cmd==='rankpet'){
              const rows=await petLeaderboard(10)
              return await reply('🏆 *RANKING DE PETS*\n\n'+rows.map((p,i)=>`${i+1}º ${p.name} — Nv.${p.level} • ⚔️ ${p.power} (${p.push_name||'Jogador'})`).join('\n'))
            }
            if(cmd==='meupet'){
              const p=await getPet(sender); if(!p) return await reply('🐾 Você ainda não tem pet. Use *!adotar cachorro Nome*.')
              return await reply(`🐾 *${p.name.toUpperCase()}*\n${p.species} • Nível ${p.level} • XP ${p.xp}\n⚔️ Poder: ${p.power}\n🍖 Fome: ${p.hunger}/100\n🧼 Higiene: ${p.hygiene}/100\n⚡ Energia: ${p.energy}/100\n🏆 ${p.wins}V / ${p.losses}D`)
            }
            const action={alimentar:'alimentar',banho:'banho',passear:'passear',treinarpet:'treinar',aventurapet:'aventura'}[cmd]
            const p=await petAction(sender,action)
            await reply(`🐾 *${p.name}* completou a ação! +XP\nNível ${p.level} • XP ${p.xp} • Poder ${p.power}\n🍖 ${p.hunger}/100 • 🧼 ${p.hygiene}/100 • ⚡ ${p.energy}/100`)
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

        } else if(['mercado','anunciar','comprarmercado','cancelarvenda'].includes(cmd)){
          try{
            if(cmd==='mercado'){
              const rows=await listMarket(15)
              if(!rows.length) return await reply('🏪 O mercado está vazio.')
              return await reply('🏪 *MERCADO ENTRE JOGADORES*\n\n'+rows.map(x=>`#${x.id} • ${x.name} ×${x.quantity} — R$ ${Number(x.price).toLocaleString('pt-BR')}\n👤 ${x.seller_name||'Jogador'}`).join('\n\n')+`\n\nComprar: *!comprarmercado ID*`)
            }
            if(cmd==='anunciar'){
              const [itemId,qtyRaw,priceRaw]=args
              if(!itemId||!qtyRaw||!priceRaw) return await reply('*Uso:* !anunciar espada_ferro 1 10000')
              const x=await createMarketListing(sender,itemId,Number(qtyRaw),Number(priceRaw))
              return await reply(`🏪 Anúncio #${x.id} criado por *R$ ${Number(x.price).toLocaleString('pt-BR')}*.`)
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
          await reply(text,{mentions:[targetMention]})

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
            console.error('[perfil] erro ao gerar perfil',profileTarget,err)
            await reply('⚠️ Não consegui gerar esse perfil agora. Tente novamente em alguns segundos.')
          }

        } else if(['setfoto','fotoperfil','avatar'].includes(cmd)){
          const media=stickerMediaOf(msg)
          if(!media || media.type!=='imageMessage'){
            return await reply(
`🖼️ *FOTO DO CARD*

Envie uma foto com a legenda *${prefix}setfoto*
ou responda uma foto com *${prefix}setfoto*.

Essa foto será usada só no seu card do Alpha e não altera seu WhatsApp.`
            )
          }
          try{
            const image=await downloadMediaMessage(media.raw,'buffer',{},{
              logger,
              reuploadRequest:sock.updateMediaMessage
            })
            if(!image?.length) throw new Error('Não consegui baixar a foto.')
            await setProfileAvatar(sender,Buffer.from(image),'image/jpeg')
            await reply(`✅ Foto personalizada salva!\nUse *${prefix}perfil* para ver o card.`)
          }catch(err){
            console.error('[perfil] erro ao salvar foto',err)
            await reply('❌ Não consegui salvar essa foto. Tente outra imagem menor.')
          }

        } else if(['removerfoto','resetfoto','fotowpp'].includes(cmd)){
          const removed=await removeProfileAvatar(sender)
          await reply(removed
            ? `✅ Foto personalizada removida. Agora o *${prefix}perfil* volta a usar sua foto do WhatsApp.`
            : 'ℹ️ Você já está usando a foto do WhatsApp no card.')

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

        } else if(['trabalhar','work','trampo'].includes(cmd)){
          const r=await work(sender)
          if(!r.ok) await reply(`⏳ Você já trabalhou. Tente novamente em ${duration(r.remaining)}.`)
          else {
            await progressDailyMission(sender,'work')
            await reply(`💼 Você trabalhou como *${r.job}* e ganhou *R$ ${fmt(r.amount)}*.`)
          }

        } else if(['uber'].includes(cmd)){
          const r=await driveUber(sender)
          if(!r.ok){
            await reply(`🚗 Você já fez uma corrida. Próxima disponível em *${duration(r.remaining)}*.`)
          }else{
            await progressDailyMission(sender,'work')
            let text=`🚗 *CORRIDA CONCLUÍDA!*\n\n🚘 Carro: *${r.car.name}*\n🏷️ Categoria: *${r.category}*\n🛣️ ${r.ride}\n💵 Corrida: *R$ ${fmt(r.fare)}*`
            if(r.tip) text+=`\n💚 Gorjeta: *R$ ${fmt(r.tip)}*`
            text+=`\n💰 Total recebido: *R$ ${fmt(r.total)}*\n\n⏳ Próxima corrida em 25 minutos.`
            await reply(text)
          }

        } else if(['depositar','deposit','dep'].includes(cmd)){
          const amount=parseAmount(args[0])
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
          const amount=parseAmount(args[0])
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

          const r=await usePotion(sender,item.item_id)
          await reply(`🧪 *${r.name} usada!*\n❤️ +${r.healed} HP\nHP atual: ${r.hp}/${r.maxHp}`)

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

🗡️ Arma: ${p.weapon_name}
🥋 Armadura: ${p.armor_name}

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
          text+=`\n🏆 *Vencedor: ${r.winner.name}*\n💰 Prêmio: R$ ${fmt(r.reward)}\n✨ EXP: +40 vencedor / +15 derrotado`
          if(r.winExp.levels>0) text+=`\n⬆️ ${r.winner.name} subiu ${r.winExp.levels} nível(is)!`
          if(r.loseExp.levels>0) text+=`\n⬆️ ${r.loser.name} subiu ${r.loseExp.levels} nível(is)!`
          await progressDailyMission(sender,'battle')
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
🚗 Veículos: R$ ${fmt(p.cars_value)}

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
        } else if(['games','jogos'].includes(cmd)){
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

        } else if(['roleta'].includes(cmd)){
          const sub=(args[0]||'').toLowerCase()
          if(['grupo','galera','multi'].includes(sub)){
            const amount=parseAmount(args[1]); const choice=(args[2]||'').toLowerCase()
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

        } else if(['apostar'].includes(cmd)){
          const amount=parseAmount(args[0]); const choice=(args[1]||'').toLowerCase()
          if(!amount||!choice) return await reply(`Uso: *${prefix}apostar 500 preto*`)
          const player=await resolvePlayerJid(sock,chat,sender,msg)
          await joinGroupRoulette(chat,player,amount,choice)
          await reply(`✅ Você entrou na roleta coletiva com *R$ ${fmt(amount)}* no *${choice}*.`)

        } else if(['girar'].includes(cmd)){
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
            text+=`\n⏳ Expira em cerca de *${q.remaining}s*.\nResponda com *${prefix}resposta 1*, 2, 3 ou 4.`
            return await reply(text)
          }
          await progressDailyMission(sender,'game')
          let text=`🧠 *QUIZ DO ALPHA BOT*\n\n${q.q}\n\n`
          q.a.forEach((a,i)=>text+=`*${i+1}.* ${a}\n`)
          text+=`\n⏳ Você tem *2 minutos*.\nResponda com *${prefix}resposta 1*, 2, 3 ou 4.`
          await reply(text)

        } else if(['resposta'].includes(cmd)){
          const n=parseInt(args[0]||'0',10)
          const r=await answerQuiz(chat,sender,n)
          if(r.correct) await reply(`✅ *Acertou!* +R$ ${fmt(r.reward)}\nResposta: *${r.correctText}*`)
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

        } else if(['boss'].includes(cmd)){
          const r=await startBoss(chat)
          if(r.already) return await reply(`👹 *${r.name}* ainda está vivo!\n❤️ HP: ${r.hp}/${r.maxHp}\nUse *${prefix}atacar*.`)
          await progressDailyMission(sender,'game')
          await reply(`👹 *BOSS APARECEU!*\n\n*${r.name}*\n❤️ HP: ${r.hp}/${r.maxHp}\n\nTodos podem atacar com *${prefix}atacar*.`)

        } else if(['atacar'].includes(cmd)){
          const r=await attackBoss(chat,sender,msg.pushName||'Jogador')
          if(r.cooldown) return await reply(`⏳ Aguarde *${r.remaining}s* para atacar o boss novamente.`)
          if(r.dead) return await reply(`💥 *BOSS DERROTADO!*\nDano final: ${r.damage}\n👥 Participantes: ${r.players}\n💰 Cada participante recebeu R$ ${fmt(r.rewardEach)}\n🎁 Premiação total: R$ ${fmt(r.pot)}`)
          await reply(`⚔️ Você causou *${r.damage}* de dano!\n👹 Boss: ❤️ ${r.hp}/${r.maxHp}`)

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

        } else if(['admin','ownermenu','adminmenu','donocomandos'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando não disponível para Beta.')
          await showAdminMainMenu(chat,sender,reply)

        } else if(['comandos','comando','commands','cmds'].includes(cmd)){
          await showCommandsMainMenu(chat,sender,reply)

        } else if(['menu','help','ajuda'].includes(cmd)){
          setQuickFlow(chat,sender,'nav_main',{},90000)
          await reply(
`🍀 *ALPHA BOT — MENU PRINCIPAL*

1️⃣ 👤 Meu perfil
2️⃣ 💰 Economia
3️⃣ 🛒 Itens e inventário
4️⃣ ⚔️ RPG
5️⃣ 🎮 Minigames
6️⃣ 📋 Progressão
7️⃣ 🏴 Clãs
8️⃣ 💚 Grupo / assinatura
📚 Catálogo completo: *!comandos*

✨ *Extra rápido:* responda uma foto ou vídeo com *!sticker*.
🖼️ *Seu card:* use *!setfoto* numa foto para personalizar o *!perfil*.

👉 *Responda apenas com o número.*
Você não precisa usar ! enquanto estiver no menu.

0️⃣ Sair

_Se preferir, os comandos antigos continuam funcionando._`
          )
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
