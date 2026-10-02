import { db, ensureUser, getEquipmentInfo, grantExpInTransaction } from './db.js'

async function tx(fn){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    const out=await fn(c)
    await c.query('COMMIT')
    return out
  }catch(err){
    await c.query('ROLLBACK')
    throw err
  }finally{
    c.release()
  }
}

export async function initGames(){
  await db.query(`
    CREATE TABLE IF NOT EXISTS trevo_games(
      chat_jid TEXT NOT NULL,
      game_type TEXT NOT NULL,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      PRIMARY KEY(chat_jid,game_type)
    )
  `)
}

async function loadGame(client,chat,type){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`trevo-game:${chat}:${type}`])
  const r=await client.query(
    'SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2 FOR UPDATE',
    [chat,type]
  )
  return r.rows[0]?.state || null
}

async function saveGame(client,chat,type,state){
  await client.query(`
    INSERT INTO trevo_games(chat_jid,game_type,state,updated_at)
    VALUES($1,$2,$3::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
    ON CONFLICT(chat_jid,game_type)
    DO UPDATE SET state=EXCLUDED.state,updated_at=EXCLUDED.updated_at
  `,[chat,type,JSON.stringify(state)])
}

async function clearGame(client,chat,type){
  await client.query('DELETE FROM trevo_games WHERE chat_jid=$1 AND game_type=$2',[chat,type])
}

async function debit(client,jid,amount){
  const r=await client.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
  const cash=Number(r.rows[0]?.cash||0)
  if(cash<amount) throw new Error('Saldo insuficiente.')
  await client.query('UPDATE wallets SET cash=cash-$1 WHERE jid=$2',[amount,jid])
}

async function credit(client,jid,amount,note){
  await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[amount,jid])
  await client.query(`
    INSERT INTO transactions(from_jid,to_jid,amount,type,note)
    VALUES('system',$1,$2,'minigame',$3)
  `,[jid,amount,note])
}

export async function roulette(jid,amount,choice){
  amount=Number(amount)
  choice=String(choice||'').toLowerCase()
  if(!Number.isInteger(amount)||amount<10) throw new Error('Aposta mínima: R$ 10.')
  if(!['vermelho','preto','verde'].includes(choice)) throw new Error('Escolha vermelho, preto ou verde.')
  await ensureUser(jid)

  return tx(async c=>{
    await debit(c,jid,amount)
    const n=Math.floor(Math.random()*37)
    const redNumbers=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
    const color=n===0?'verde':(redNumbers.has(n)?'vermelho':'preto')
    let payout=0
    if(choice===color) payout=choice==='verde'?amount*36:amount*2
    if(payout) await credit(c,jid,payout,'roleta')
    return {number:n,color,choice,amount,payout,profit:payout-amount}
  })
}

export async function createGroupRoulette(chat,host,amount,choice){
  amount=Number(amount); choice=String(choice||'').toLowerCase()
  if(!Number.isInteger(amount)||amount<10) throw new Error('Aposta mínima: R$ 10.')
  if(!['vermelho','preto','verde'].includes(choice)) throw new Error('Escolha vermelho, preto ou verde.')
  await ensureUser(host)
  return tx(async c=>{
    const old=await loadGame(c,chat,'roulette_group')
    if(old && Number(old.expiresAt||0)>Date.now()) throw new Error('Já existe uma roleta coletiva aberta neste grupo.')
    await debit(c,host,amount)
    const state={host,players:{[host]:{amount,choice}},expiresAt:Date.now()+120000}
    await saveGame(c,chat,'roulette_group',state)
    return state
  })
}

export async function joinGroupRoulette(chat,jid,amount,choice){
  amount=Number(amount); choice=String(choice||'').toLowerCase()
  if(!Number.isInteger(amount)||amount<10) throw new Error('Aposta mínima: R$ 10.')
  if(!['vermelho','preto','verde'].includes(choice)) throw new Error('Escolha vermelho, preto ou verde.')
  await ensureUser(jid)
  return tx(async c=>{
    const state=await loadGame(c,chat,'roulette_group')
    if(!state || Number(state.expiresAt||0)<Date.now()) throw new Error('Não existe roleta coletiva aberta.')
    if(state.players?.[jid]) throw new Error('Você já entrou nesta rodada.')
    await debit(c,jid,amount)
    state.players={...(state.players||{}),[jid]:{amount,choice}}
    await saveGame(c,chat,'roulette_group',state)
    return state
  })
}

export async function spinGroupRoulette(chat,jid){
  return tx(async c=>{
    const state=await loadGame(c,chat,'roulette_group')
    if(!state) throw new Error('Não existe roleta coletiva aberta.')
    if(state.host!==jid) throw new Error('Só quem abriu a roleta pode girar.')
    const n=Math.floor(Math.random()*37)
    const reds=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
    const color=n===0?'verde':(reds.has(n)?'vermelho':'preto')
    const results=[]
    for(const [player,bet] of Object.entries(state.players||{})){
      const payout=bet.choice===color?(bet.choice==='verde'?Number(bet.amount)*36:Number(bet.amount)*2):0
      if(payout) await credit(c,player,payout,'roleta-coletiva')
      results.push({jid:player,amount:Number(bet.amount),choice:bet.choice,payout})
    }
    await clearGame(c,chat,'roulette_group')
    return {number:n,color,results}
  })
}

export async function coinFlip(jid,amount,choice){
  amount=Number(amount)
  choice=String(choice||'').toLowerCase()
  if(!Number.isInteger(amount)||amount<10) throw new Error('Aposta mínima: R$ 10.')
  if(!['cara','coroa'].includes(choice)) throw new Error('Escolha cara ou coroa.')
  await ensureUser(jid)

  return tx(async c=>{
    await debit(c,jid,amount)
    const result=Math.random()<0.5?'cara':'coroa'
    const payout=result===choice?amount*2:0
    if(payout) await credit(c,jid,payout,'cara-ou-coroa')
    return {result,choice,amount,payout,profit:payout-amount}
  })
}

export async function createCoinDuel(chat,challenger,target,amount,choice){
  amount=Number(amount); choice=String(choice||'').toLowerCase()
  if(!Number.isInteger(amount)||amount<10) throw new Error('Aposta mínima: R$ 10.')
  if(!['cara','coroa'].includes(choice)) throw new Error('Escolha cara ou coroa.')
  if(!target || target===challenger) throw new Error('Marque outra pessoa para desafiar.')
  await ensureUser(challenger); await ensureUser(target)
  return tx(async c=>{
    await debit(c,challenger,amount)
    const type='coin_duel:'+target
    const old=await loadGame(c,chat,type)
    if(old && Number(old.expiresAt||0)>Date.now()) throw new Error('Essa pessoa já tem um desafio pendente neste grupo.')
    const state={challenger,target,amount,choice,expiresAt:Date.now()+120000}
    await saveGame(c,chat,type,state)
    return state
  })
}

export async function acceptCoinDuel(chat,target){
  return tx(async c=>{
    const type='coin_duel:'+target
    const state=await loadGame(c,chat,type)
    if(!state) throw new Error('Você não tem desafio de cara ou coroa pendente.')
    if(Number(state.expiresAt||0)<Date.now()){
      await credit(c,state.challenger,Number(state.amount),'cara-ou-coroa-pvp-estorno')
      await clearGame(c,chat,type)
      throw new Error('O desafio expirou. A aposta foi devolvida.')
    }
    await debit(c,target,Number(state.amount))
    const result=Math.random()<0.5?'cara':'coroa'
    const winner=result===state.choice?state.challenger:target
    await credit(c,winner,Number(state.amount)*2,'cara-ou-coroa-pvp')
    await clearGame(c,chat,type)
    return {...state,result,winner,pot:Number(state.amount)*2}
  })
}

export async function createRpsDuel(chat,challenger,target,amount,choice){
  amount=Number(amount); choice=String(choice||'').toLowerCase()
  if(!Number.isInteger(amount)||amount<10) throw new Error('Aposta mínima: R$ 10.')
  if(!['pedra','papel','tesoura'].includes(choice)) throw new Error('Escolha pedra, papel ou tesoura.')
  if(!target||target===challenger) throw new Error('Marque outra pessoa para desafiar.')
  await ensureUser(challenger); await ensureUser(target)
  return tx(async c=>{
    const old=await loadGame(c,chat,'rps_duel:'+target)
    if(old&&Number(old.expiresAt||0)>Date.now()) throw new Error('Essa pessoa já tem um desafio de PPT pendente.')
    await debit(c,challenger,amount)
    const state={challenger,target,amount,choice,expiresAt:Date.now()+120000}
    await saveGame(c,chat,'rps_duel:'+target,state); return state
  })
}
export async function acceptRpsDuel(chat,target,choice){
  choice=String(choice||'').toLowerCase(); if(!['pedra','papel','tesoura'].includes(choice)) throw new Error('Use !aceitarppt pedra, papel ou tesoura.')
  return tx(async c=>{
    const type='rps_duel:'+target,s=await loadGame(c,chat,type); if(!s) throw new Error('Você não tem desafio de PPT pendente.')
    if(Number(s.expiresAt||0)<Date.now()){await credit(c,s.challenger,Number(s.amount),'ppt-pvp-estorno');await clearGame(c,chat,type);throw new Error('O desafio expirou. A aposta foi devolvida.')}
    await debit(c,target,Number(s.amount)); const a=s.choice,b=choice
    let winner=null; if(a!==b) winner=((a==='pedra'&&b==='tesoura')||(a==='papel'&&b==='pedra')||(a==='tesoura'&&b==='papel'))?s.challenger:target
    if(winner) await credit(c,winner,Number(s.amount)*2,'ppt-pvp'); else {await credit(c,s.challenger,Number(s.amount),'ppt-pvp-empate');await credit(c,target,Number(s.amount),'ppt-pvp-empate')}
    await clearGame(c,chat,type); return {...s,targetChoice:b,winner,pot:Number(s.amount)*2}
  })
}

export async function createTournament(chat,host,amount){
  amount=Number(amount); if(!Number.isInteger(amount)||amount<0) throw new Error('Valor inválido.')
  await ensureUser(host)
  return tx(async c=>{const old=await loadGame(c,chat,'tournament');if(old&&Number(old.expiresAt||0)>Date.now())throw new Error('Já existe um torneio aberto neste grupo.');if(amount)await debit(c,host,amount);const st={host,amount,players:[host],started:false,expiresAt:Date.now()+5*60*1000};await saveGame(c,chat,'tournament',st);return st})
}
export async function joinTournament(chat,jid){
  await ensureUser(jid); return tx(async c=>{const s=await loadGame(c,chat,'tournament');if(!s||s.started||Number(s.expiresAt||0)<Date.now())throw new Error('Não existe torneio aberto.');if(s.players.includes(jid))return s;if(s.amount)await debit(c,jid,Number(s.amount));s.players.push(jid);await saveGame(c,chat,'tournament',s);return s})
}
export async function startTournament(chat,jid){
  return tx(async c=>{const s=await loadGame(c,chat,'tournament');if(!s)throw new Error('Não existe torneio aberto.');if(s.host!==jid)throw new Error('Só quem criou pode iniciar.');if(s.players.length<2)throw new Error('É preciso pelo menos 2 jogadores.');const shuffled=[...s.players].sort(()=>Math.random()-.5);const winner=shuffled[Math.floor(Math.random()*shuffled.length)],pot=Number(s.amount)*s.players.length;if(pot)await credit(c,winner,pot,'torneio');await clearGame(c,chat,'tournament');return {winner,pot,players:s.players}})
}

export function rps(choice){
  const valid=['pedra','papel','tesoura']
  choice=String(choice||'').toLowerCase()
  if(!valid.includes(choice)) throw new Error('Escolha pedra, papel ou tesoura.')
  const bot=valid[Math.floor(Math.random()*3)]
  const win=(choice==='pedra'&&bot==='tesoura')||(choice==='papel'&&bot==='pedra')||(choice==='tesoura'&&bot==='papel')
  return {choice,bot,result:choice===bot?'empate':win?'vitoria':'derrota'}
}

const HANG_WORDS=[
  ['abacaxi','fruta tropical'],
  ['computador','tecnologia'],
  ['futebol','esporte'],
  ['dinossauro','animal extinto'],
  ['chocolate','doce'],
  ['bicicleta','transporte'],
  ['planeta','espaço'],
  ['vampiro','criatura'],
  ['tempestade','clima'],
  ['biblioteca','livros']
]

function maskWord(word,letters){
  return [...word].map(ch=>letters.includes(ch)?ch:'_').join(' ')
}

export async function startHangman(chat){
  return tx(async c=>{
    const current=await loadGame(c,chat,'forca')
    if(current && !current.finished) return {already:true,...current}
    const [word,hint]=HANG_WORDS[Math.floor(Math.random()*HANG_WORDS.length)]
    const state={word,hint,letters:[],wrong:[],lives:6,finished:false}
    await saveGame(c,chat,'forca',state)
    return state
  })
}

export async function hangmanLetter(chat,letter){
  letter=String(letter||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').slice(0,1)
  if(!/^[a-z]$/.test(letter)) throw new Error('Envie uma letra de A a Z.')
  return tx(async c=>{
    const s=await loadGame(c,chat,'forca')
    if(!s||s.finished) throw new Error('Não há uma forca ativa. Use !forca.')
    if(s.letters.includes(letter)||s.wrong.includes(letter)) return {repeat:true,...s,masked:maskWord(s.word,s.letters)}
    if(s.word.includes(letter)) s.letters.push(letter)
    else {s.wrong.push(letter);s.lives--}
    const won=[...new Set(s.word)].every(ch=>s.letters.includes(ch))
    const lost=s.lives<=0
    s.finished=won||lost
    if(s.finished) await clearGame(c,chat,'forca')
    else await saveGame(c,chat,'forca',s)
    return {...s,won,lost,masked:maskWord(s.word,s.letters)}
  })
}

export async function hangmanWord(chat,guess){
  guess=String(guess||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  return tx(async c=>{
    const s=await loadGame(c,chat,'forca')
    if(!s||s.finished) throw new Error('Não há uma forca ativa. Use !forca.')
    const won=guess===s.word
    if(won){s.finished=true;await clearGame(c,chat,'forca')}
    else{s.lives--; if(s.lives<=0){s.finished=true;await clearGame(c,chat,'forca')} else await saveGame(c,chat,'forca',s)}
    return {...s,won,lost:!won&&s.lives<=0,masked:won?s.word:maskWord(s.word,s.letters)}
  })
}

const QUIZZES=[
  {q:"Qual é o maior planeta do Sistema Solar?",a:["Terra","Saturno","Júpiter","Netuno"],c:3},
  {q:"Qual oceano é o maior do planeta?",a:["Atlântico","Índico","Pacífico","Ártico"],c:3},
  {q:"Qual é a capital da Argentina?",a:["Santiago","Buenos Aires","Montevidéu","Lima"],c:2},
  {q:"Quantos lados tem um octógono?",a:["6","7","8","9"],c:3},
  {q:"Quanto é 12 × 9?",a:["96","108","118","128"],c:2},
  {q:"Qual elemento químico tem símbolo O?",a:["Ouro","Oxigênio","Ósmio","Prata"],c:2},
  {q:"Quem pintou a Mona Lisa?",a:["Michelangelo","Leonardo da Vinci","Van Gogh","Picasso"],c:2},
  {q:"Em que país ficam as pirâmides de Gizé?",a:["México","Egito","Peru","Índia"],c:2},
  {q:"Qual é o maior animal terrestre?",a:["Rinoceronte","Elefante-africano","Hipopótamo","Girafa"],c:2},
  {q:"Qual planeta possui os anéis mais visíveis?",a:["Marte","Saturno","Mercúrio","Vênus"],c:2},
  {q:"Quantos minutos há em 3 horas?",a:["120","150","180","210"],c:3},
  {q:"Qual é a capital da França?",a:["Roma","Madri","Paris","Lisboa"],c:3},
  {q:"Qual órgão bombeia sangue pelo corpo?",a:["Pulmão","Fígado","Coração","Rim"],c:3},
  {q:"Qual é o idioma oficial do Brasil?",a:["Espanhol","Português","Inglês","Francês"],c:2},
  {q:"Quanto é 144 ÷ 12?",a:["10","11","12","14"],c:3},
  {q:"Qual destes é um mamífero?",a:["Tubarão","Golfinho","Polvo","Pinguim"],c:2},
  {q:"Qual país sediou a Copa do Mundo de 2014?",a:["Brasil","Alemanha","Rússia","África do Sul"],c:1},
  {q:"Qual é a moeda oficial do Japão?",a:["Won","Yuan","Iene","Dólar"],c:3},
  {q:"Quantos estados tem o Brasil?",a:["25","26","27","28"],c:2},
  {q:"Qual é a capital do estado de São Paulo?",a:["Campinas","Santos","São Paulo","Sorocaba"],c:3},
  {q:"Que gás é mais abundante na atmosfera terrestre?",a:["Oxigênio","Nitrogênio","Hélio","Hidrogênio"],c:2},
  {q:"Qual é o maior órgão do corpo humano?",a:["Fígado","Cérebro","Pele","Pulmão"],c:3},
  {q:"Qual metal é líquido próximo da temperatura ambiente?",a:["Ferro","Mercúrio","Alumínio","Cobre"],c:2},
  {q:"Qual é a raiz quadrada de 81?",a:["7","8","9","10"],c:3},
  {q:"Qual país tem formato frequentemente comparado a uma bota?",a:["Portugal","Itália","Grécia","Croácia"],c:2},
  {q:"Quem escreveu Dom Casmurro?",a:["Machado de Assis","José de Alencar","Carlos Drummond","Jorge Amado"],c:1},
  {q:"Qual é o satélite natural da Terra?",a:["Sol","Lua","Marte","Vênus"],c:2},
  {q:"Qual instrumento mede a temperatura?",a:["Barômetro","Termômetro","Higrômetro","Altímetro"],c:2},
  {q:"Quantos segundos há em 5 minutos?",a:["250","300","350","500"],c:2},
  {q:"Qual é a capital de Minas Gerais?",a:["Uberlândia","Ouro Preto","Belo Horizonte","Juiz de Fora"],c:3},
  {q:"Qual destes animais é uma ave?",a:["Morcego","Avestruz","Baleia","Ornitorrinco"],c:2},
  {q:"Em qual esporte se usa uma cesta e uma bola?",a:["Vôlei","Basquete","Tênis","Golfe"],c:2},
  {q:"Qual é o resultado de 15 + 27?",a:["40","41","42","43"],c:3},
  {q:"Qual camada protege a Terra de grande parte da radiação ultravioleta?",a:["Camada de ozônio","Núcleo","Manto","Troposfera"],c:1},
  {q:"Qual é a capital do Canadá?",a:["Toronto","Vancouver","Ottawa","Montreal"],c:3},
  {q:"Qual continente contém o Brasil?",a:["América do Sul","Europa","Ásia","África"],c:1},
  {q:"Qual é o processo pelo qual plantas produzem alimento usando luz?",a:["Respiração","Fotossíntese","Fermentação","Digestão"],c:2},
  {q:"Qual é o número primo entre estes?",a:["21","27","29","33"],c:3},
  {q:"Qual país é conhecido pela Torre Eiffel?",a:["Itália","França","Bélgica","Suíça"],c:2},
  {q:"Quantos dias tem um ano comum?",a:["360","364","365","366"],c:3},
  {q:"Qual é a capital da Bahia?",a:["Salvador","Recife","Fortaleza","Maceió"],c:1},
  {q:"Qual destes é um réptil?",a:["Sapo","Cobra","Atum","Águia"],c:2},
  {q:"Quanto é 25% de 200?",a:["25","40","50","75"],c:3},
  {q:"Qual cientista é associado às leis do movimento e gravitação clássica?",a:["Newton","Darwin","Pasteur","Mendel"],c:1},
  {q:"Qual é a capital da Alemanha?",a:["Munique","Berlim","Hamburgo","Frankfurt"],c:2},
  {q:"Qual planeta é o mais próximo do Sol?",a:["Vênus","Terra","Mercúrio","Marte"],c:3},
  {q:"Qual é o plural de 'cidadão' mais comum no português padrão?",a:["cidadões","cidadãos","cidadães","cidadans"],c:2},
  {q:"Qual destes números é par?",a:["37","51","64","79"],c:3},
  {q:"Em qual continente fica a Austrália?",a:["Oceania","Ásia","Europa","América"],c:1},
  {q:"Qual é a fórmula química da água?",a:["CO2","O2","H2O","NaCl"],c:3},
  {q:"Qual é a capital de Pernambuco?",a:["Natal","Recife","João Pessoa","Aracaju"],c:2},
  {q:"Quantos meses têm 31 dias?",a:["5","6","7","8"],c:3},
  {q:"Qual é o maior osso do corpo humano?",a:["Fêmur","Tíbia","Úmero","Rádio"],c:1},
  {q:"Qual país é famoso pelas ruínas de Machu Picchu?",a:["Chile","Bolívia","Peru","Equador"],c:3},
  {q:"Quanto é 11²?",a:["111","121","131","141"],c:2},
  {q:"Qual é a capital da Itália?",a:["Milão","Roma","Nápoles","Turim"],c:2},
  {q:"Qual animal passa por metamorfose de lagarta para adulto?",a:["Abelha","Borboleta","Aranha","Minhoca"],c:2},
  {q:"Qual é a unidade básica de informação digital?",a:["Byte","Bit","Pixel","Hertz"],c:2},
  {q:"Qual é a capital do Ceará?",a:["Fortaleza","Teresina","Natal","Belém"],c:1},
  {q:"Qual destes é um planeta anão?",a:["Plutão","Europa","Titã","Lua"],c:1}
]

export async function startQuiz(chat){
  return tx(async c=>{
    const current=await loadGame(c,chat,'quiz')
    const now=Date.now()
    const ttl=2*60*1000
    if(current && !current.finished && now-Number(current.started||0)<ttl){
      return {already:true,...current,remaining:Math.ceil((ttl-(now-Number(current.started||0)))/1000)}
    }
    const recent=Array.isArray(current?.recentQuestions)?current.recentQuestions:[]
    const pool=QUIZZES.filter(x=>!recent.includes(x.q))
    const item=(pool.length?pool:QUIZZES)[Math.floor(Math.random()*(pool.length?pool.length:QUIZZES.length))]
    const state={...item,started:now,recentQuestions:[...recent,item.q].slice(-15)}
    await saveGame(c,chat,'quiz',state)
    return state
  })
}

export async function answerQuiz(chat,jid,answer){
  answer=Number(answer)
  if(![1,2,3,4].includes(answer)) throw new Error('Responda com 1, 2, 3 ou 4.')
  await ensureUser(jid)
  return tx(async c=>{
    const s=await loadGame(c,chat,'quiz')
    if(!s || s.finished) throw new Error('Não há quiz ativo. Use !quiz.')
    const expired=Date.now()-Number(s.started||0)>=2*60*1000
    if(expired){
      await saveGame(c,chat,'quiz',{...s,finished:true,answeredAt:Date.now()})
      throw new Error('Esse quiz expirou. Use !quiz para iniciar outro.')
    }
    await saveGame(c,chat,'quiz',{...s,finished:true,answeredAt:Date.now()})
    const correct=answer===Number(s.c)
    const reward=correct?1000:0
    if(reward) await credit(c,jid,reward,'quiz')
    return {correct,reward,correctAnswer:s.c,correctText:s.a[s.c-1]}
  })
}

export async function startNumberGame(chat){
  return tx(async c=>{
    const current=await loadGame(c,chat,'numero')
    if(current) return {already:true,...current}
    const state={number:1+Math.floor(Math.random()*100),attempts:0,max:10}
    await saveGame(c,chat,'numero',state)
    return state
  })
}

export async function guessNumber(chat,jid,guess){
  guess=Number(guess)
  if(!Number.isInteger(guess)||guess<1||guess>100) throw new Error('Escolha um número de 1 a 100.')
  await ensureUser(jid)
  return tx(async c=>{
    const s=await loadGame(c,chat,'numero')
    if(!s) throw new Error('Não há jogo ativo. Use !numero.')
    s.attempts++
    if(guess===Number(s.number)){
      await clearGame(c,chat,'numero')
      const reward=Math.max(300,1500-(s.attempts-1)*100)
      await credit(c,jid,reward,'adivinhar-numero')
      return {won:true,reward,attempts:s.attempts,number:s.number}
    }
    if(s.attempts>=s.max){
      await clearGame(c,chat,'numero')
      return {lost:true,number:s.number,attempts:s.attempts}
    }
    await saveGame(c,chat,'numero',s)
    return {won:false,hint:guess<s.number?'maior':'menor',attempts:s.attempts,left:s.max-s.attempts}
  })
}

function bossWeekendInfo(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'
  }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
  const open=parts.weekday==='Fri'||parts.weekday==='Sat'
  const localDate=`${parts.year}-${parts.month}-${parts.day}`
  const base=new Date(`${localDate}T12:00:00-03:00`)
  const friday=new Date(base)
  friday.setUTCDate(base.getUTCDate()+(parts.weekday==='Sat'?-1:0))
  const fy=friday.getUTCFullYear(),fm=String(friday.getUTCMonth()+1).padStart(2,'0'),fd=String(friday.getUTCDate()).padStart(2,'0')
  const fridayKey=`${fy}-${fm}-${fd}`
  const saturday=new Date(friday); saturday.setUTCDate(friday.getUTCDate()+1)
  const sy=saturday.getUTCFullYear(),sm=String(saturday.getUTCMonth()+1).padStart(2,'0'),sd=String(saturday.getUTCDate()).padStart(2,'0')
  const endsAt=Date.parse(`${sy}-${sm}-${sd}T23:59:59.999-03:00`)
  return {open,weekendKey:fridayKey,endsAt,endsLabel:`${sd}/${sm}/${sy} às 23:59`}
}
function bossWeekendOpen(){ return bossWeekendInfo().open }
const BOSS_BONUS_DROPS=[
  {id:'pocao_g',name:'Poção Grande',weight:42,rarity:'Raro'},
  {id:'elixir_supremo',name:'Elixir Supremo',weight:24,rarity:'Épico'},
  {id:'lamina_abissal',name:'Lâmina Abissal',weight:12,rarity:'Épico'},
  {id:'armadura_abissal',name:'Armadura Abissal',weight:12,rarity:'Épico'},
  {id:'excalibur',name:'Excalibur',weight:5,rarity:'Lendário'},
  {id:'armadura_titan',name:'Armadura do Titã',weight:5,rarity:'Lendário'},
]
const BOSS_PLACEMENT=[
  {cash:40000,xp:400,box:{id:'caixa_epica',name:'Caixa Épica',rarity:'Épico'},bonusChance:.75,exclusiveChance:.30},
  {cash:25000,xp:280,box:{id:'caixa_epica',name:'Caixa Épica',rarity:'Épico'},bonusChance:.60,exclusiveChance:.18},
  {cash:15000,xp:180,box:{id:'caixa_rara',name:'Caixa Rara',rarity:'Raro'},bonusChance:.48,exclusiveChance:.12},
  {cash:8000,xp:100,box:{id:'caixa_rara',name:'Caixa Rara',rarity:'Raro'},bonusChance:.35,exclusiveChance:.07},
  {cash:4000,xp:50,box:{id:'caixa_sorte',name:'Caixa da Sorte',rarity:'Comum'},bonusChance:.28,exclusiveChance:.04},
]
const PET_BOSS_SPECIALTIES={
  cachorro:{label:'🐶 Guardião',defense:.05}, gato:{label:'🐱 Instinto',crit:.04},
  coelho:{label:'🐰 Agilidade',dodge:.04}, papagaio:{label:'🦜 Motivação',xp:.05},
  hamster:{label:'🐹 Sorte',drop:.025}, tartaruga:{label:'🐢 Casco',defense:.07},
  coruja:{label:'🦉 Sabedoria',xp:.08}, raposa:{label:'🦊 Astúcia',crit:.06},
  lobo:{label:'🐺 Caçador',damage:.06}, aguia:{label:'🦅 Precisão',crit:.07},
  panda:{label:'🐼 Resistência',defense:.08}, tigre:{label:'🐯 Fúria',damage:.07},
  leao:{label:'🦁 Rei da Caçada',damage:.08}, unicornio:{label:'🦄 Bênção',drop:.04,defense:.04},
  dragao:{label:'🐉 Caçador de Boss',bossDamage:.10}
}
function petBossBonus(pet){
  if(!pet) return {label:null,damage:0,defense:0,crit:0,dodge:0,xp:0,drop:0}
  const base=PET_BOSS_SPECIALTIES[pet.species]||{}
  // O nível melhora o efeito devagar e para em +25%; pet ajuda, mas não substitui equipamento.
  const scale=1+Math.min(.25,Math.max(0,Number(pet.level||1)-1)*.01)
  const scaled=k=>Math.min(.10,Number(base[k]||0)*scale)
  return {label:base.label||pet.species,damage:scaled('damage')+scaled('bossDamage'),defense:scaled('defense'),crit:scaled('crit'),dodge:scaled('dodge'),xp:scaled('xp'),drop:scaled('drop')}
}
async function grantBossItem(c,jid,item){
  await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
    ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1`,[jid,item.id])
  return item
}
async function giveBossDrops(c,jid,position,extraChance=0){
  const tier=BOSS_PLACEMENT[position-1]||{cash:0,xp:0,box:null,bonusChance:.18,exclusiveChance:.02}
  const drops=[]
  // Top 5 recebe caixa garantida; demais continuam com 40% de chance de Caixa da Sorte.
  const box=tier.box||(Math.random()<.40?{id:'caixa_sorte',name:'Caixa da Sorte',rarity:'Comum'}:null)
  if(box) drops.push(await grantBossItem(c,jid,box))
  const luck=Math.min(.08,Math.max(0,extraChance))
  if(Math.random()<tier.exclusiveChance+luck){
    const exclusive=Math.random()<.5
      ? {id:'armadura_golem',name:'Armadura do Golem Ancestral',rarity:'Lendário'}
      : {id:'martelo_golem',name:'Martelo do Golem Ancestral',rarity:'Lendário'}
    drops.push(await grantBossItem(c,jid,exclusive))
  }
  if(Math.random()<tier.bonusChance+luck){
    const total=BOSS_BONUS_DROPS.reduce((sum,d)=>sum+d.weight,0)
    let roll=Math.random()*total,chosen=BOSS_BONUS_DROPS[0]
    for(const item of BOSS_BONUS_DROPS){roll-=item.weight;if(roll<=0){chosen=item;break}}
    drops.push(await grantBossItem(c,jid,chosen))
  }
  return drops
}
export async function startBoss(chat){
  const weekend=bossWeekendInfo()
  if(!weekend.open) throw new Error('O Boss do Grupo fica disponível de sexta 00:00 até sábado 23:59 (horário de São Paulo).')
  return tx(async c=>{
    const current=await loadGame(c,chat,'boss')
    const currentIsValid=current && Number(current.hp)>0 && Number(current.maxHp)>=25000 &&
      current.weekendKey===weekend.weekendKey && Number(current.endsAt||0)>Date.now()
    if(currentIsValid) return {already:true,...current,endsLabel:weekend.endsLabel}
    if(current) await clearGame(c,chat,'boss')
    const maxHp=25000+Math.floor(Math.random()*10001)
    const state={name:'Golem Ancestral do Alpha',hp:maxHp,maxHp,atk:18,participants:{},startedAt:Date.now(),weekendKey:weekend.weekendKey,endsAt:weekend.endsAt,endsLabel:weekend.endsLabel}
    await saveGame(c,chat,'boss',state); return state
  })
}
export async function attackBoss(chat,jid,name,usePet=true){
  await ensureUser(jid,name||'')
  const weekend=bossWeekendInfo()
  if(!weekend.open) throw new Error('O Boss do Grupo encerrou. Ele volta sexta-feira às 00:00 (horário de São Paulo).')
  return tx(async c=>{
    const s=await loadGame(c,chat,'boss')
    if(!s||Number(s.hp)<=0||Number(s.maxHp)<25000||s.weekendKey!==weekend.weekendKey||Number(s.endsAt||0)<=Date.now()) throw new Error('Não há Boss de Grupo ativo. Use !boss para iniciar o Boss deste fim de semana.')
    const st=(await c.query('SELECT hp,max_hp,atk,def,weapon_id,armor_id FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(st?.hp||0)<=0) return {playerDead:true,hp:Number(s.hp),maxHp:Number(s.maxHp)}
    let pet=usePet?(await c.query('SELECT species,name,level,energy FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]||null:null
    const petUnavailable=Boolean(usePet&&pet&&Number(pet.energy)<2)
    if(petUnavailable) pet=null
    if(pet){
      pet.energy=Number(pet.energy)-2
      await c.query('UPDATE pets SET energy=$1 WHERE jid=$2',[pet.energy,jid])
    }
    const petBonus=petBossBonus(pet)
    const weapon=getEquipmentInfo(st.weapon_id)||{atk:0}, armor=getEquipmentInfo(st.armor_id)||{def:0}
    const atk=Number(st.atk)+Number(weapon.atk||0), def=Number(st.def)+Number(armor.def||0)
    const crit=petBonus.crit>0&&Math.random()<petBonus.crit
    const petMultiplier=1+petBonus.damage
    const damage=Math.max(5,Math.floor(atk*(.85+Math.random()*.45)*petMultiplier*(crit?1.5:1)))
    const petDamage=Math.max(0,damage-Math.floor(damage/petMultiplier))
    s.hp=Math.max(0,Number(s.hp)-damage); s.participants=s.participants||{}
    const old=s.participants[jid]||{damage:0,name:name||'Jogador'}
    s.participants[jid]={damage:Number(old.damage||0)+damage,name:old.name||name||'Jogador'}
    let php=Number(st.hp),bossDamage=0,autoHeal=null
    if(s.hp>0){
      const dodged=petBonus.dodge>0&&Math.random()<petBonus.dodge
      bossDamage=dodged?0:Math.max(1,Math.round((Number(s.atk||18)-def*.22)*(.8+Math.random()*.4)*(1-petBonus.defense)))
      php=Math.max(0,php-bossDamage)
      if(php<=0){
        const ids=['pocao_p','pocao_m','pocao_g','elixir_supremo']
        const heals={pocao_p:35,pocao_m:80,pocao_g:160,elixir_supremo:999999}
        const names={pocao_p:'Poção Pequena',pocao_m:'Poção Média',pocao_g:'Poção Grande',elixir_supremo:'Elixir Supremo'}
        const inv=(await c.query('SELECT item_id,quantity FROM inventories WHERE jid=$1 AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',[jid,ids])).rows
        const available=inv.map(x=>({...x,heal:heals[x.item_id]})).sort((a,b)=>a.heal-b.heal)
        const chosen=available.find(x=>x.heal>=Number(st.max_hp))||available[available.length-1]
        if(chosen){php=Math.min(Number(st.max_hp),chosen.heal);await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,chosen.item_id]);autoHeal={name:names[chosen.item_id],hp:php}}
      }
      await c.query('UPDATE stats SET hp=$1 WHERE jid=$2',[php,jid])
    }
    if(s.hp<=0){
      const entries=Object.entries(s.participants).map(([pjid,v])=>({jid:pjid,damage:Number(v.damage||0),name:v.name||'Jogador'})).sort((a,b)=>b.damage-a.damage)
      const total=entries.reduce((n,x)=>n+x.damage,0)||1,rewards=[]
      for(let i=0;i<entries.length;i++){
        const p=entries[i],position=i+1,share=p.damage/total
        const tier=BOSS_PLACEMENT[i]||{cash:0,xp:0}
        // Todos recebem base; dano divide um fundo fixo e colocação dá um bônus separado.
        const cash=5000+Math.floor(150000*share)+tier.cash
        const pp=(await c.query('SELECT species,name,level FROM pets WHERE jid=$1',[p.jid])).rows[0]||null
        const pb=petBossBonus(pp)
        const exp=Math.floor((150+1000*share+tier.xp)*(1+pb.xp))
        await credit(c,p.jid,cash,'boss_weekend')
        await grantExpInTransaction(c,p.jid,exp)
        const drops=await giveBossDrops(c,p.jid,position,pb.drop)
        rewards.push({...p,position,cash,exp,drops,share,pet:pp?{name:pp.name,species:pp.species,bonus:pb.label}:null})
      }
      await clearGame(c,chat,'boss')
      return {dead:true,damage,bossDamage,playerHp:php,hp:0,maxHp:s.maxHp,players:entries.length,rewards,autoHeal,petUnavailable}
    }
    await saveGame(c,chat,'boss',s)
    return {dead:false,damage,bossDamage,playerHp:php,playerMaxHp:Number(st.max_hp),playerDead:php<=0,hp:s.hp,maxHp:s.maxHp,autoHeal,petUnavailable,pet:pet?{name:pet.name,species:pet.species,bonus:petBonus.label,damage:petDamage,crit,energy:pet.energy}:null}
  })
}
