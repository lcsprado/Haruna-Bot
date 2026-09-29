import 'dotenv/config'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from 'baileys'
import pino from 'pino'
import {
  initDatabase, ensureUser, getProfile, claimDaily, work,
  deposit, withdraw, transfer, getShop, buyItem, getInventory, leaderboard,
  equipItem, usePotion, getCombatProfile, battle, combatLeaderboard
} from './db.js'
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

function mentionsOf(msg) {
  return msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid
    || msg?.message?.imageMessage?.contextInfo?.mentionedJid
    || msg?.message?.videoMessage?.contextInfo?.mentionedJid
    || []
}

function fmt(n){ return Number(n||0).toLocaleString('pt-BR') }
function duration(sec){
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60)
  return h ? `${h}h ${m}min` : `${m}min`
}
function parseAmount(s){
  if(!s) return 0
  const clean=String(s).replace(/\./g,'').replace(',','.')
  const n=Number(clean)
  return Number.isFinite(n) ? Math.floor(n) : 0
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
    if(connection==='open') console.log('[WhatsApp] TREVO CONECTADO')
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
        const [rawCmd,...args]=body.slice(prefix.length).trim().split(/\s+/)
        const cmd=(rawCmd||'').toLowerCase()
        const reply=(text,extra={})=>sock.sendMessage(chat,{text,...extra},{quoted:msg})

        if(['ping','p'].includes(cmd)){
          await reply('🍀 Pong! Trevo online e conectado ao Neon.')

        } else if(['saldo','balance','bal'].includes(cmd)){
          const p=await getProfile(sender)
          await reply(`💰 *Saldo*\n\n🪙 Carteira: R$ ${fmt(p.cash)}\n🏦 Banco: R$ ${fmt(p.bank)} / R$ ${fmt(p.bank_limit)}\n📊 Total: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)

        } else if(['perfil','profile'].includes(cmd)){
          const p=await getProfile(sender)
          await reply(`👤 *${p.push_name || 'Jogador'}*\n⭐ Nível: ${p.level}\n✨ EXP: ${p.exp}\n❤️ HP: ${p.hp}/${p.max_hp}\n⚔️ ATK: ${p.atk}\n🛡️ DEF: ${p.def}\n💨 SPD: ${p.spd}\n💰 Saldo: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)

        } else if(['daily','diario'].includes(cmd)){
          const r=await claimDaily(sender)
          if(!r.ok) await reply(`⏳ Daily já coletado. Volte em ${duration(r.remaining)}.`)
          else await reply(`🍀 Daily coletado! +R$ ${fmt(r.amount)}`)

        } else if(['trabalhar','work','trampo'].includes(cmd)){
          const r=await work(sender)
          if(!r.ok) await reply(`⏳ Você já trabalhou. Tente novamente em ${duration(r.remaining)}.`)
          else await reply(`💼 Você trabalhou como *${r.job}* e ganhou *R$ ${fmt(r.amount)}*.`)

        } else if(['depositar','deposit','dep'].includes(cmd)){
          const amount=parseAmount(args[0])
          if(!amount) return await reply(`Uso: *${prefix}depositar 1000*`)
          const r=await deposit(sender,amount)
          await reply(`🏦 Depósito concluído.\n🪙 Carteira: R$ ${fmt(r.cash)}\n🏦 Banco: R$ ${fmt(r.bank)}`)

        } else if(['sacar','withdraw','saque'].includes(cmd)){
          const amount=parseAmount(args[0])
          if(!amount) return await reply(`Uso: *${prefix}sacar 1000*`)
          const r=await withdraw(sender,amount)
          await reply(`💵 Saque concluído.\n🪙 Carteira: R$ ${fmt(r.cash)}\n🏦 Banco: R$ ${fmt(r.bank)}`)

        } else if(['pix','transferir','transfer'].includes(cmd)){
          const mentions=mentionsOf(msg)
          const target=mentions[0]
          const amount=parseAmount(args.find(a=>/^\d[\d.,]*$/.test(a)))
          if(!target || !amount) return await reply(`Uso no grupo: *${prefix}pix @pessoa 1000*`)
          const r=await transfer(sender,target,amount)
          await reply(`💸 *PIX realizado!*\n\n➡️ Enviado: R$ ${fmt(r.amount)}\n🧾 Taxa: R$ ${fmt(r.fee)}\n💰 Total debitado: R$ ${fmt(r.total)}`,{mentions:[target]})

        } else if(['loja','shop'].includes(cmd)){
          const items=await getShop()
          const visible=items.filter(i=>['pocao_p','pocao_m','espada_madeira','espada_ferro','armadura_couro','armadura_ferro','caixa_sorte'].includes(i.id))
          let text='🍀 *LOJA DO TREVO*\n\n'
          for(const i of visible){
            text+=`📦 *${i.name}* — R$ ${fmt(i.price)}\nID: \`${i.id}\`\n_${i.description}_\n\n`
          }
          text+=`Comprar: *${prefix}comprar <id> [quantidade]*`
          await reply(text.trim())

        } else if(['comprar','buy'].includes(cmd)){
          const id=(args[0]||'').toLowerCase()
          const qty=parseInt(args[1]||'1',10)
          if(!id) return await reply(`Uso: *${prefix}comprar espada_madeira 1*`)
          const r=await buyItem(sender,id,qty)
          await reply(`🛒 Compra concluída!\n📦 ${r.item.name} ×${r.qty}\n💸 R$ ${fmt(r.total)}`)

        } else if(['inventario','inventory','inv'].includes(cmd)){
          const items=await getInventory(sender)
          if(!items.length) return await reply('🎒 Seu inventário está vazio.')
          let text='🎒 *SEU INVENTÁRIO*\n\n'
          for(const i of items) text+=`• *${i.name}* ×${i.quantity} _[${i.rarity}]_\n`
          await reply(text.trim())

        } else if(['equipar','equip'].includes(cmd)){
          const id=(args[0]||'').toLowerCase()
          if(!id) return await reply(`Uso: *${prefix}equipar espada_madeira*`)
          const r=await equipItem(sender,id)
          const tipo=r.category==='weapon'?'arma':'armadura'
          await reply(`⚙️ *Equipado!*\n${r.name} agora é sua ${tipo} ativa.`)

        } else if(['usar','use'].includes(cmd)){
          const id=(args[0]||'').toLowerCase()
          if(!id) return await reply(`Uso: *${prefix}usar pocao_p*`)
          const r=await usePotion(sender,id)
          await reply(`🧪 *${r.name} usada!*\n❤️ +${r.healed} HP\nHP atual: ${r.hp}/${r.maxHp}`)

        } else if(['status','rpg'].includes(cmd)){
          const p=await getCombatProfile(sender)
          await reply(
`⚔️ *STATUS RPG — ${p.push_name || 'Jogador'}*

⭐ Nível: ${p.level}
✨ EXP: ${p.exp}/${p.level*100}
❤️ HP: ${p.hp}/${p.max_hp}
⚔️ ATK: ${p.effective_atk}
🛡️ DEF: ${p.effective_def}
💨 SPD: ${p.spd}

🗡️ Arma: ${p.weapon_name}
🥋 Armadura: ${p.armor_name}

🏆 Vitórias: ${p.win}
💀 Derrotas: ${p.loss}`
          )

        } else if(['batalhar','batalha','battle','duelo'].includes(cmd)){
          const target=mentionsOf(msg)[0]
          if(!target) return await reply(`Uso no grupo: *${prefix}batalhar @pessoa*`)
          const r=await battle(sender,target)
          if(!r.ok) return await reply(`⏳ Você poderá batalhar novamente em ${duration(r.remaining)}.`)

          const last=r.log.slice(-6)
          let text='⚔️ *BATALHA DO TREVO*\n\n'
          for(const l of last){
            text+=`${l.crit?'💥 CRÍTICO! ':'⚔️ '}${l.from} causou *${l.dmg}* em ${l.to} — ❤️ ${l.hp}\n`
          }
          text+=`\n🏆 *Vencedor: ${r.winner.name}*\n💰 Prêmio: R$ ${fmt(r.reward)}\n✨ EXP: +40 vencedor / +15 derrotado`
          if(r.winExp.levels>0) text+=`\n⬆️ ${r.winner.name} subiu ${r.winExp.levels} nível(is)!`
          if(r.loseExp.levels>0) text+=`\n⬆️ ${r.loser.name} subiu ${r.loseExp.levels} nível(is)!`
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
          const rows=await leaderboard(10)
          if(!rows.length) return await reply('🏆 Ainda não há jogadores no ranking.')
          let text='🏆 *RANKING — MAIS RICOS*\n\n'
          rows.forEach((r,i)=>{
            const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`
            text+=`${medal} *${r.push_name || 'Jogador'}* — R$ ${fmt(r.total)}\n`
          })
          await reply(text.trim())

        } else if(['menu','help','ajuda'].includes(cmd)){
          await reply(
`🍀 *TREVO — MENU*

💰 *Economia*
${prefix}saldo
${prefix}daily
${prefix}trabalhar
${prefix}depositar <valor>
${prefix}sacar <valor>
${prefix}pix @pessoa <valor>

🛒 *Itens*
${prefix}loja
${prefix}comprar <id> [qtd]
${prefix}inventario
${prefix}equipar <id>
${prefix}usar <id>

⚔️ *RPG*
${prefix}status
${prefix}batalhar @pessoa
${prefix}rankingrpg

🏆 *Competição*
${prefix}ranking

👤 *Perfil*
${prefix}perfil
${prefix}ping

_Em breve: dungeon, roubo, clãs e família._`
          )
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
