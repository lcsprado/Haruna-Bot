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
  equipItem, usePotion, getCombatProfile, battle, combatLeaderboard,
  acquireRuntimeLock, ownerAddBalance, ownerRemoveBalance, ownerAddExp,
  ownerSetLevel, ownerHeal, ownerGrantItem
} from './db.js'
import { useNeonAuthState } from './auth.js'

const logger=pino({level:process.env.LOG_LEVEL || 'info'})
const prefix=process.env.PREFIX || '!'
const pairingNumber=(process.env.PAIRING_NUMBER || '').replace(/\D/g,'')
const sessionId=process.env.SESSION_ID || 'default'
const ownerJid=process.env.OWNER_JID || ''

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

const SHOP_IDS=[
  'pocao_p',
  'pocao_m',
  'espada_madeira',
  'espada_ferro',
  'armadura_couro',
  'armadura_ferro',
  'caixa_sorte'
]

function resolveShopItem(input){
  const raw=String(input||'').toLowerCase().trim()
  if(/^\d+$/.test(raw)){
    const idx=Number(raw)-1
    return SHOP_IDS[idx] || null
  }
  return SHOP_IDS.includes(raw) ? raw : null
}

async function start() {
  await initDatabase()
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
        const isOwner=ownerJid && sender===ownerJid
        const ownerTarget=mentionsOf(msg)[0] || sender

        if(['ping','p'].includes(cmd)){
          await reply('🍀 Pong! Trevo online e conectado ao Neon.')

        } else if(['saldo','balance','bal'].includes(cmd)){
          const p=await getProfile(sender)
          await reply(`💰 *Saldo*\n\n🪙 Carteira: R$ ${fmt(p.cash)}\n🏦 Banco: R$ ${fmt(p.bank)} / R$ ${fmt(p.bank_limit)}\n📊 Total: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)

        } else if(['perfil','profile'].includes(cmd)){
          const p=await getCombatProfile(sender)
          await reply(`👤 *${p.push_name || 'Jogador'}*\n⭐ Nível: ${p.level}\n✨ EXP: ${p.exp}\n❤️ HP: ${p.hp}/${p.max_hp}\n⚔️ ATK: ${p.effective_atk}\n🛡️ DEF: ${p.effective_def}\n💨 SPD: ${p.spd}\n🗡️ Arma: ${p.weapon_name}\n🥋 Armadura: ${p.armor_name}\n💰 Saldo: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)

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
          const byId=new Map(items.map(i=>[i.id,i]))
          let text='🍀 *LOJA DO TREVO*\n\n'
          SHOP_IDS.forEach((id,idx)=>{
            const i=byId.get(id)
            if(!i) return
            text+=`*${idx+1}.* ${i.name} — R$ ${fmt(i.price)}\n_${i.description}_\n\n`
          })
          text+=`🛒 Comprar rápido:\n*${prefix}comprar 1*\n*${prefix}comprar 4 2*  _(2 unidades)_\n\n⚡ Atalho direto:\n*${prefix}espada_madeira*\n*${prefix}caixa_sorte*`
          await reply(text.trim())

        } else if(['comprar','buy'].includes(cmd)){
          const id=resolveShopItem(args[0])
          const qty=parseInt(args[1]||'1',10)
          if(!id) return await reply(`Uso: *${prefix}comprar 1* ou *${prefix}comprar espada_madeira*`)
          const r=await buyItem(sender,id,qty)
          await reply(`🛒 Compra concluída!\n📦 ${r.item.name} ×${r.qty}\n💸 R$ ${fmt(r.total)}`)

        } else if(SHOP_IDS.includes(cmd)){
          const r=await buyItem(sender,cmd,1)
          await reply(`🛒 Compra rápida concluída!\n📦 ${r.item.name} ×1\n💸 R$ ${fmt(r.total)}`)

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
⚔️ ATK: ${p.effective_atk} (${p.base_atk} base + ${p.weapon_atk} arma)
🛡️ DEF: ${p.effective_def} (${p.base_def} base + ${p.armor_def} armadura)
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


        } else if(['addsaldo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const amount=parseAmount(args.find(a=>/^\d[\d.,]*$/.test(a)))
          if(!amount) return await reply(`Uso: *${prefix}addsaldo 50000* ou *${prefix}addsaldo @pessoa 50000*`)
          const p=await ownerAddBalance(ownerTarget,amount)
          await reply(`👑 Saldo adicionado.\n💰 Novo saldo: R$ ${fmt(p.cash)}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['remsaldo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const amount=parseAmount(args.find(a=>/^\d[\d.,]*$/.test(a)))
          if(!amount) return await reply(`Uso: *${prefix}remsaldo 10000* ou *${prefix}remsaldo @pessoa 10000*`)
          const r=await ownerRemoveBalance(ownerTarget,amount)
          await reply(`👑 Saldo removido: R$ ${fmt(r.removed)}\n💰 Saldo atual: R$ ${fmt(r.cash)}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['addexp'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const amount=parseAmount(args.find(a=>/^\d+$/.test(a)))
          if(!amount) return await reply(`Uso: *${prefix}addexp 500* ou *${prefix}addexp @pessoa 500*`)
          const r=await ownerAddExp(ownerTarget,amount)
          await reply(`👑 EXP adicionada: +${fmt(amount)}\n⭐ Nível: ${r.level}\n✨ EXP atual: ${r.exp}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['setnivel'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const level=parseInt(args.find(a=>/^\d+$/.test(a))||'0',10)
          if(!level) return await reply(`Uso: *${prefix}setnivel 10* ou *${prefix}setnivel @pessoa 10*`)
          const r=await ownerSetLevel(ownerTarget,level)
          await reply(`👑 Nível alterado: ${r.oldLevel} → ${r.level}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['curar'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const r=await ownerHeal(ownerTarget)
          await reply(`👑 Cura completa. ❤️ ${r.hp}/${r.max_hp}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

        } else if(['daritem'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const itemArg=args.find(a=>SHOP_IDS.includes(a.toLowerCase()))
          const qtyArg=args.find(a=>/^\d+$/.test(a))
          const qty=parseInt(qtyArg||'1',10)
          if(!itemArg) return await reply(`Uso: *${prefix}daritem espada_ferro 1* ou *${prefix}daritem @pessoa espada_ferro 1*`)
          const r=await ownerGrantItem(ownerTarget,itemArg.toLowerCase(),qty)
          await reply(`👑 Item entregue: ${r.item.name} ×${r.qty}`,{mentions:ownerTarget===sender?[]:[ownerTarget]})

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
${prefix}comprar <número> [qtd]
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
