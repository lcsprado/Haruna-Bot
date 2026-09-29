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
  ownerSetLevel, ownerHeal, ownerGrantItem,
  getGroupLicense, ensureGroupTrial, activateGroupLicense, blockGroupLicense,
  listGroupLicenses, groupLicenseIsActive,
  getLaunchPrice, setLaunchPrice,
  getPaymentLink, setPaymentLink,
  createSubscriptionOrder, getSubscriptionOrder, listPendingSubscriptionOrders,
  approveSubscriptionOrder, cancelSubscriptionOrder,
  openLuckyBox, dungeon, robPlayer
} from './db.js'
import { useNeonAuthState } from './auth.js'
import {
  initGames, roulette, coinFlip, rps,
  startHangman, hangmanLetter, hangmanWord,
  startQuiz, answerQuiz,
  startNumberGame, guessNumber,
  startBoss, attackBoss
} from './games.js'

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
function fmtDate(epoch){
  if(!epoch) return '—'
  return new Date(Number(epoch)*1000).toLocaleString('pt-BR',{
    timeZone:'America/Sao_Paulo',
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit'
  })
}
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
  await initGames()
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
        const isGroup=chat.endsWith('@g.us')

        if(isGroup && !isOwner && !['termos','statusgrupo','assinar','plano','preco','pedido'].includes(cmd)){
          let license=await getGroupLicense(chat)
          if(!license) license=await ensureGroupTrial(chat)

          if(!groupLicenseIsActive(license)){
            return await reply(
`🔒 *TREVO BLOQUEADO NESTE GRUPO*

O período de acesso terminou ou este grupo foi bloqueado.

💚 Plano simbólico: *R$ 2 por 30 dias*
📄 Leia: *${prefix}termos*
📅 Consulte: *${prefix}statusgrupo*

Fale com o responsável pelo Trevo para ativação.`
            )
          }
        }

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

        } else if(cmd==='caixa_sorte'){
          const r=await openLuckyBox(sender)
          if(r.type==='cash') await reply(`🎁 *CAIXA DA SORTE*\n💰 Você encontrou *R$ ${fmt(r.cash)}*!`)
          else if(r.type==='exp') await reply(`🎁 *CAIXA DA SORTE*\n✨ Você recebeu *+${r.exp} EXP*!\n⭐ Nível atual: ${r.level.level}`)
          else if(r.type==='rare') await reply(`🌟 *PRÊMIO RARO!*\nVocê recebeu *${r.name}* ×${r.qty}!`)
          else await reply(`🎁 *CAIXA DA SORTE*\nVocê recebeu *${r.name}* ×${r.qty}!`)

        } else if(SHOP_IDS.includes(cmd) && cmd!=='caixa_sorte'){
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



        } else if(['games','jogos'].includes(cmd)){
          await reply(
`🎮 *MINIGAMES DO TREVO*

🎰 ${prefix}roleta 100 vermelho
🪙 ${prefix}cara 100 / ${prefix}coroa 100
✊ ${prefix}ppt pedra
🔤 ${prefix}forca
🧠 ${prefix}quiz
🔢 ${prefix}numero
👹 ${prefix}boss

_Use ${prefix}menu para ver todos os comandos._`
          )

        } else if(['roleta'].includes(cmd)){
          const amount=parseAmount(args[0])
          const choice=(args[1]||'').toLowerCase()
          if(!amount||!choice) return await reply(`Uso: *${prefix}roleta 100 vermelho*\nCores: vermelho, preto ou verde`)
          const r=await roulette(sender,amount,choice)
          const result=r.payout>0
            ? `🎉 Você ganhou R$ ${fmt(r.payout)}! Lucro: R$ ${fmt(r.profit)}`
            : `💸 Você perdeu R$ ${fmt(r.amount)}.`
          await reply(`🎰 *ROLETA*\n\nNúmero: *${r.number}*\nCor: *${r.color}*\nSua escolha: *${r.choice}*\n\n${result}`)

        } else if(['cara','coroa'].includes(cmd)){
          const choice=cmd
          const amount=parseAmount(args[0])
          if(!amount) return await reply(`Uso: *${prefix}${choice} 100*`)
          const r=await coinFlip(sender,amount,choice)
          await reply(`🪙 *CARA OU COROA*\n\nResultado: *${r.result}*\nVocê escolheu: *${r.choice}*\n${r.payout>0?`🎉 Ganhou R$ ${fmt(r.payout)}!`:`💸 Perdeu R$ ${fmt(r.amount)}.`}`)

        } else if(['ppt'].includes(cmd)){
          const choice=(args[0]||'').toLowerCase()
          if(!choice) return await reply(`Uso: *${prefix}ppt pedra*\nOpções: pedra, papel ou tesoura`)
          const r=rps(choice)
          const emoji=r.result==='vitoria'?'🏆':r.result==='empate'?'🤝':'💀'
          await reply(`✊ *PEDRA, PAPEL E TESOURA*\n\nVocê: *${r.choice}*\nTrevo: *${r.bot}*\n\n${emoji} *${r.result.toUpperCase()}*`)

        } else if(['forca'].includes(cmd)){
          const r=await startHangman(chat)
          if(r.already) return await reply(`🔤 Já existe uma forca ativa.\nDica: *${r.hint}*\nPalavra: ${r.word.split('').map(ch=>r.letters.includes(ch)?ch:'_').join(' ')}\n❤️ Vidas: ${r.lives}`)
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
          let text=`🧠 *QUIZ DO TREVO*\n\n${q.q}\n\n`
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
          await reply(`👹 *BOSS APARECEU!*\n\n*${r.name}*\n❤️ HP: ${r.hp}/${r.maxHp}\n\nTodos podem atacar com *${prefix}atacar*.`)

        } else if(['atacar'].includes(cmd)){
          const r=await attackBoss(chat,sender,msg.pushName||'Jogador')
          if(r.cooldown) return await reply(`⏳ Aguarde *${r.remaining}s* para atacar o boss novamente.`)
          if(r.dead) return await reply(`💥 *BOSS DERROTADO!*\nDano final: ${r.damage}\n👥 Participantes: ${r.players}\n💰 Cada participante recebeu R$ ${fmt(r.rewardEach)}\n🎁 Premiação total: R$ ${fmt(r.pot)}`)
          await reply(`⚔️ Você causou *${r.damage}* de dano!\n👹 Boss: ❤️ ${r.hp}/${r.maxHp}`)

        } else if(['dungeon','masmorra'].includes(cmd)){
          const r=await dungeon(sender)
          if(!r.ok) return await reply(`⏳ Você poderá entrar novamente na dungeon em ${duration(r.remaining)}.`)
          if(r.won){
            let text=`🏰 *DUNGEON CONCLUÍDA!*\n\n👹 Inimigo: *${r.monster}*\n❤️ HP restante: ${r.hp}/${r.maxHp}\n💰 Recompensa: R$ ${fmt(r.cash)}\n✨ EXP: +${r.exp}`
            if(r.level.levels>0) text+=`\n⬆️ Você subiu ${r.level.levels} nível(is)!`
            await reply(text)
          }else{
            await reply(`💀 *DERROTA NA DUNGEON*\n\n👹 ${r.monster} venceu.\n❤️ Você se recuperou para ${r.hp}/${r.maxHp}\n✨ Consolação: +${r.exp} EXP`)
          }

        } else if(['roubar','roubo'].includes(cmd)){
          const target=mentionsOf(msg)[0]
          if(!target) return await reply(`Uso no grupo: *${prefix}roubar @pessoa*`)
          const r=await robPlayer(sender,target)
          if(!r.ok) return await reply(`⏳ Você poderá tentar outro roubo em ${duration(r.remaining)}.`)
          if(r.success) await reply(`🕵️ *ROUBO BEM-SUCEDIDO!*\n💰 Você roubou *R$ ${fmt(r.amount)}*.`,{mentions:[target]})
          else await reply(`🚓 *VOCÊ FOI PEGO!*\n💸 Multa: R$ ${fmt(r.fine)}\nTente novamente mais tarde.`,{mentions:[target]})

        } else if(['termos'].includes(cmd)){
          const price=await getLaunchPrice()
          await reply(
`📄 *TERMOS DO TREVO — RESUMO*

🎉 *Preço de lançamento:* R$ ${price.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} por grupo / 30 dias
🎁 *Teste:* 3 dias grátis no primeiro uso do grupo

⚠️ *Aviso importante*
O Trevo utiliza integração não oficial com o WhatsApp. Por esse motivo, podem ocorrer desconexões, limitações ou bloqueios do número utilizado pelo bot por decisão da própria plataforma.

Ao contratar o acesso, o responsável pelo grupo declara estar ciente desse risco. O Trevo não garante funcionamento ininterrupto nem pode impedir eventuais restrições aplicadas pelo WhatsApp.

O pagamento refere-se ao acesso às funcionalidades do bot durante o período contratado, enquanto o serviço estiver disponível.

🚫 Spam, automações abusivas ou uso que coloque o bot em risco podem resultar na suspensão do grupo.`
          )

        } else if(['statusgrupo'].includes(cmd)){
          if(!isGroup) return await reply('Este comando funciona dentro de grupos.')
          const lic=await getGroupLicense(chat)
          if(!lic){
            return await reply(
`🍀 *STATUS DO GRUPO*

Status: *AINDA NÃO INICIADO*
🎁 O grupo tem direito a *3 dias grátis*.

O teste começa quando alguém usar um comando normal do Trevo pela primeira vez.
Para contratar direto, use *${prefix}assinar*.`
            )
          }
          const active=groupLicenseIsActive(lic)
          await reply(
`🍀 *STATUS DO GRUPO*

Status: *${active?'ATIVO':'INATIVO'}*
Plano: *${lic.plan}*
Validade: *${fmtDate(lic.paid_until)}*
${lic.plan==='trial'?'🎁 Este grupo está no período de teste grátis.':`💚 Plano atual: R$ ${Number(await getLaunchPrice()).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} / 30 dias.`}`
          )

        } else if(['assinar','plano','preco'].includes(cmd)){
          if(!isGroup) return await reply('Use este comando dentro do grupo que deseja assinar.')
          const r=await createSubscriptionOrder(chat,sender)
          const price=Number(r.order.amount)
          const paymentLink=await getPaymentLink()
          await reply(
`💚 *TREVO — ASSINATURA*

🎉 Preço de lançamento: *R$ ${price.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}*
📅 Acesso: *30 dias*
🧾 Pedido: *${r.order.code}*

💳 *PAGAMENTO PELO MERCADO PAGO*
${paymentLink}

Após o pagamento, envie o comprovante ao responsável pelo Trevo junto com o código *${r.order.code}*.

⏳ O pedido fica válido por 24 horas.
📄 Antes de pagar, leia *${prefix}termos*.

_${r.reused?'Este grupo já tinha um pedido pendente; reutilizei o mesmo código.':'Pedido criado para este grupo.'}_`
          )

        } else if(['pedido'].includes(cmd)){
          const code=String(args[0]||'').toUpperCase()
          if(!code) return await reply(`Uso: *${prefix}pedido TREVO-XXXXXX*`)
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
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const value=args.join(' ').trim()
          if(!value) return await reply(`Uso: *${prefix}setlinkpagamento https://...*`)
          const link=await setPaymentLink(value)
          await reply(`👑 Link de pagamento atualizado:\n${link}`)

        } else if(['pedidos'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const rows=await listPendingSubscriptionOrders(30)
          if(!rows.length) return await reply('🧾 Nenhum pedido pendente.')
          let text='🧾 *PEDIDOS PENDENTES*\n\n'
          rows.forEach((r,i)=>{
            text+=`${i+1}. *${r.code}* — R$ ${Number(r.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}\n   criado: ${fmtDate(r.created_at)}\n`
          })
          text+=`\nPara aprovar: *${prefix}aprovarpedido TREVO-XXXXXX*`
          await reply(text)

        } else if(['aprovarpedido'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const code=String(args[0]||'').toUpperCase()
          if(!code) return await reply(`Uso: *${prefix}aprovarpedido TREVO-XXXXXX*`)
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
✅ Trevo liberado por mais *30 dias*.
📅 Validade: *${fmtDate(r.paid_until)}*

Obrigado por apoiar o Trevo 🍀`
            })
          }catch(err){
            console.error('[assinatura] não foi possível avisar o grupo',err?.message||err)
          }

        } else if(['cancelarpedido'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const code=String(args[0]||'').toUpperCase()
          if(!code) return await reply(`Uso: *${prefix}cancelarpedido TREVO-XXXXXX*`)
          const r=await cancelSubscriptionOrder(code)
          await reply(`🚫 Pedido *${r.code}* cancelado.`)

        } else if(['setpreco'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const raw=args[0]
          if(!raw) return await reply(`Uso: *${prefix}setpreco 5*`)
          const value=await setLaunchPrice(raw)
          await reply(`👑 Preço de lançamento atualizado para *R$ ${value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} / 30 dias*.`)

        } else if(['ativargrupo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          if(!isGroup) return await reply('Use este comando dentro do grupo que deseja ativar.')
          const days=parseInt(args[0]||'30',10)
          const lic=await activateGroupLicense(chat,days,sender,'basic')
          await reply(`👑 Grupo ativado por *${days} dias*.\n📅 Validade: *${fmtDate(lic.paid_until)}*`)

        } else if(['bloqueargrupo'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          if(!isGroup) return await reply('Use este comando dentro do grupo que deseja bloquear.')
          await blockGroupLicense(chat,sender)
          await reply('🔒 Grupo bloqueado pelo dono.')

        } else if(['gruposativos'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          const rows=await listGroupLicenses(50)
          if(!rows.length) return await reply('Nenhum grupo registrado ainda.')
          let text='👑 *GRUPOS REGISTRADOS*\n\n'
          rows.forEach((r,i)=>{
            const active=groupLicenseIsActive(r)
            text+=`${i+1}. ${active?'✅':'❌'} ${r.plan} — ${fmtDate(r.paid_until)}\n`
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

        } else if(['ownermenu','adminmenu','donocomandos'].includes(cmd)){
          if(!isOwner) return await reply('⛔ Comando restrito ao dono.')
          await reply(
`👑 *TREVO — COMANDOS DO DONO*

💰 *Jogadores*
${prefix}addsaldo @pessoa 5000
${prefix}remsaldo @pessoa 5000
${prefix}addexp @pessoa 500
${prefix}setnivel @pessoa 10
${prefix}curar @pessoa
${prefix}daritem @pessoa espada_ferro 1

💚 *Grupos*
${prefix}ativargrupo 30
${prefix}bloqueargrupo
${prefix}gruposativos

💳 *Assinaturas*
${prefix}pedidos
${prefix}aprovarpedido TREVO-XXXXXX
${prefix}cancelarpedido TREVO-XXXXXX
${prefix}setpreco 5
${prefix}setlinkpagamento https://...

_Use estes comandos com cuidado: alterações de saldo, nível e assinatura são administrativas._`
          )

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
${prefix}dungeon
${prefix}roubar @pessoa
${prefix}caixa_sorte
${prefix}rankingrpg

🎮 *Minigames*
${prefix}games
${prefix}roleta 100 vermelho
${prefix}cara 100 / ${prefix}coroa 100
${prefix}ppt pedra
${prefix}forca
${prefix}quiz
${prefix}numero
${prefix}boss

🏆 *Competição*
${prefix}ranking

👤 *Perfil*
${prefix}perfil
${prefix}ping

💚 *Grupo*
${prefix}statusgrupo
${prefix}assinar
${prefix}pedido <código>
${prefix}termos

_Em breve: clãs, família, casas e carros._`
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
