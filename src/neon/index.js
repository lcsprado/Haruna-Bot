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
import {
  initProgression, HOUSES, CARS,
  getDailyMissions, progressDailyMission, claimDailyMissions,
  getClanForUser, createClan, inviteToClan, acceptClanInvite, transferClanLeadership,
  kickClanMember, leaveClan, donateClan, listClans,
  getHome, buyHouse, getGarage, buyCar,
  getPatrimony, patrimonyLeaderboard
} from './progression.js'

const logger=pino({level:process.env.LOG_LEVEL || 'info'})
const prefix=process.env.PREFIX || '!'
const pairingNumber=(process.env.PAIRING_NUMBER || '').replace(/\D/g,'')
const sessionId=process.env.SESSION_ID || 'default'
const ownerJid=process.env.OWNER_JID || ''

const trevoHealth=globalThis.__trevoHealth || (globalThis.__trevoHealth={
  whatsapp:'starting',
  lastChange:Date.now(),
  lastOpen:0,
  everConnected:false
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

const quickGameFlows=new Map()
const quickFlowKey=(chat,sender)=>`${chat}|${sender}`
function setQuickFlow(chat,sender,stage,data={},ttlMs=90000){
  quickGameFlows.set(quickFlowKey(chat,sender),{
    stage,data,expiresAt:Date.now()+ttlMs
  })
}
function getQuickFlow(chat,sender){
  const key=quickFlowKey(chat,sender)
  const flow=quickGameFlows.get(key)
  if(!flow) return null
  if(flow.expiresAt<=Date.now()){
    quickGameFlows.delete(key)
    return null
  }
  return flow
}
function clearQuickFlow(chat,sender){
  quickGameFlows.delete(quickFlowKey(chat,sender))
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
    markOnlineOnConnect:false,
    syncFullHistory:false,
    connectTimeoutMs:60000,
    defaultQueryTimeoutMs:60000,
    keepAliveIntervalMs:10000
  })

  sock.ev.on('creds.update',saveCreds)

  async function handleQuickGameFlow({chat,sender,body,reply,msg}){
    const flow=getQuickFlow(chat,sender)
    if(!flow) return false
    const input=String(body||'').trim().toLowerCase()

    if(['0','sair','cancelar','cancel'].includes(input)){
      clearQuickFlow(chat,sender)
      await reply('✅ Menu encerrado. Use *!menu* ou *!games* quando quiser abrir novamente.')
      return true
    }

    const gamesMenu=async()=>{
      setQuickFlow(chat,sender,'main',{},90000)
      await reply(
`🎮 *MINIGAMES DO TREVO*

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
`🍀 *TREVO — MENU PRINCIPAL*

1️⃣ 👤 Meu perfil
2️⃣ 💰 Economia
3️⃣ 🛒 Itens e inventário
4️⃣ ⚔️ RPG
5️⃣ 🎮 Minigames
6️⃣ 📋 Progressão
7️⃣ 🏴 Clãs
8️⃣ 💚 Grupo / assinatura

👉 *Responda apenas com o número.*

0️⃣ Sair`
      )
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
Trevo: *${r.bot}*

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
        let text=`🧠 *QUIZ DO TREVO*\n\n${q.q}\n\n`
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
        let text=`🧠 *QUIZ DO TREVO*\n\n${q.q}\n\n`
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
Trevo: *${r.bot}*

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
      const index=Number(input)-1
      const itemId=flow.data.items?.[index]
      if(!itemId){
        await reply('⚙️ Escolha um dos números da lista ou digite *0* para cancelar.')
        return true
      }
      const r=await equipItem(sender,itemId)
      clearQuickFlow(chat,sender)
      const tipo=r.category==='weapon'?'arma':'armadura'
      await reply(`✅ *EQUIPADO!*\n\n${r.name} agora é sua ${tipo} ativa.`)
      return true
    }

    if(flow.stage==='use_select'){
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


    if(flow.stage==='nav_main'){
      if(!/^[1-8]$/.test(input)){
        await reply('🍀 Escolha uma opção de *1 a 8* ou digite *0* para sair.')
        return true
      }

      if(input==='1'){
        const [p,clan,home,cars,pat]=await Promise.all([
          getCombatProfile(sender),
          getClanForUser(sender),
          getHome(sender),
          getGarage(sender),
          getPatrimony(sender)
        ])
        clearQuickFlow(chat,sender)
        await reply(
`👤 *${p.push_name || 'Jogador'}*

⭐ Nível: ${p.level}
❤️ HP: ${p.hp}/${p.max_hp}
⚔️ ATK: ${p.effective_atk}
🛡️ DEF: ${p.effective_def}
🏴 Clã: ${clan?clan.name:'Nenhum'}
🏠 Casa: ${home?home.name:'Nenhuma'}
🚗 Garagem: ${cars.length}/5
💎 Patrimônio: *R$ ${fmt(pat.total)}*`
        )
        return true
      }

      if(input==='2'){
        setQuickFlow(chat,sender,'nav_economy',{},90000)
        await reply(
`💰 *ECONOMIA*

1️⃣ Ver saldo
2️⃣ Daily
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
5️⃣ Abrir Caixa da Sorte

0️⃣ Sair`
        )
        return true
      }

      if(input==='4'){
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
        setQuickFlow(chat,sender,'main',{},90000)
        await reply(
`🎮 *MINIGAMES DO TREVO*

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

0️⃣ Sair`
        )
        return true
      }
    }

    if(flow.stage==='nav_economy'){
      if(input==='1'){
        const p=await getProfile(sender)
        clearQuickFlow(chat,sender)
        await reply(`💰 *Saldo*\n\n🪙 Carteira: R$ ${fmt(p.cash)}\n🏦 Banco: R$ ${fmt(p.bank)} / R$ ${fmt(p.bank_limit)}\n📊 Total: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)
        return true
      }
      if(input==='2'){
        const r=await claimDaily(sender)
        clearQuickFlow(chat,sender)
        if(!r.ok) await reply(`⏳ Daily já coletado. Volte em ${duration(r.remaining)}.`)
        else{
          await progressDailyMission(sender,'daily')
          await reply(`🍀 Daily coletado! +R$ ${fmt(r.amount)}`)
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
        const rows=await leaderboard(10)
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
          ? Math.max(0,Math.min(Number(p.cash),Number(p.bank_limit)-Number(p.bank)))
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
        const items=await getShop()
        const byId=new Map(items.map(i=>[i.id,i]))
        setQuickFlow(chat,sender,'shop_item',{items:SHOP_IDS},90000)
        let text='🍀 *LOJA DO TREVO*\n\n'
        SHOP_IDS.forEach((id,idx)=>{
          const i=byId.get(id)
          if(i) text+=`*${idx+1}.* ${i.name} — R$ ${fmt(i.price)}\n`
        })
        text+='\n👉 Responda com o número do item.\n0️⃣ Cancelar'
        await reply(text)
        return true
      }
      if(input==='2'){
        const items=await getInventory(sender)
        if(!items.length){
          clearQuickFlow(chat,sender)
          await reply('🎒 Seu inventário está vazio.')
          return true
        }
        setQuickFlow(chat,sender,'inventory_select',{items},90000)
        let text='🎒 *SEU INVENTÁRIO*\n\n'
        items.forEach((i,idx)=>text+=`*${idx+1}.* ${i.name} ×${i.quantity}\n`)
        text+='\n👉 Escolha um item pelo número.\n0️⃣ Sair'
        await reply(text)
        return true
      }
      if(input==='3'){
        const items=await getInventory(sender)
        const equipables=items.filter(i=>['weapon','armor'].includes(i.category))
        if(!equipables.length){
          clearQuickFlow(chat,sender)
          await reply('⚙️ Você não possui equipamento.')
          return true
        }
        setQuickFlow(chat,sender,'equip_select',{items:equipables.map(i=>i.item_id)},90000)
        let text='⚙️ *O QUE QUER EQUIPAR?*\n\n'
        equipables.forEach((i,idx)=>text+=`*${idx+1}.* ${i.name}\n`)
        text+='\n👉 Responda só com o número.'
        await reply(text)
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
        const r=await openLuckyBox(sender)
        clearQuickFlow(chat,sender)
        if(r.type==='cash') await reply(`🎁 *CAIXA DA SORTE*\n💰 Você encontrou *R$ ${fmt(r.cash)}*!`)
        else if(r.type==='exp') await reply(`🎁 *CAIXA DA SORTE*\n✨ Você recebeu *+${r.exp} EXP*!`)
        else await reply(`🎁 *CAIXA DA SORTE*\nVocê recebeu *${r.name}* ×${r.qty}!`)
        return true
      }
      await reply('🛒 Escolha de *1 a 5* ou *0* para sair.')
      return true
    }

    if(flow.stage==='shop_item'){
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
      if(item.item_id==='caixa_sorte'){
        setQuickFlow(chat,sender,'inventory_box_confirm',{},90000)
        await reply('🎁 Abrir uma *Caixa da Sorte*?\n\n1️⃣ Sim\n2️⃣ Não')
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

    if(flow.stage==='inventory_box_confirm'){
      if(input==='2'){
        clearQuickFlow(chat,sender)
        await reply('✅ Cancelado.')
        return true
      }
      if(input!=='1'){
        await reply('Escolha *1 Sim* ou *2 Não*.')
        return true
      }
      const r=await openLuckyBox(sender)
      clearQuickFlow(chat,sender)
      if(r.type==='cash') await reply(`🎁 Você encontrou *R$ ${fmt(r.cash)}*!`)
      else if(r.type==='exp') await reply(`🎁 Você recebeu *+${r.exp} EXP*!`)
      else await reply(`🎁 Você recebeu *${r.name}* ×${r.qty}!`)
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
      const target=mentionsOf(msg)[0]
      if(!target){
        await reply('⚔️ Marque uma pessoa usando @.')
        return true
      }
      const r=await battle(sender,target)
      if(!r.ok){
        clearQuickFlow(chat,sender)
        await reply(`⏳ Você poderá batalhar novamente em ${duration(r.remaining)}.`)
        return true
      }
      await progressDailyMission(sender,'battle')
      clearQuickFlow(chat,sender)
      await reply(`⚔️ *BATALHA ENCERRADA!*\n🏆 Vencedor: *${r.winner.name}*\n💰 Prêmio: R$ ${fmt(r.reward)}`,{mentions:[target]})
      return true
    }

    if(flow.stage==='rob_target'){
      const target=mentionsOf(msg)[0]
      if(!target){
        await reply('🥷 Marque uma pessoa usando @.')
        return true
      }
      const r=await robPlayer(sender,target)
      clearQuickFlow(chat,sender)
      if(!r.ok) await reply(`⏳ Tente roubar novamente em ${duration(r.remaining)}.`)
      else if(r.success) await reply(`🥷 Roubo bem-sucedido! Você levou *R$ ${fmt(r.amount)}*.`,{mentions:[target]})
      else await reply(`🚔 Você falhou e pagou multa de *R$ ${fmt(r.fine)}*.`,{mentions:[target]})
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

    if(flow.stage==='nav_group'){
      if(input==='1'){
        if(!chat.endsWith('@g.us')){
          clearQuickFlow(chat,sender)
          await reply('💚 Esse status existe apenas dentro de grupos.')
          return true
        }
        const lic=await getGroupLicense(chat)
        clearQuickFlow(chat,sender)
        if(!lic){
          await reply('🍀 Grupo ainda não iniciou os 3 dias grátis.')
        }else{
          await reply(`🍀 *STATUS DO GRUPO*\nStatus: *${groupLicenseIsActive(lic)?'ATIVO':'INATIVO'}*\nPlano: *${lic.plan}*\nValidade: *${fmtDate(lic.paid_until)}*`)
        }
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
        await reply(`💚 *ASSINATURA TREVO*\n💰 R$ ${Number(r.order.amount).toLocaleString('pt-BR',{minimumFractionDigits:2})}\n🧾 Pedido: *${r.order.code}*\n\n💳 ${link}`)
        return true
      }
      if(input==='3'){
        const price=await getLaunchPrice()
        clearQuickFlow(chat,sender)
        await reply(`📄 *TERMOS RESUMIDOS*\n\nPreço atual: R$ ${Number(price).toLocaleString('pt-BR',{minimumFractionDigits:2})} / 30 dias.\nO Trevo utiliza integração não oficial com o WhatsApp e pode sofrer desconexões ou limitações da plataforma.`)
        return true
      }
      await reply('💚 Escolha *1, 2 ou 3*.')
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
      console.log('[WhatsApp] TREVO CONECTADO')
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

  sock.ev.on('messages.upsert',async({messages,type})=>{
    if(type!=='notify') return
    for(const msg of messages){
      try{
        if(!msg?.message || msg.key.fromMe) continue
        const chat=msg.key.remoteJid
        if(!chat || chat==='status@broadcast') continue
        const sender=msg.key.participant || chat
        const body=textOf(msg).trim()
        const reply=(text,extra={})=>sock.sendMessage(chat,{text,...extra},{quoted:msg})
        const isOwner=ownerJid && sender===ownerJid
        const isGroup=chat.endsWith('@g.us')

        if(!body.startsWith(prefix)){
          const flow=getQuickFlow(chat,sender)
          if(!flow) continue

          await ensureUser(sender,msg.pushName || '')
          if(isGroup && !isOwner){
            const license=await getGroupLicense(chat)
            if(!license || !groupLicenseIsActive(license)){
              clearQuickFlow(chat,sender)
              await reply('🔒 O acesso deste grupo terminou. Use *!statusgrupo* ou *!assinar*.')
              continue
            }
          }

          await handleQuickGameFlow({chat,sender,body,reply,msg})
          continue
        }

        await ensureUser(sender,msg.pushName || '')
        const [rawCmd,...args]=body.slice(prefix.length).trim().split(/\s+/)
        const cmd=(rawCmd||'').toLowerCase()
        const ownerTarget=mentionsOf(msg)[0] || sender

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

        if(['economia','eco'].includes(cmd)){
          setQuickFlow(chat,sender,'nav_economy',{},90000)
          await reply(
`💰 *ECONOMIA*

1️⃣ Ver saldo
2️⃣ Daily
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
5️⃣ Abrir Caixa da Sorte

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
`🎮 *MINIGAMES DO TREVO*

1️⃣ 🎰 Roleta
2️⃣ 🪙 Cara ou Coroa
3️⃣ ✊ Pedra, Papel e Tesoura
4️⃣ 🔤 Forca
5️⃣ 🧠 Quiz
6️⃣ 🔢 Adivinhe o Número
7️⃣ 👹 Boss

0️⃣ Sair`
          )

        } else if(['comandos','commands'].includes(cmd)){
          await reply(
`🍀 *ATALHOS DO TREVO*

${prefix}menu — menu principal
${prefix}economia — dinheiro, banco e PIX
${prefix}itens — loja e inventário
${prefix}rpg — batalhas e dungeon
${prefix}games — minigames
${prefix}progressao — missões, casas, carros e patrimônio
${prefix}cla — menu do seu clã
${prefix}grupo — assinatura e status do grupo
${prefix}perfil — seu perfil completo
${prefix}comandos — mostra esta lista

👉 Nos menus, responda apenas com o número.`
          )

        } else if(['ping','p'].includes(cmd)){
          await reply('🍀 Pong! Trevo online e conectado ao Neon.')

        } else if(['saldo','balance','bal'].includes(cmd)){
          const p=await getProfile(sender)
          await reply(`💰 *Saldo*\n\n🪙 Carteira: R$ ${fmt(p.cash)}\n🏦 Banco: R$ ${fmt(p.bank)} / R$ ${fmt(p.bank_limit)}\n📊 Total: R$ ${fmt(Number(p.cash)+Number(p.bank))}`)

        } else if(['perfil','profile'].includes(cmd)){
          const [p,clan,home,cars,pat]=await Promise.all([
            getCombatProfile(sender),
            getClanForUser(sender),
            getHome(sender),
            getGarage(sender),
            getPatrimony(sender)
          ])
          await reply(
`👤 *${p.push_name || 'Jogador'}*

⭐ Nível: ${p.level}
✨ EXP: ${p.exp}
❤️ HP: ${p.hp}/${p.max_hp}
⚔️ ATK: ${p.effective_atk}
🛡️ DEF: ${p.effective_def}
💨 SPD: ${p.spd}

🗡️ Arma: ${p.weapon_name}
🥋 Armadura: ${p.armor_name}
🏴 Clã: ${clan?clan.name:'Nenhum'}
🏠 Casa: ${home?home.name:'Nenhuma'}
🚗 Garagem: ${cars.length}/5

💰 Saldo: R$ ${fmt(Number(p.cash)+Number(p.bank))}
💎 Patrimônio: *R$ ${fmt(pat.total)}*`
          )

        } else if(['daily','diario'].includes(cmd)){
          const r=await claimDaily(sender)
          if(!r.ok) await reply(`⏳ Daily já coletado. Volte em ${duration(r.remaining)}.`)
          else {
            await progressDailyMission(sender,'daily')
            await reply(`🍀 Daily coletado! +R$ ${fmt(r.amount)}`)
          }

        } else if(['trabalhar','work','trampo'].includes(cmd)){
          const r=await work(sender)
          if(!r.ok) await reply(`⏳ Você já trabalhou. Tente novamente em ${duration(r.remaining)}.`)
          else {
            await progressDailyMission(sender,'work')
            await reply(`💼 Você trabalhou como *${r.job}* e ganhou *R$ ${fmt(r.amount)}*.`)
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

        } else if(['loja','shop'].includes(cmd)){
          const items=await getShop()
          const byId=new Map(items.map(i=>[i.id,i]))
          setQuickFlow(chat,sender,'shop_item',{items:SHOP_IDS},90000)
          let text='🍀 *LOJA DO TREVO*\n\n'
          SHOP_IDS.forEach((id,idx)=>{
            const i=byId.get(id)
            if(i) text+=`*${idx+1}.* ${i.name} — R$ ${fmt(i.price)}\n_${i.description}_\n\n`
          })
          text+='👉 *Responda apenas com o número do item.*\n0️⃣ Cancelar'
          await reply(text.trim())

        } else if(['comprar','buy'].includes(cmd)){
          const id=resolveShopItem(args[0])
          const qty=parseInt(args[1]||'1',10)
          if(!id){
            const items=await getShop()
            const byId=new Map(items.map(i=>[i.id,i]))
            setQuickFlow(chat,sender,'shop_item',{items:SHOP_IDS},90000)
            let text='🍀 *O QUE QUER COMPRAR?*\n\n'
            SHOP_IDS.forEach((sid,idx)=>{
              const i=byId.get(sid)
              if(i) text+=`*${idx+1}.* ${i.name} — R$ ${fmt(i.price)}\n`
            })
            text+='\n👉 Responda apenas com o número.\n0️⃣ Cancelar'
            return await reply(text)
          }
          const r=await buyItem(sender,id,qty)
          await progressDailyMission(sender,'shop')
          await reply(`🛒 Compra concluída!\n📦 ${r.item.name} ×${r.qty}\n💸 R$ ${fmt(r.total)}`)

        } else if(cmd==='caixa_sorte'){
          const r=await openLuckyBox(sender)
          if(r.type==='cash') await reply(`🎁 *CAIXA DA SORTE*\n💰 Você encontrou *R$ ${fmt(r.cash)}*!`)
          else if(r.type==='exp') await reply(`🎁 *CAIXA DA SORTE*\n✨ Você recebeu *+${r.exp} EXP*!\n⭐ Nível atual: ${r.level.level}`)
          else if(r.type==='rare') await reply(`🌟 *PRÊMIO RARO!*\nVocê recebeu *${r.name}* ×${r.qty}!`)
          else await reply(`🎁 *CAIXA DA SORTE*\nVocê recebeu *${r.name}* ×${r.qty}!`)

        } else if(SHOP_IDS.includes(cmd) && cmd!=='caixa_sorte'){
          const r=await buyItem(sender,cmd,1)
          await progressDailyMission(sender,'shop')
          await reply(`🛒 Compra rápida concluída!\n📦 ${r.item.name} ×1\n💸 R$ ${fmt(r.total)}`)

        } else if(['inventario','inventory','inv'].includes(cmd)){
          const items=await getInventory(sender)
          if(!items.length) return await reply('🎒 Seu inventário está vazio.')
          let text='🎒 *SEU INVENTÁRIO*\n\n'
          items.forEach((i,idx)=>{
            const action=['weapon','armor'].includes(i.category)
              ? '⚙️ Equipável'
              : i.category==='consumable'
                ? '🧪 Utilizável'
                : i.item_id==='caixa_sorte'
                  ? '🎁 Abrível'
                  : '📦 Item'
            text+=`*${idx+1}.* ${i.name} ×${i.quantity} _[${i.rarity}]_\n   ${action}\n`
          })
          text+=`\n⚙️ Para escolher equipamento: *${prefix}equipar*\n🧪 Para usar poção: *${prefix}usar*`
          if(items.some(i=>i.item_id==='caixa_sorte')) text+=`\n🎁 Caixa da Sorte pode ser aberta.`
          text+='\n\n👉 *Responda com o número do item* para escolher o que fazer.\n0️⃣ Sair'
          setQuickFlow(chat,sender,'inventory_select',{items},90000)
          await reply(text.trim())

        } else if(['equipar','equip'].includes(cmd)){
          const items=await getInventory(sender)
          const equipables=items.filter(i=>['weapon','armor'].includes(i.category))
          if(!equipables.length) return await reply('⚙️ Você não possui arma ou armadura para equipar.')

          const query=args.join(' ').trim()
          if(!query){
            setQuickFlow(chat,sender,'equip_select',{items:equipables.map(i=>i.item_id)},90000)
            let text='⚙️ *O QUE QUER EQUIPAR?*\n\n'
            equipables.forEach((i,idx)=>{
              const icon=i.category==='weapon'?'⚔️':'🛡️'
              text+=`*${idx+1}.* ${icon} ${i.name}\n`
            })
            text+='\n👉 Responda apenas com o número.\n0️⃣ Cancelar'
            return await reply(text)
          }

          const anyItem=resolveOwnedItem(items,query)
          if(anyItem && !['weapon','armor'].includes(anyItem.category)){
            if(anyItem.item_id==='caixa_sorte'){
              return await reply(`🎁 *${anyItem.name}* não é equipamento.\nUse *${prefix}caixa_sorte* para abrir.`)
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
          if(!target){
            setQuickFlow(chat,sender,'battle_target',{},90000)
            return await reply('⚔️ Marque agora a pessoa que você quer desafiar.')
          }
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
          const rows=await leaderboard(10)
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
          let text='🏠 *IMÓVEIS DO TREVO*\n\n'
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
          let text='🚗 *CONCESSIONÁRIA DO TREVO*\n\n'
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

        } else if(['games','jogos'].includes(cmd)){
          setQuickFlow(chat,sender,'main',{},90000)
          await reply(
`🎮 *MINIGAMES DO TREVO*

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
          const amount=parseAmount(args[0])
          const choice=(args[1]||'').toLowerCase()
          if(!amount||!choice) return await reply(`Uso: *${prefix}roleta 100 vermelho*\nCores: vermelho, preto ou verde`)
          const r=await roulette(sender,amount,choice)
          const result=r.payout>0
            ? `🎉 Você ganhou R$ ${fmt(r.payout)}! Lucro: R$ ${fmt(r.profit)}`
            : `💸 Você perdeu R$ ${fmt(r.amount)}.`
          await progressDailyMission(sender,'game')
          await reply(`🎰 *ROLETA*\n\nNúmero: *${r.number}*\nCor: *${r.color}*\nSua escolha: *${r.choice}*\n\n${result}`)

        } else if(['cara','coroa'].includes(cmd)){
          const choice=cmd
          const amount=parseAmount(args[0])
          if(!amount) return await reply(`Uso: *${prefix}${choice} 100*`)
          const r=await coinFlip(sender,amount,choice)
          await progressDailyMission(sender,'game')
          await reply(`🪙 *CARA OU COROA*\n\nResultado: *${r.result}*\nVocê escolheu: *${r.choice}*\n${r.payout>0?`🎉 Ganhou R$ ${fmt(r.payout)}!`:`💸 Perdeu R$ ${fmt(r.amount)}.`}`)

        } else if(['ppt'].includes(cmd)){
          const choice=(args[0]||'').toLowerCase()
          if(!choice) return await reply(`Uso: *${prefix}ppt pedra*\nOpções: pedra, papel ou tesoura`)
          const r=rps(choice)
          const emoji=r.result==='vitoria'?'🏆':r.result==='empate'?'🤝':'💀'
          await progressDailyMission(sender,'game')
          await reply(`✊ *PEDRA, PAPEL E TESOURA*\n\nVocê: *${r.choice}*\nTrevo: *${r.bot}*\n\n${emoji} *${r.result.toUpperCase()}*`)

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
          setQuickFlow(chat,sender,'nav_main',{},90000)
          await reply(
`🍀 *TREVO — MENU PRINCIPAL*

1️⃣ 👤 Meu perfil
2️⃣ 💰 Economia
3️⃣ 🛒 Itens e inventário
4️⃣ ⚔️ RPG
5️⃣ 🎮 Minigames
6️⃣ 📋 Progressão
7️⃣ 🏴 Clãs
8️⃣ 💚 Grupo / assinatura

👉 *Responda apenas com o número.*
Você não precisa usar ! enquanto estiver no menu.

0️⃣ Sair

_Se preferir, os comandos antigos continuam funcionando._`
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
