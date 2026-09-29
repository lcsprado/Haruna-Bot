import 'dotenv/config'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from 'baileys'
import pino from 'pino'
import { initDatabase, ensureUser, getProfile, claimDaily } from './db.js'
import { useNeonAuthState } from './auth.js'

const logger=pino({level:process.env.LOG_LEVEL || 'info'})
const prefix=process.env.PREFIX || '!'
const pairingNumber=(process.env.PAIRING_NUMBER || '').replace(/\D/g,'')
const sessionId=process.env.SESSION_ID || 'default'

function textOf(msg) {
  const m=msg?.message
  return m?.conversation
    || m?.extendedTextMessage?.text
    || m?.imageMessage?.caption
    || m?.videoMessage?.caption
    || ''
}

function fmt(n){ return Number(n||0).toLocaleString('pt-BR') }
function duration(sec){
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60)
  return h ? `${h}h ${m}min` : `${m}min`
}

async function start() {
  await initDatabase()
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
    markOnlineOnConnect:false,
    syncFullHistory:false,
    connectTimeoutMs:60000,
    defaultQueryTimeoutMs:60000,
    keepAliveIntervalMs:10000
  })

  sock.ev.on('creds.update',saveCreds)

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
    if(connection==='open') console.log('[WhatsApp] BOT CONECTADO')
    if(connection==='close'){
      const code=lastDisconnect?.error?.output?.statusCode
      const loggedOut=code===DisconnectReason.loggedOut
      console.log('[WhatsApp] conexão fechada',code,loggedOut?'logged out':'reconectando')
      if(!loggedOut) setTimeout(()=>start().catch(console.error),3000)
    }
  })

  sock.ev.on('messages.upsert',async({messages,type})=>{
    if(type!=='notify') return
    for(const msg of messages){
      try{
        if(!msg?.message || msg.key.fromMe) continue
        const chat=msg.key.remoteJid
        if(!chat || chat==='status@broadcast') continue
        const sender=msg.key.participant || chat
        const body=textOf(msg).trim()
        if(!body.startsWith(prefix)) continue

        await ensureUser(sender,msg.pushName || '')
        const [cmd,...args]=body.slice(prefix.length).trim().split(/\s+/)
        const reply=text=>sock.sendMessage(chat,{text},{quoted:msg})

        if(['ping','p'].includes(cmd.toLowerCase())){
          await reply('🏓 Pong! Bot online e conectado ao Neon.')
        } else if(['saldo','balance','bal'].includes(cmd.toLowerCase())){
          const p=await getProfile(sender)
          await reply(`💰 *Saldo*\n\n🪙 Carteira: R$ ${fmt(p.cash)}\n🏦 Banco: R$ ${fmt(p.bank)}\n📊 Total: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)
        } else if(['perfil','profile'].includes(cmd.toLowerCase())){
          const p=await getProfile(sender)
          await reply(`👤 *${p.push_name || 'Jogador'}*\n⭐ Nível: ${p.level}\n✨ EXP: ${p.exp}\n❤️ HP: ${p.hp}/${p.max_hp}\n⚔️ ATK: ${p.atk}\n🛡️ DEF: ${p.def}\n💨 SPD: ${p.spd}\n💰 Saldo: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)
        } else if(['daily','diario'].includes(cmd.toLowerCase())){
          const r=await claimDaily(sender)
          if(!r.ok) await reply(`⏳ Daily já coletado. Volte em ${duration(r.remaining)}.`)
          else await reply(`🎁 Daily coletado! +R$ ${fmt(r.amount)}`)
        } else if(['menu','help','ajuda'].includes(cmd.toLowerCase())){
          await reply(`🤖 *Haruna Neon*\n\n${prefix}ping — testar bot\n${prefix}saldo — ver dinheiro\n${prefix}perfil — ver personagem\n${prefix}daily — prêmio diário\n\nBackend: Neon PostgreSQL`)
        }
      }catch(err){
        console.error('[mensagem] erro',err)
      }
    }
  })
}

start().catch(err=>{
  console.error('[fatal]',err)
  process.exit(1)
})
