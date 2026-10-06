import { db, ensureUser, equipmentStatsAtLevel, grantExpInTransaction, petMaxHp, getDoubleEventMultiplier, getPetXpEventMultiplier, petTeamSynergy } from './db.js'
import { petCombatSpecialty } from './game-catalog.js'

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

const LUCKY_3X_START=Date.parse('2026-10-06T07:30:00-03:00')
const LUCKY_3X_END=Date.parse('2026-10-06T08:30:00-03:00')
const lucky3xActive=()=>Date.now()>=LUCKY_3X_START&&Date.now()<LUCKY_3X_END
const lucky3xMultiplier=()=>lucky3xActive()?3:1
const lucky3xPlayerWins=()=>!lucky3xActive()||Math.random()<0.20

const CACADA_ALPHA_START=Date.parse('2026-10-06T19:00:00-03:00')
const CACADA_ALPHA_END=Date.parse('2026-10-06T20:00:00-03:00')
const cacadaAlphaActive=()=>Date.now()>=CACADA_ALPHA_START&&Date.now()<CACADA_ALPHA_END


async function credit(client,jid,amount,note){
  amount=Math.round(Number(amount)||0)
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
    if(choice===color && lucky3xPlayerWins()){
      const basePayout=choice==='verde'?amount*36:amount*2
      const baseProfit=basePayout-amount
      // Lucky 3x multiplies only the prize/profit, never the returned stake.
      payout=amount+(baseProfit*lucky3xMultiplier())
    }
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
      let payout=0
      if(bet.choice===color && lucky3xPlayerWins()){
        const stake=Number(bet.amount)
        const basePayout=bet.choice==='verde'?stake*36:stake*2
        const baseProfit=basePayout-stake
        payout=stake+(baseProfit*lucky3xMultiplier())
      }
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
    const normalResult=Math.random()<0.5?'cara':'coroa'
    const won=lucky3xActive()?Math.random()<0.20:normalResult===choice
    const result=won?choice:(choice==='cara'?'coroa':'cara')
    const payout=won?amount*2*lucky3xMultiplier():0
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

const HARD_QUIZZES=[
  {q:"Qual tratado encerrou oficialmente a Primeira Guerra Mundial entre a Alemanha e os Aliados?",a:["Tratado de Utrecht","Tratado de Versalhes","Tratado de Tordesilhas","Tratado de Brest-Litovsk"],c:2,d:'hard'},
  {q:"Qual elemento químico possui número atômico 74?",a:["Tungstênio","Titânio","Tântalo","Tório"],c:1,d:'hard'},
  {q:"Qual é a capital do Cazaquistão em 2026?",a:["Almaty","Astana","Bishkek","Tashkent"],c:2,d:'hard'},
  {q:"Quem formulou o princípio da incerteza na mecânica quântica?",a:["Niels Bohr","Werner Heisenberg","Max Planck","Erwin Schrödinger"],c:2,d:'hard'},
  {q:"Em qual camada da atmosfera ocorre a maior parte dos fenômenos meteorológicos?",a:["Estratosfera","Mesosfera","Troposfera","Termosfera"],c:3,d:'hard'},
  {q:"Qual filósofo escreveu 'Crítica da Razão Pura'?",a:["Hegel","Kant","Descartes","Nietzsche"],c:2,d:'hard'},
  {q:"Qual país possui a maior quantidade de fusos horários quando considerados seus territórios ultramarinos?",a:["Rússia","Estados Unidos","França","Canadá"],c:3,d:'hard'},
  {q:"Qual das seguintes estruturas celulares é responsável principalmente pela produção de ATP?",a:["Lisossomo","Ribossomo","Mitocôndria","Complexo de Golgi"],c:3,d:'hard'},
  {q:"A Batalha de Hastings, em 1066, resultou na conquista da Inglaterra por qual povo?",a:["Normandos","Vikings dinamarqueses","Saxões","Francos"],c:1,d:'hard'},
  {q:"Qual matemático demonstrou o último teorema de Fermat na década de 1990?",a:["Terence Tao","Andrew Wiles","John Nash","Grigori Perelman"],c:2,d:'hard'},
  {q:"Qual é o menor número natural que possui exatamente 12 divisores positivos?",a:["48","60","72","84"],c:2,d:'hard'},
  {q:"Qual cientista propôs a teoria da deriva continental no início do século XX?",a:["Charles Lyell","Alfred Wegener","James Hutton","Louis Agassiz"],c:2,d:'hard'},
  {q:"Qual linguagem foi criada originalmente por Guido van Rossum?",a:["Ruby","Python","Perl","Lua"],c:2,d:'hard'},
  {q:"Em redes de computadores, qual protocolo traduz nomes de domínio em endereços IP?",a:["DHCP","DNS","SMTP","SSH"],c:2,d:'hard'},
  {q:"Qual império tinha Constantinopla como capital até 1453?",a:["Império Bizantino","Império Carolíngio","Império Sassânida","Império Austro-Húngaro"],c:1,d:'hard'},
  {q:"Qual dessas luas pertence a Saturno?",a:["Europa","Titã","Fobos","Tritão"],c:2,d:'hard'},
  {q:"Qual é a unidade SI de capacitância elétrica?",a:["Henry","Tesla","Farad","Weber"],c:3,d:'hard'},
  {q:"Quem escreveu 'O Nome da Rosa'?",a:["Italo Calvino","Umberto Eco","Primo Levi","Giuseppe Tomasi di Lampedusa"],c:2,d:'hard'},
  {q:"Qual país africano era anteriormente conhecido como Abissínia?",a:["Eritreia","Etiópia","Somália","Sudão"],c:2,d:'hard'},
  {q:"Qual é o nome do processo pelo qual uma estrela massiva colapsa e explode ao fim de sua vida?",a:["Nebulização","Supernova","Fissão estelar","Pulsação térmica"],c:2,d:'hard'},
  {q:"Qual estrutura de dados opera segundo a regra LIFO?",a:["Fila","Pilha","Árvore binária","Tabela hash"],c:2,d:'hard'},
  {q:"Qual foi o primeiro elemento químico produzido artificialmente?",a:["Tecnécio","Promécio","Frâncio","Polônio"],c:1,d:'hard'},
  {q:"Qual corrente oceânica contribui fortemente para amenizar o clima da Europa Ocidental?",a:["Corrente de Humboldt","Corrente do Golfo","Corrente de Benguela","Corrente de Oyashio"],c:2,d:'hard'},
  {q:"Qual obra de George Orwell retrata a fazenda governada por animais após uma revolução?",a:["1984","A Revolução dos Bichos","Na Pior em Paris e Londres","Homenagem à Catalunha"],c:2,d:'hard'},
  {q:"Qual organela vegetal contém clorofila e realiza fotossíntese?",a:["Peroxissomo","Cloroplasto","Vacúolo","Centríolo"],c:2,d:'hard'},
  {q:"Na lógica proposicional, qual operador só é verdadeiro quando exatamente uma das proposições é verdadeira?",a:["AND","OR inclusivo","XOR","NAND"],c:3,d:'hard'},
  {q:"Qual cientista descobriu a penicilina em 1928?",a:["Robert Koch","Alexander Fleming","Joseph Lister","Edward Jenner"],c:2,d:'hard'},
  {q:"Qual dinastia chinesa construiu grande parte das seções da Grande Muralha que existem hoje?",a:["Han","Tang","Ming","Qing"],c:3,d:'hard'},
  {q:"Em astronomia, o limite de Chandrasekhar está relacionado principalmente a qual objeto?",a:["Anãs brancas","Estrelas de nêutrons","Buracos negros supermassivos","Gigantes vermelhas"],c:1,d:'hard'},
  {q:"Qual número irracional é a base dos logaritmos naturais?",a:["π","e","φ","√2"],c:2,d:'hard'}
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
    const hardPool=HARD_QUIZZES.filter(x=>!recent.includes(x.q))
    const normalPool=QUIZZES.filter(x=>!recent.includes(x.q))
    // Aproximadamente 45% das rodadas vêm do banco difícil.
    const wantHard=Math.random()<.45
    const chosenPool=(wantHard&&hardPool.length)?hardPool:(normalPool.length?normalPool:(hardPool.length?hardPool:[...QUIZZES,...HARD_QUIZZES]))
    const item=chosenPool[Math.floor(Math.random()*chosenPool.length)]
    const state={...item,difficulty:item.d==='hard'?'difícil':'normal',started:now,recentQuestions:[...recent,item.q].slice(-20)}
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
    const moneyMultiplier=await getDoubleEventMultiplier(c,'money')
    const reward=correct?1000*moneyMultiplier:0
    if(reward) await credit(c,jid,reward,'quiz')
    return {correct,reward,correctAnswer:s.c,correctText:s.a[s.c-1],eventMultiplier:moneyMultiplier}
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
      const moneyMultiplier=await getDoubleEventMultiplier(c,'money')
      const reward=Math.max(300,1500-(s.attempts-1)*100)*moneyMultiplier
      await credit(c,jid,reward,'adivinhar-numero')
      return {won:true,reward,attempts:s.attempts,number:s.number,eventMultiplier:moneyMultiplier}
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
function petBossBonus(pet){
  if(!pet) return {label:null,damage:0,defense:0,crit:0,dodge:0,xp:0,drop:0,healPct:0,healCooldown:0}
  const base=petCombatSpecialty(pet.species)
  // Progressão revisada:
  // - pets comuns: até +50% sobre a especialidade base no Nv.100;
  // - pets de Raid/lendários: mantêm até +25%, pois já começam com bases maiores.
  // Os tetos continuam em 10% (comuns) e 15% (Raid) por atributo.
  const maxGrowth=base.raid?.25:.50
  const scale=1+Math.min(maxGrowth,Math.max(0,Number(pet.level||1)-1)*(maxGrowth/99))
  const cap=base.raid?.15:.10
  const scaled=k=>Math.min(cap,Number(base[k]||0)*scale)
  return {
    label:base.label||pet.species,
    damage:scaled('damage')+scaled('bossDamage'),
    defense:scaled('defense'),
    crit:scaled('crit'),
    dodge:scaled('dodge'),
    xp:scaled('xp'),
    drop:scaled('drop'),
    healPct:scaled('healPct'),
    healCooldown:Math.max(0,Number(base.healCooldown||0))
  }
}

// Rebalance pós-!timepet: mais vida para absorver crítico/bônus de pet sem transformar
// o combate em puro dano recebido. ATK sobe ~10%; HP base sobe ~25–32%.
const RAID_CONFIGS=[
  {level:10,name:'Guardião de Pedra',hp:13000,atk:15,keyId:'chave_raid_10',keyPrice:10000,cashPool:20000,xpPool:1200,petXpPool:120,material:{id:'nucleo_pedra',name:'Fragmento do Núcleo de Pedra'},box:null,gear:null,gearChance:0},
  {level:15,name:'Dragão Vulcânico',hp:24000,atk:23,keyId:'chave_raid_15',keyPrice:16000,cashPool:35000,xpPool:1800,petXpPool:180,material:{id:'escama_vulcanica',name:'Escama Vulcânica'},box:'caixa_sorte',gear:['foice_carmesim','manto_fenix'],gearChance:.015},
  {level:20,name:'Devorador Abissal',hp:39000,atk:33,keyId:'chave_raid_20',keyPrice:25000,cashPool:55000,xpPool:2600,petXpPool:260,material:{id:'olho_abissal',name:'Olho Abissal'},box:'caixa_rara',gear:['lanca_solar','couraca_vulcanica'],gearChance:.0175},
  {level:25,name:'Titã de Ferro',hp:63000,atk:43,keyId:'chave_raid_25',keyPrice:40000,cashPool:80000,xpPool:3600,petXpPool:360,material:{id:'nucleo_titan',name:'Núcleo do Titã'},box:'caixa_rara',gear:['garras_vazio','armadura_vazio'],gearChance:.02},
  {level:30,name:'Rei Abissal',hp:98000,atk:55,keyId:'chave_raid_30',keyPrice:60000,cashPool:120000,xpPool:5000,petXpPool:500,material:{id:'essencia_rei_abissal',name:'Essência do Rei Abissal'},box:'caixa_epica',gear:['espada_eclipse','armadura_eclipse'],gearChance:.025},
  {level:40,name:'Serafim Caído',hp:170000,atk:77,keyId:'chave_raid_40',keyPrice:100000,cashPool:200000,xpPool:7500,petXpPool:750,material:{id:'fragmento_celestial',name:'Fragmento Celestial'},box:'caixa_epica',gear:['excalibur','armadura_titan'],gearChance:.008},
  {level:50,name:'Alpha Corrompido',hp:290000,atk:108,keyId:'chave_raid_50',keyPrice:160000,cashPool:350000,xpPool:11000,petXpPool:1100,material:{id:'nucleo_alpha_corrompido',name:'Núcleo Alpha Corrompido'},box:'caixa_epica',gear:['katana_divina','armadura_divina'],gearChance:.005},
]
const raidConfig=level=>RAID_CONFIGS.find(r=>r.level===Number(level))||null
const raidDurationMinutes=level=>({10:12,15:15,20:18,25:22,30:30,40:40,50:50}[Number(level)]||15)
export function getRaidCatalog(){ return RAID_CONFIGS.map(r=>({...r,durationMinutes:raidDurationMinutes(r.level)})) }

const raidGameType=level=>`raid:${Number(level)}`
const raidIsOpen=s=>Boolean(s&&['lobby','active'].includes(s.status)&&(s.status==='active'||Number(s.expiresAt||0)>Date.now()))

async function raidRows(c,chat,forUpdate=false){
  const lock=forUpdate?' FOR UPDATE':''
  const {rows}=await c.query(
    `SELECT game_type,state,updated_at FROM trevo_games
     WHERE chat_jid=$1 AND (game_type='raid' OR game_type LIKE 'raid:%')
     ORDER BY updated_at DESC${lock}`,
    [chat]
  )
  return rows.map(r=>({gameType:r.game_type,...(r.state||{})}))
}

async function resolveRaidRoom(c,chat,level=null,{host=null,jid=null,lobbyOnly=false}={}){
  const rows=await raidRows(c,chat,true)
  let rooms=rows.filter(raidIsOpen)
  if(lobbyOnly) rooms=rooms.filter(r=>r.status==='lobby')
  if(level) rooms=rooms.filter(r=>Number(r.level)===Number(level))
  if(host) rooms=rooms.filter(r=>r.host===host)
  if(jid) rooms=rooms.filter(r=>Boolean(r.players?.[jid]))
  return rooms
}

export async function getRaidStatuses(chat){
  return tx(async c=>(await raidRows(c,chat,false)).filter(raidIsOpen))
}

export async function getRaidStatus(chat,level=null){
  return tx(async c=>{
    const rooms=(await raidRows(c,chat,false)).filter(raidIsOpen)
    if(level) return rooms.find(r=>Number(r.level)===Number(level))||null
    return rooms[0]||null
  })
}

export async function createRaid(chat,host,name='Jogador',level=10){
  const cfg=raidConfig(level)
  if(!cfg) throw new Error('Raid inválida. Níveis: 10, 15, 20, 25, 30, 40 e 50.')
  const gameType=raidGameType(cfg.level)
  await ensureUser(host,name)
  return tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`raid-membership:${chat}:${host}`])
    const sameRoom=(await resolveRaidRoom(c,chat,cfg.level))[0]
    if(sameRoom) throw new Error(`Já existe uma sala da Raid Lv.${cfg.level} neste grupo.`)
    const otherRoom=(await resolveRaidRoom(c,chat,null,{jid:host}))[0]
    if(otherRoom) throw new Error(`Você já está na Raid Lv.${otherRoom.level}. Saia/conclua essa Raid antes de abrir outra.`)
    const u=(await c.query('SELECT level FROM users WHERE jid=$1 FOR UPDATE',[host])).rows[0]
    if(Number(u?.level||1)<cfg.level) throw new Error(`Essa Raid exige nível ${cfg.level}. Seu nível atual: ${Number(u?.level||1)}.`)
    const st=(await c.query('SELECT hp FROM stats WHERE jid=$1 FOR UPDATE',[host])).rows[0]
    if(Number(st?.hp||0)<=0) throw new Error('Você está sem HP. Cure-se antes de abrir a Raid.')
    let autoKeyPurchased=false
    const key=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[host,cfg.keyId])).rows[0]
    if(Number(key?.quantity||0)<1){
      const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[host])).rows[0]
      const cash=Number(wallet?.cash||0),bank=Number(wallet?.bank||0)
      if(cash+bank<cfg.keyPrice){
        const missing=Math.max(0,cfg.keyPrice-(cash+bank))
        throw new Error(`🔑 Você não possui a Chave de Raid Lv.${cfg.level}. A compra automática custa R$ ${cfg.keyPrice.toLocaleString('pt-BR')}. Faltam R$ ${missing.toLocaleString('pt-BR')}.`)
      }
      const fromCash=Math.min(cash,cfg.keyPrice),fromBank=cfg.keyPrice-fromCash
      await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2 WHERE jid=$3',[fromCash,fromBank,host])
      await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
        ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1`,[host,cfg.keyId])
      await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES($1,'raid_shop',$2,'raid_key_auto',$3)`,[host,cfg.keyPrice,`Compra automática — Raid Lv.${cfg.level}`])
      autoKeyPurchased=true
    }
    const state={status:'lobby',level:cfg.level,name:cfg.name,host,hostName:name||'Jogador',hp:cfg.hp,maxHp:cfg.hp,atk:cfg.atk,players:{[host]:{jid:host,name:name||'Jogador',damage:0,alive:true}},round:0,createdAt:Date.now(),expiresAt:Date.now()+5*60*1000}
    await saveGame(c,chat,gameType,state)
    return {...state,gameType,autoKeyPurchased,keyPrice:cfg.keyPrice}
  })
}

export async function joinRaid(chat,jid,name='Jogador',level=null){
  await ensureUser(jid,name)
  return tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`raid-membership:${chat}:${jid}`])
    const joined=(await resolveRaidRoom(c,chat,null,{jid}))[0]
    if(joined){
      if(!level || Number(joined.level)===Number(level)) return {already:true,lateJoin:joined.status==='active',...joined}
      throw new Error(`Você já está na Raid Lv.${joined.level}. Não dá para participar de duas Raids ao mesmo tempo.`)
    }
    const rooms=await resolveRaidRoom(c,chat,level||null)
    if(!rooms.length) throw new Error(level?`Não existe sala aberta da Raid Lv.${level}.`:'Não existe Raid disponível para entrar.')
    if(!level&&rooms.length>1) throw new Error('Há mais de uma Raid aberta. Escolha uma: '+rooms.map(r=>`!entrar ${r.level}`).join(' • '))
    const s=rooms[0]
    const gameType=s.gameType
    if(Object.keys(s.players||{}).length>=5) throw new Error('A Raid já está cheia (5 jogadores).')
    const u=(await c.query('SELECT level,push_name FROM users WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(u?.level||1)<Number(s.level)) throw new Error(`Essa Raid exige nível ${s.level}. Seu nível atual: ${Number(u?.level||1)}.`)
    const st=(await c.query('SELECT * FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(st?.hp||0)<=0) throw new Error('Você está sem HP. Cure-se antes de entrar.')
    const cfg=raidConfig(s.level)
    if(!cfg) throw new Error('Configuração da Raid não encontrada.')
    let autoKeyPurchased=false
    const key=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,cfg.keyId])).rows[0]
    if(Number(key?.quantity||0)<1){
      const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
      const cash=Number(wallet?.cash||0),bank=Number(wallet?.bank||0)
      if(cash+bank<cfg.keyPrice){
        const missing=Math.max(0,cfg.keyPrice-(cash+bank))
        throw new Error(`🔑 Você não possui a Chave de Raid Lv.${cfg.level}. A compra automática custa R$ ${cfg.keyPrice.toLocaleString('pt-BR')}. Faltam R$ ${missing.toLocaleString('pt-BR')}.`)
      }
      const fromCash=Math.min(cash,cfg.keyPrice),fromBank=cfg.keyPrice-fromCash
      await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2 WHERE jid=$3',[fromCash,fromBank,jid])
      await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
        ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1`,[jid,cfg.keyId])
      await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES($1,'raid_shop',$2,'raid_key_auto',$3)`,[jid,cfg.keyPrice,`Compra automática ao entrar — Raid Lv.${cfg.level}`])
      autoKeyPurchased=true
    }

    if(s.status==='lobby'){
      s.players={...(s.players||{}),[jid]:{jid,name:name||'Jogador',damage:0,alive:true}}
      await saveGame(c,chat,gameType,s)
      return {...s,lateJoin:false,autoKeyPurchased,keyPrice:cfg.keyPrice}
    }

    // Entrada tardia: consome a chave agora e cria o participante com os atributos atuais.
    // Dano começa em zero, portanto não há crédito pelas rodadas anteriores.
    await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,cfg.keyId])
    const lev=async itemId=>itemId?Number((await c.query('SELECT level FROM equipment_upgrades WHERE jid=$1 AND item_id=$2',[jid,itemId])).rows[0]?.level||1):1
    const w=st.weapon_id?equipmentStatsAtLevel(st.weapon_id,await lev(st.weapon_id)):{atk:0,def:0,hp:0,crit:0}
    const a=st.armor_id?equipmentStatsAtLevel(st.armor_id,await lev(st.armor_id)):{atk:0,def:0,hp:0,crit:0}
    const gearHp=Number(w?.hp||0)+Number(a?.hp||0)
    const pet=(await c.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]||null
    let reservePet=await raidReservePet(c,jid)
    let combatPet=raidCombatPetState(pet,1)
    if(combatPet&&Number(combatPet.hp)<=0&&reservePet){
      combatPet=reservePet
      reservePet=null
    }
    s.players={...(s.players||{}),[jid]:{
      jid,name:name||u?.push_name||'Jogador',hp:Math.min(Number(st.hp),Number(st.max_hp)+gearHp),maxHp:Number(st.max_hp)+gearHp,
      atk:Number(st.atk)+Number(w?.atk||0)+Number(a?.atk||0),def:Number(st.def)+Number(w?.def||0)+Number(a?.def||0),
      crit:Math.min(.45,.10+Number(w?.crit||0)+Number(a?.crit||0)),damage:0,petBonusDamage:0,petSkillHealing:0,alive:true,heals:0,
      pet:combatPet,reservePet
    }}
    await saveGame(c,chat,gameType,s)
    return {...s,lateJoin:true,joinedJid:jid,autoKeyPurchased,keyPrice:cfg.keyPrice}
  })
}

export async function cancelRaid(chat,jid,level=null){
  return tx(async c=>{
    const rooms=await resolveRaidRoom(c,chat,level||null,{host:jid,lobbyOnly:true})
    if(!rooms.length) throw new Error(level?`Você não possui sala aberta da Raid Lv.${level}.`:'Você não possui Raid aguardando início.')
    if(!level&&rooms.length>1) throw new Error('Você abriu mais de uma sala. Informe qual Raid deseja cancelar.')
    const s=rooms[0]
    await clearGame(c,chat,s.gameType)
    return {level:Number(s.level),name:s.name}
  })
}

async function raidPetXp(c,jid,gain){
  gain=Math.max(0,Math.floor(Number(gain)||0))
  if(!gain) return null
  const p=(await c.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(!p) return null
  const rawXp=Number(p.xp||0)+gain
  const level=Math.min(100,1+Math.floor(rawXp/100))
  const xp=level>=100?9900:rawXp
  const gained=Math.max(0,level-Math.min(100,Number(p.level||1)))
  const newMax=petMaxHp(level,xp,p.species)
  const oldMax=Math.max(1,Number(p.max_hp||petMaxHp(p.level,p.xp,p.species)))
  const hp=Math.min(newMax,Math.max(0,Number(p.hp??oldMax)+Math.max(0,newMax-oldMax)))
  const r=(await c.query('UPDATE pets SET xp=$1,level=$2,power=power+$3,energy=energy+$4,hp=$5,max_hp=$6 WHERE jid=$7 RETURNING *',[xp,level,gained*2,gained*3,hp,newMax,jid])).rows[0]
  if(r) await c.query('UPDATE pet_collection SET level=$1,xp=$2,power=$3,energy=$4,hp=$5,max_hp=$6 WHERE jid=$7 AND active=TRUE',[r.level,r.xp,r.power,r.energy,r.hp,r.max_hp,jid])
  return r?{name:r.name,xp:gain,level:Number(r.level),levels:gained,hp:Number(r.hp),maxHp:Number(r.max_hp)}:null
}

async function grantTeamPetXp(c,jid,baseGain){
  baseGain=Math.max(0,Math.floor(Number(baseGain)||0))
  if(!baseGain) return []
  const petXpEventMultiplier=await getPetXpEventMultiplier(c)
  baseGain=Math.max(0,Math.round(baseGain*petXpEventMultiplier))
  const awards=[]
  const primary=await raidPetXp(c,jid,baseGain)
  if(primary) awards.push({slot:1,name:primary.name,xp:baseGain})

  const team=(await c.query(`SELECT t.slot,p.* FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id
    WHERE t.jid=$1 AND t.slot IN (2,3) ORDER BY t.slot FOR UPDATE OF p`,[jid])).rows
  const weights={2:.60,3:.35}
  for(const pet of team){
    const slot=Number(pet.slot)
    const gain=Math.max(1,Math.floor(baseGain*Number(weights[slot]||0)))
    if(!gain) continue
    const rawXp=Number(pet.xp||0)+gain
    const level=Math.min(100,1+Math.floor(rawXp/100))
    const xp=level>=100?9900:rawXp
    const gained=Math.max(0,level-Math.min(100,Number(pet.level||1)))
    const newMax=petMaxHp(level,xp,pet.species)
    const oldMax=Math.max(1,Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species)))
    const hp=Math.min(newMax,Math.max(0,Number(pet.hp??oldMax)+Math.max(0,newMax-oldMax)))
    const r=(await c.query('UPDATE pet_collection SET xp=$1,level=$2,power=power+$3,energy=energy+$4,hp=$5,max_hp=$6 WHERE id=$7 AND jid=$8 RETURNING *',[xp,level,gained*2,gained*3,hp,newMax,pet.id,jid])).rows[0]
    if(r) awards.push({slot,name:r.name,xp:gain})
  }
  return awards
}

function raidPotion(rows,maxHp){
  const heal={pocao_p:35,pocao_m:80,pocao_g:160,elixir_supremo:999999}
  const names={pocao_p:'Poção Pequena',pocao_m:'Poção Média',pocao_g:'Poção Grande',elixir_supremo:'Elixir Supremo'}
  const a=(rows||[]).filter(x=>Number(x.quantity)>0).map(x=>({...x,heal:heal[x.item_id]||0})).sort((x,y)=>x.heal-y.heal)
  const p=a.find(x=>x.heal>=maxHp)||a[a.length-1]
  return p?{...p,name:names[p.item_id]}:null
}

function raidCombatPetState(pet,slot=1){
  if(!pet) return null
  return {
    collectionId:Number(pet.id||0)||null,teamSlot:Number(slot)||1,
    name:pet.name,species:pet.species,level:Number(pet.level||1),xp:Number(pet.xp||0),
    energy:Number(pet.energy||0),hp:Number(pet.hp??petMaxHp(pet.level,pet.xp,pet.species)),
    maxHp:Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species)),
    bonus:petBossBonus(pet),extraDamage:0,turns:0
  }
}

async function raidReservePet(c,jid){
  const r=(await c.query(`SELECT p.* FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id
    WHERE t.jid=$1 AND t.slot=3 FOR UPDATE OF p`,[jid])).rows[0]||null
  if(!r||Number(r.hp)<=0||Number(r.energy)<=0) return null
  return raidCombatPetState(r,3)
}

async function persistRaidCombatPet(c,jid,pet){
  if(!pet) return
  if(Number(pet.teamSlot)===3&&pet.collectionId){
    await c.query('UPDATE pet_collection SET hp=$1,energy=$2 WHERE id=$3 AND jid=$4',[pet.hp,pet.energy,pet.collectionId,jid])
  }else{
    await c.query('UPDATE pets SET hp=$1,energy=$2 WHERE jid=$3',[pet.hp,pet.energy,jid])
    await c.query('UPDATE pet_collection SET hp=$1,energy=$2 WHERE jid=$3 AND active=TRUE',[pet.hp,pet.energy,jid])
  }
}
function raidPetPotion(rows,missingHp){
  const heal={pocao_pet_comum:60,pocao_pet_rara:160,pocao_pet_epica:320,pocao_pet_suprema:800}
  const names={pocao_pet_comum:'Poção de Pet Comum',pocao_pet_rara:'Poção de Pet Rara',pocao_pet_epica:'Poção de Pet Épica',pocao_pet_suprema:'Poção de Pet Suprema'}
  const a=(rows||[]).filter(x=>Number(x.quantity)>0&&heal[x.item_id]).map(x=>({...x,heal:heal[x.item_id]})).sort((x,y)=>x.heal-y.heal)
  const p=a.find(x=>x.heal>=Math.max(1,Number(missingHp)||1))||a[a.length-1]
  return p?{...p,name:names[p.item_id]}:null
}

export async function startRaid(chat,host,level=null){
  return tx(async c=>{
    const rooms=await resolveRaidRoom(c,chat,level||null,{host,lobbyOnly:true})
    if(!rooms.length) throw new Error(level?`Você não possui sala pronta da Raid Lv.${level}.`:'Não existe Raid pronta para iniciar.')
    if(!level&&rooms.length>1) throw new Error('Você possui mais de uma sala. Informe qual Raid deseja iniciar.')
    const s=rooms[0]
    const gameType=s.gameType
    if(Number(s.expiresAt||0)<Date.now()) throw new Error('A sala expirou. Abra outra Raid.')
    const ids=Object.keys(s.players||{})
    const cfg=raidConfig(s.level)
    if(!cfg) throw new Error('Configuração da Raid não encontrada.')
    // Todas as Raids podem ser iniciadas solo. O tempo, HP e ATK da Raid
    // continuam sendo o desafio; entrar com mais jogadores segue opcional.
    const minPlayers=1
    if(ids.length<minPlayers) throw new Error(`A Raid Lv.${cfg.level} precisa de pelo menos 1 jogador.`)

    const users=(await c.query('SELECT jid,level,push_name FROM users WHERE jid=ANY($1::text[]) FOR UPDATE',[ids])).rows
    const stats=(await c.query('SELECT * FROM stats WHERE jid=ANY($1::text[]) FOR UPDATE',[ids])).rows
    if(users.some(u=>Number(u.level)<cfg.level)) throw new Error('Um participante não atende mais ao nível mínimo.')
    if(stats.some(st=>Number(st.hp)<=0)) throw new Error('Um participante está sem HP.')

    const keys=(await c.query('SELECT jid,quantity FROM inventories WHERE jid=ANY($1::text[]) AND item_id=$2 FOR UPDATE',[ids,cfg.keyId])).rows
    const missing=ids.filter(jid=>Number(keys.find(k=>k.jid===jid)?.quantity||0)<1)
    if(missing.length){
      const names=missing.map(jid=>users.find(u=>u.jid===jid)?.push_name||s.players?.[jid]?.name||'Jogador')
      throw new Error(`🔑 Todos precisam da Chave de Raid Lv.${cfg.level}. Sem chave: ${names.join(', ')}.`)
    }

    await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=ANY($1::text[]) AND item_id=$2',[ids,cfg.keyId])
    const eqIds=[...new Set(stats.flatMap(st=>[st.weapon_id,st.armor_id]).filter(Boolean))]
    const ups=eqIds.length?(await c.query('SELECT jid,item_id,level FROM equipment_upgrades WHERE jid=ANY($1::text[]) AND item_id=ANY($2::text[])',[ids,eqIds])).rows:[]
    const pets=(await c.query('SELECT * FROM pets WHERE jid=ANY($1::text[]) FOR UPDATE',[ids])).rows
    for(const jid of ids){
      const st=stats.find(x=>x.jid===jid),u=users.find(x=>x.jid===jid),pet=pets.find(x=>x.jid===jid)||null
      const lev=itemId=>Number(ups.find(x=>x.jid===jid&&x.item_id===itemId)?.level||1)
      const w=st.weapon_id?equipmentStatsAtLevel(st.weapon_id,lev(st.weapon_id)):{atk:0,def:0,hp:0,crit:0}
      const a=st.armor_id?equipmentStatsAtLevel(st.armor_id,lev(st.armor_id)):{atk:0,def:0,hp:0,crit:0}
      const gearHp=Number(w?.hp||0)+Number(a?.hp||0)
      let reservePet=await raidReservePet(c,jid)
      let combatPet=raidCombatPetState(pet,1)
      if(combatPet&&Number(combatPet.hp)<=0&&reservePet){
        combatPet=reservePet
        reservePet=null
      }
      const teamPets=(await c.query(
        'SELECT t.slot,p.species FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id WHERE t.jid=$1 ORDER BY t.slot',
        [jid]
      )).rows
      const teamSynergy=petTeamSynergy(teamPets)
      s.players[jid]={jid,name:s.players[jid]?.name||u?.push_name||'Jogador',hp:Math.min(Number(st.hp),Number(st.max_hp)+gearHp),maxHp:Number(st.max_hp)+gearHp,atk:Number(st.atk)+Number(w?.atk||0)+Number(a?.atk||0),def:Number(st.def)+Number(w?.def||0)+Number(a?.def||0),crit:Math.min(.45,.10+Number(w?.crit||0)+Number(a?.crit||0)),damage:0,petBonusDamage:0,petSkillHealing:0,alive:true,heals:0,pet:combatPet,reservePet,teamSynergy}
    }
    // O grupo maior causa muito mais dano por rodada. Escala só o HP (+12% por
    // jogador extra), mantendo o ATK previsível e evitando consumo explosivo de poções.
    const partyHpMultiplier=1+Math.max(0,ids.length-1)*.12
    const raidMaxHp=Math.round(cfg.hp*partyHpMultiplier)
    s.status='active';s.round=0;s.hp=raidMaxHp;s.maxHp=raidMaxHp;s.atk=cfg.atk;s.startedAt=Date.now();s.durationMinutes=raidDurationMinutes(cfg.level);s.activeElapsedMs=0;s.lastRoundAt=0;s.expiresAt=Date.now()+s.durationMinutes*60*1000
    await saveGame(c,chat,gameType,s)
    return s
  })
}

async function finishRaidRewards(c,s,cfg){
  const ranked=Object.values(s.players||{}).sort((a,b)=>Number(b.damage||0)-Number(a.damage||0))
  const total=ranked.reduce((n,p)=>n+Number(p.damage||0),0)||1
  // Invasão das Raids — 04/10/2026, 14:00–15:30 America/Sao_Paulo.
  // A compensação por desconexões usa uma janela dinâmica persistida no Neon.
  const now=Date.now()
  const raidComp=(await c.query("SELECT value FROM trevo_settings WHERE key='raid_compensation_event'")).rows[0]?.value||{}
  const compensationActive=Number(raidComp.startsAt||0)<=now && now<Number(raidComp.endsAt||0)
  const raidEventActive=(now>=Date.parse('2026-10-04T14:00:00-03:00') && now<Date.parse('2026-10-04T15:30:00-03:00')) || compensationActive
  const cacadaActive=cacadaAlphaActive()
  const moneyMultiplier=cacadaActive?1.25:1
  const xpMultiplier=raidEventActive?1.5:(cacadaActive?1.5:1)
  const petXpMultiplier=raidEventActive?1.5:(cacadaActive?1.25:1)
  const gearEventBonus=raidEventActive?.015:0
  const rewards=[]
  for(let i=0;i<ranked.length;i++){
    const p=ranked[i],share=Number(p.damage||0)/total,pb=p.pet?.bonus||{xp:0,drop:0}
    // Vitória precisa pagar a própria chave sem transformar Raid em farm de dinheiro.
    // A base devolve 108% da chave e o bônus adicional continua proporcional à colaboração.
    // Em grupos equilibrados, isso gera ~20-30% de margem bruta antes de poções/consumíveis.
    const keyReturn=Math.floor(cfg.keyPrice*1.08)
    const collaborationBonus=Math.floor(cfg.cashPool*(.04+.12*share))
    const cash=Math.max(250,keyReturn+collaborationBonus)*moneyMultiplier
    const exp=Math.round(Math.max(20,Math.floor(cfg.xpPool*(.10+.90*share)*(1+Number(pb.xp||0))))*xpMultiplier)
    await credit(c,p.jid,cash,`raid_${cfg.level}`)
    await grantExpInTransaction(c,p.jid,exp)
    const petXp=p.pet&&Number(p.pet.turns||0)>0?Math.max(5,Math.round(Math.floor(cfg.petXpPool*(.15+.85*share))*petXpMultiplier)):0
    const petXpTeam=petXp?await grantTeamPetXp(c,p.jid,petXp):[]

    let material=null,drop=null,gearDrop=null
    // Fragmentos variam por colocação e escalam com a dificuldade/tempo da Raid.
    // Top 3 precisa ter participação real (>= 2% do dano total); evita carona de 1 ataque.
    // O teto da faixa é propositalmente raro via pesos decrescentes.
    const materialRanges={
      10:[[2,4],[1,3],[1,2]],
      15:[[3,5],[2,4],[1,2]],
      20:[[4,6],[2,4],[1,3]],
      25:[[5,7],[3,5],[1,3]],
      30:[[6,9],[4,6],[2,3]],
      40:[[8,11],[5,7],[2,4]],
      50:[[9,12],[6,8],[3,5]]
    }
    const weightedRange=(min,max)=>{
      const values=[]
      for(let n=min;n<=max;n++) for(let w=Math.max(1,max-n+1);w>0;w--) values.push(n)
      return values[Math.floor(Math.random()*values.length)]
    }
    const range=(materialRanges[cfg.level]||materialRanges[50])?.[i]
    const eligibleMaterial=Boolean(range)&&share>=.02
    const baseQty=eligibleMaterial?weightedRange(range[0],range[1]):0
    // Durante a Invasão das Raids, os materiais de invocação de pet continuam triplicados.
    const qty=raidEventActive ? baseQty*3 : baseQty
    if(qty>0){
      await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',[p.jid,cfg.material.id,qty])
      material={...cfg.material,qty}
    }
    if(cfg.box){
      // Lv15-25: aproximadamente metade da chance antiga.
      // Lv30+: o 1º colocado não recebe mais caixa garantida; base de 55%.
      let boxChance
      if(cfg.level>=30 && i===0){
        boxChance=Math.min(.65,.55+Number(pb.drop||0)*.50)
      }else if(cfg.level>=30){
        boxChance=Math.min(.45,.08+share*.45+Number(pb.drop||0)*.25)
      }else{
        boxChance=Math.min(.35,.06+share*.325+Number(pb.drop||0)*.20)
      }
      if(cacadaActive) boxChance=Math.min(.70,boxChance*1.20)
      if(Math.random()<boxChance){
        await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1',[p.jid,cfg.box])
        drop={id:cfg.box,name:cfg.box==='caixa_epica'?'Caixa Épica':cfg.box==='caixa_rara'?'Caixa Rara':'Caixa da Sorte',rarity:cfg.box==='caixa_epica'?'Épico':cfg.box==='caixa_rara'?'Raro':'Comum'}
      }
    }
    if(Array.isArray(cfg.gear)&&cfg.gear.length){
      // Equipamento direto deve ser raro. Colaboração, 1º lugar e pet de drop
      // ajudam, mas não podem transformar lendário em recompensa frequente.
      const rankBonus=i===0?(cfg.level>=40?.003:.005):0
      const collaborationBonus=Math.min(.004,share*.008)
      const petDropBonus=Math.min(.008,Number(pb.drop||0)*.10)
      const baseGearChance=Math.min(.08,Number(cfg.gearChance||0)+rankBonus+collaborationBonus+petDropBonus+gearEventBonus)
      const chance=cacadaActive?Math.min(.08,baseGearChance*1.20):baseGearChance
      if(Math.random()<chance){
        const gearId=cfg.gear[Math.floor(Math.random()*cfg.gear.length)]
        const item=(await c.query('SELECT id,name,rarity FROM items WHERE id=$1',[gearId])).rows[0]
        if(item){
          await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1',[p.jid,gearId])
          gearDrop={id:item.id,name:item.name,rarity:item.rarity}
        }
      }
    }
    rewards.push({jid:p.jid,name:p.name,damage:Number(p.damage||0),petBonusDamage:Number(p.petBonusDamage||0),petSkillHealing:Number(p.petSkillHealing||0),share,cash,exp,petXp,petXpTeam,material,drop,gearDrop})
  }
  return rewards
}

export async function raidRound(chat,level){
  return tx(async c=>{
    const rooms=await resolveRaidRoom(c,chat,level||null)
    const s=rooms.find(r=>r.status==='active'&&(!level||Number(r.level)===Number(level)))
    if(!s) return {reason:'inactive'}
    const gameType=s.gameType
    const cfg=raidConfig(s.level)
    if(!cfg) throw new Error('Configuração da Raid não encontrada.')
    const roundNow=Date.now()
    const lastRoundAt=Number(s.lastRoundAt||0)
    const raidCadenceMs=8000
    if(lastRoundAt && roundNow-lastRoundAt<raidCadenceMs-250){
      return {reason:'cooldown',remainingMs:Math.max(250,raidCadenceMs-(roundNow-lastRoundAt)),round:Number(s.round||0),hp:Number(s.hp||0),maxHp:Number(s.maxHp||0),config:cfg}
    }
    s.lastRoundAt=roundNow
    const durationMs=Number(s.durationMinutes||raidDurationMinutes(cfg.level))*60*1000
    const elapsedMs=Number.isFinite(Number(s.activeElapsedMs))
      ? Number(s.activeElapsedMs)
      : Math.max(0,Number(s.round||0)*8000)
    if(elapsedMs>=durationMs){
      s.status='failed';s.failReason='timeout';s.activeElapsedMs=elapsedMs;await saveGame(c,chat,gameType,s)
      return {failed:true,reason:'timeout',config:cfg,hp:s.hp,maxHp:s.maxHp}
    }

    s.round=Number(s.round||0)+1
    s.activeElapsedMs=elapsedMs+8000
    s.expiresAt=Date.now()+Math.max(0,durationMs-s.activeElapsedMs)
    const events=[]
    const alive=Object.values(s.players||{}).filter(p=>p.alive)
    if(!alive.length){
      s.status='failed';s.failReason='party_wipe';await saveGame(c,chat,gameType,s)
      return {failed:true,reason:'party_wipe',config:cfg,hp:s.hp,maxHp:s.maxHp}
    }

    for(const p of alive){
      let pb={damage:0,crit:0}
      const teamSynergy=p.teamSynergy||{attack:0,defense:0,crit:0}

      // Se o Principal foi curado fora da Raid enquanto o Reserva estava em campo,
      // a próxima rodada volta a priorizar automaticamente o Slot 1.
      if(p.pet&&Number(p.pet.teamSlot)===3){
        const primaryRow=(await c.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[p.jid])).rows[0]||null
        const primary=raidCombatPetState(primaryRow,1)
        if(primary&&Number(primary.hp)>0&&Number(primary.energy)>0){
          await persistRaidCombatPet(c,p.jid,p.pet)
          p.reservePet=p.pet
          p.pet=primary
          events.push({type:'pet_return',jid:p.jid,name:p.name,petName:primary.name})
        }
      }

      if(p.pet){
        p.pet.roundActive=Number(p.pet.energy)>0&&Number(p.pet.hp)>0
        if(p.pet.roundActive){
          pb=p.pet.bonus||pb
          p.pet.energy=Number(p.pet.energy)-1
          p.pet.turns=Number(p.pet.turns||0)+1
          await persistRaidCombatPet(c,p.jid,p.pet)
        }
      }
      const petCritChance=Math.max(0,Number(pb.crit||0)+Number(teamSynergy.crit||0))
      const gearCritChance=Math.max(0,Number(p.crit||0))
      const roll=Math.random()
      const petCrit=petCritChance>0&&roll<petCritChance
      const gearCrit=!petCrit&&gearCritChance>0&&roll<Math.min(.50,petCritChance+gearCritChance)
      const crit=petCrit||gearCrit
      const variance=.82+Math.random()*.38
      const raw=Math.max(5,Math.floor(Number(p.atk||1)*variance))
      const baseline=Math.max(5,Math.floor(raw*(gearCrit?1.5:1)*3))
      const mult=(1+Number(pb.damage||0)+Number(teamSynergy.attack||0))*3
      const dmg=Math.max(5,Math.floor(raw*mult*(crit?1.5:1)))
      const petExtra=p.pet?Math.max(0,dmg-baseline):0
      if(p.pet) p.pet.extraDamage=Number(p.pet.extraDamage||0)+petExtra
      p.petBonusDamage=Number(p.petBonusDamage||0)+petExtra
      p.damage=Number(p.damage||0)+dmg
      s.hp=Math.max(0,Number(s.hp)-dmg)
      events.push({type:'hit',jid:p.jid,name:p.name,damage:dmg,crit})
      if(Number(s.hp)<=0) break
    }

    if(Number(s.hp)<=0){
      s.status='completed';s.completedAt=Date.now()
      const rewards=await finishRaidRewards(c,s,cfg)
      await saveGame(c,chat,gameType,s)
      return {victory:true,config:cfg,round:s.round,hp:0,maxHp:s.maxHp,rewards,events}
    }

    const special=Math.random()<.22
    const specialName=special?(cfg.level>=40?'Ruptura do Núcleo':'Golpe Devastador'):null
    const potionRows=(await c.query('SELECT jid,item_id,quantity FROM inventories WHERE jid=ANY($1::text[]) AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',[alive.map(x=>x.jid),['pocao_p','pocao_m','pocao_g','elixir_supremo']])).rows
    const petPotionRows=(await c.query('SELECT jid,item_id,quantity FROM inventories WHERE jid=ANY($1::text[]) AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',[alive.map(x=>x.jid),['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema']])).rows
    for(const p of alive.filter(x=>x.alive)){
      const pb=p.pet?.roundActive?(p.pet.bonus||{defense:0,dodge:0}):{defense:0,dodge:0}
      const teamSynergy=p.teamSynergy||{attack:0,defense:0,crit:0}
      const dodged=Number(pb.dodge||0)>0&&Math.random()<Number(pb.dodge||0)
      const raw=Math.max(1,Math.round((cfg.atk-Number(p.def||0)*.22)*(.82+Math.random()*.36)*(1-Number(pb.defense||0))*(1-Number(teamSynergy.defense||0))))
      // Crítico do Boss é raro e não acumula com Golpe Devastador/Ruptura.
      const bossCritical=!dodged&&!special&&Math.random()<.05
      const dmg=dodged?0:Math.max(1,Math.round(raw*(special?1.55:(bossCritical?1.5:1))))
      p.hp=Math.max(0,Number(p.hp)-dmg)
      let petDamage=0,petFainted=false,autoPetHeal=null,petSwitch=null,fallenPetName=null
      if(p.pet?.roundActive&&Number(p.pet.hp)>0){
        const petDefense=Math.max(0,Math.min(.75,Number(p.pet.bonus?.defense||0)))
        petDamage=Math.max(1,Math.round(cfg.atk*(.28+Math.random()*.20)*(special?1.25:1)*(1-petDefense)))
        p.pet.hp=Math.max(0,Number(p.pet.hp)-petDamage)
        petFainted=p.pet.hp<=0
        if(petFainted){
          fallenPetName=p.pet.name
          await persistRaidCombatPet(c,p.jid,p.pet)
          const reserve=p.reservePet&&Number(p.reservePet.hp)>0&&Number(p.reservePet.energy)>0?p.reservePet:null
          if(reserve){
            petSwitch={from:fallenPetName,to:reserve.name}
            p.pet=reserve
            p.reservePet=null
            p.pet.roundActive=false
            petFainted=false
          }else{
            const missing=Math.max(1,Number(p.pet.maxHp||0)-Number(p.pet.hp||0))
            const chosenPet=raidPetPotion(petPotionRows.filter(x=>x.jid===p.jid&&Number(x.quantity)>0),missing)
            if(chosenPet){
              p.pet.hp=Math.min(Number(p.pet.maxHp||petMaxHp(p.pet.level,p.pet.xp,p.pet.species)),Number(p.pet.hp||0)+Number(chosenPet.heal||0))
              const row=petPotionRows.find(x=>x.jid===p.jid&&x.item_id===chosenPet.item_id)
              if(row) row.quantity=Number(row.quantity)-1
              await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[p.jid,chosenPet.item_id])
              autoPetHeal={id:chosenPet.item_id,name:chosenPet.name,heal:Number(chosenPet.heal||0),hp:Number(p.pet.hp)}
              petFainted=false
              await persistRaidCombatPet(c,p.jid,p.pet)
            }
          }
        }else{
          await persistRaidCombatPet(c,p.jid,p.pet)
        }
      }
      let petSkillHeal=null
      const healCooldown=Math.max(0,Number(p.pet?.bonus?.healCooldown||0))
      if(
        p.pet?.roundActive && Number(p.pet.hp)>0 && p.hp>0 && Number(p.maxHp)>0 &&
        Number(p.pet?.bonus?.healPct||0)>0 && healCooldown>0 &&
        Number(p.pet.turns||0)%healCooldown===0 &&
        Number(p.hp)/Number(p.maxHp)<.70
      ){
        const requested=Math.max(1,Math.round(Number(p.maxHp)*Number(p.pet.bonus.healPct)))
        const beforeHeal=Number(p.hp)
        p.hp=Math.min(Number(p.maxHp),beforeHeal+requested)
        const healed=Math.max(0,Number(p.hp)-beforeHeal)
        if(healed>0){
          p.petSkillHealing=Number(p.petSkillHealing||0)+healed
          petSkillHeal={
            name:p.pet.name,
            species:p.pet.species,
            heal:healed,
            hp:Number(p.hp),
            maxHp:Number(p.maxHp),
            cooldown:healCooldown
          }
        }
      }

      let autoHeal=null
      if(p.hp<=0){
        const chosen=raidPotion(potionRows.filter(x=>x.jid===p.jid&&Number(x.quantity)>0),Number(p.maxHp))
        if(chosen){
          p.hp=Math.min(Number(p.maxHp),chosen.heal)
          p.heals=Number(p.heals||0)+1
          const row=potionRows.find(x=>x.jid===p.jid&&x.item_id===chosen.item_id)
          if(row) row.quantity=Number(row.quantity)-1
          await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[p.jid,chosen.item_id])
          autoHeal={id:chosen.item_id,name:chosen.name}
        }else p.alive=false
      }
      await c.query('UPDATE stats SET hp=$1 WHERE jid=$2',[p.hp,p.jid])
      events.push({type:'boss',jid:p.jid,name:p.name,damage:dmg,hp:p.hp,dodged,critical:bossCritical,autoHeal,autoPetHeal,petSkillHeal,petSwitch,fallenPetName,alive:p.alive,petDamage,petHp:p.pet?.hp??null,petMaxHp:p.pet?.maxHp??null,petName:p.pet?.name||null,petFainted})
    }

    const survivors=Object.values(s.players||{}).filter(p=>p.alive).length
    if(!survivors){
      s.status='failed';s.failReason='party_wipe';await saveGame(c,chat,gameType,s)
      return {failed:true,reason:'party_wipe',config:cfg,round:s.round,hp:s.hp,maxHp:s.maxHp,events}
    }
    await saveGame(c,chat,gameType,s)
    return {config:cfg,round:s.round,hp:s.hp,maxHp:s.maxHp,survivors,special,specialName,events}
  })
}

async function grantBossItem(c,jid,item){
  await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
    ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1`,[jid,item.id])
  return item
}
const RECLASS_SCROLL_DROP=Object.freeze({
  id:'pergaminho_reclassificacao',
  name:'Pergaminho de Reclassificação',
  rarity:'Épico'
})
async function maybeGrantReclassScroll(c,jid,mode){
  const user=(await c.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]
  if(Number(user?.level||1)<100) return null
  const chance=mode==='weekly'?.03:.01
  if(Math.random()>=chance) return null
  return grantBossItem(c,jid,RECLASS_SCROLL_DROP)
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

const SIEGE_EVENT_START=Date.parse('2026-10-04T18:00:00-03:00')
const SIEGE_EVENT_END=Date.parse('2026-10-04T20:10:00-03:00')
const SIEGE_EVENT_KEY='cerco-colosso-2026-10-04'

async function createSiegeBossEventState(c,chat){
  const maxHp=170000+Math.floor(Math.random()*30001)
  const state={
    mode:'event',eventId:'cerco_colosso',active:true,origin:'scheduled',
    scheduleKey:SIEGE_EVENT_KEY,name:'Colosso do Cerco',
    hp:maxHp,maxHp,atk:26,participants:{},startedAt:Date.now(),endsAt:SIEGE_EVENT_END
  }
  await saveGame(c,chat,'boss_event',state)
  return state
}

export async function autoStartSiegeBossEvent(chat,now=new Date()){
  const ts=now.getTime()
  return tx(async c=>{
    const current=await loadGame(c,chat,'boss_event')
    if(ts>=SIEGE_EVENT_END){
      if(current?.eventId==='cerco_colosso'&&current.active!==false&&Number(current.hp)>0){
        current.active=false;current.mode='event_stopped';current.stoppedAt=Date.now()
        await saveGame(c,chat,'boss_event',current)
        return {due:false,ended:true,stopped:true,...current}
      }
      return {due:false,ended:true}
    }
    if(ts<SIEGE_EVENT_START) return {due:false}

    // Recuperação única do Cerco de 04/10: a versão antiga encerrou às 20:00
    // antes da extensão entrar em produção. Reabre o mesmo estado, preservando
    // participantes/dano/recompensas, somente até o novo fim às 20:10.
    if(
      current?.eventId==='cerco_colosso' &&
      current.mode==='event_stopped' &&
      Number(current.hp)>0 &&
      current.scheduleKey===SIEGE_EVENT_KEY
    ){
      current.active=true
      current.mode='event'
      current.endsAt=SIEGE_EVENT_END
      current.reopenedAfterExtension=true
      delete current.stoppedAt
      if(Number(current.hp)>5000) current.hp=5000
      await saveGame(c,chat,'boss_event',current)
      return {due:true,reopened:true,...current}
    }

    if(current&&current.active!==false&&Number(current.hp)>0){
      if(current.eventId==='cerco_colosso'){
        if(Number(current.hp)>5000){
          current.hp=5000
          current.manualHpAdjustment='2026-10-04:set-to-5000'
          await saveGame(c,chat,'boss_event',current)
        }
        return {due:true,already:true,...current}
      }
      return {due:true,blocked:true}
    }
    if(current?.scheduleKey===SIEGE_EVENT_KEY) return {due:true,alreadyRun:true,...current}
    const state=await createSiegeBossEventState(c,chat)
    return {due:true,spawned:true,...state}
  })
}

const NIGHT_EVENT_START=Date.parse('2026-10-04T03:00:00-03:00')
const NIGHT_EVENT_END=Date.parse('2026-10-04T03:30:00-03:00')
const NIGHT_EVENT_KEY='night-0303-2026-10-04'

async function createNightBossEventState(c,chat){
  const maxHp=36000+Math.floor(Math.random()*6001)
  const state={mode:'event',eventId:'night_0303',active:true,origin:'scheduled',scheduleKey:NIGHT_EVENT_KEY,name:'Sentinela das 03:03',hp:maxHp,maxHp,atk:20,participants:{},startedAt:Date.now(),endsAt:NIGHT_EVENT_END}
  await saveGame(c,chat,'boss_event',state)
  return state
}

export async function autoStartNightBossEvent(chat,now=new Date()){
  const ts=now.getTime()
  return tx(async c=>{
    const current=await loadGame(c,chat,'boss_event')
    if(ts>=NIGHT_EVENT_END){
      if(current?.eventId==='night_0303'&&current.active!==false&&Number(current.hp)>0){
        current.active=false;current.mode='event_stopped';current.stoppedAt=Date.now()
        await saveGame(c,chat,'boss_event',current)
        return {due:false,ended:true,stopped:true,...current}
      }
      return {due:false,ended:true}
    }
    if(ts<NIGHT_EVENT_START) return {due:false}
    if(current&&current.active!==false&&Number(current.hp)>0){
      if(current.eventId==='night_0303') return {due:true,already:true,...current}
      return {due:true,blocked:true}
    }
    if(current?.scheduleKey===NIGHT_EVENT_KEY) return {due:true,alreadyRun:true,...current}
    const state=await createNightBossEventState(c,chat)
    return {due:true,spawned:true,...state}
  })
}

const BOSS_EVENT_AUTO_NOT_BEFORE=Date.parse('2026-10-09T19:00:00-03:00')

function bossEventFridayInfo(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',
    year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
  const friday=parts.weekday==='Fri'
  const hour=Number(parts.hour||0),minute=Number(parts.minute||0)
  const due=friday&&(hour>19||(hour===19&&minute>=0))
  const fridayKey=friday?`${parts.year}-${parts.month}-${parts.day}`:null
  return {due,friday,fridayKey,hour,minute}
}

async function createBossEventState(c,chat,{scheduleKey=null,origin='manual'}={}){
  const maxHp=55000+Math.floor(Math.random()*10001)
  const state={
    mode:'event',
    eventId:'eclipse',
    active:true,
    origin,
    scheduleKey,
    name:'Imperador do Eclipse',
    hp:maxHp,
    maxHp,
    atk:24,
    participants:{},
    startedAt:Date.now()
  }
  await saveGame(c,chat,'boss_event',state)
  return state
}

async function maybeGrantEventRelic(c,jid,chance){
  const owned=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jid,'insignia_eclipse'])).rows[0]
  if(Number(owned?.quantity||0)>0 || Math.random()>=Math.max(0,Math.min(.50,Number(chance)||0))) return null
  await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
    ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)`,[jid,'insignia_eclipse'])
  return {id:'insignia_eclipse',name:'Insígnia do Eclipse',rarity:'Evento Único'}
}

export async function getBossEventStatus(chat){
  return tx(async c=>{
    const s=await loadGame(c,chat,'boss_event')
    return s&&s.active!==false&&Number(s.hp)>0?s:null
  })
}

export async function activateBossEvent(chat){
  return tx(async c=>{
    const current=await loadGame(c,chat,'boss_event')
    if(current&&current.active!==false&&Number(current.hp)>0) return {already:true,...current}
    return createBossEventState(c,chat,{origin:'manual'})
  })
}

export async function autoStartBossEvent(chat,now=new Date()){
  if(now.getTime()<BOSS_EVENT_AUTO_NOT_BEFORE) return {due:false,notBefore:BOSS_EVENT_AUTO_NOT_BEFORE}
  const schedule=bossEventFridayInfo(now)
  if(!schedule.due) return {due:false}
  return tx(async c=>{
    const current=await loadGame(c,chat,'boss_event')

    // O evento manual que já estava ativo quando o agendamento foi criado
    // conta como o evento desta sexta, evitando um segundo spawn no mesmo dia.
    if(current&&current.active!==false&&Number(current.hp)>0){
      if(!current.scheduleKey){
        current.scheduleKey=schedule.fridayKey
        current.origin=current.origin||'manual'
        await saveGame(c,chat,'boss_event',current)
      }
      return {due:true,already:true,...current}
    }

    // Derrotado ou encerrado: nunca recria o Boss na mesma sexta.
    if(current?.scheduleKey===schedule.fridayKey){
      return {due:true,alreadyRun:true,...current}
    }

    const state=await createBossEventState(c,chat,{scheduleKey:schedule.fridayKey,origin:'scheduled'})
    return {due:true,spawned:true,...state}
  })
}

export async function deactivateBossEvent(chat){
  return tx(async c=>{
    const current=await loadGame(c,chat,'boss_event')
    if(!current||current.active===false||Number(current.hp)<=0) return {active:false,already:true}
    const marker={...current,mode:'event_stopped',active:false,stoppedAt:Date.now()}
    await saveGame(c,chat,'boss_event',marker)
    return {active:false,stopped:true,name:current.name,hp:Number(current.hp),maxHp:Number(current.maxHp)}
  })
}

export async function startBoss(chat){
  const weekend=bossWeekendInfo()
  return tx(async c=>{
    const event=await loadGame(c,chat,'boss_event')
    if(event&&event.active!==false&&Number(event.hp)>0&&(!event.endsAt||Number(event.endsAt)>Date.now())) return {already:true,...event}
    const current=await loadGame(c,chat,'boss')
    // Sessões criadas antes da separação semanal/comum não possuíam `mode`.
    // Normalize-as sem apagar participantes, para que a conclusão semanal seja persistida.
    if(current&&!current.mode&&Number(current.maxHp)>=25000&&current.weekendKey===weekend.weekendKey){
      current.mode='weekly'; current.weeklyCompleted=false
      await saveGame(c,chat,'boss',current)
    }
    // Um Superboss só pode existir uma vez por fim de semana. O marcador de conclusão
    // permanece salvo mesmo depois que Bosses comuns forem iniciados.
    const weeklyCompleted=Boolean(current?.weeklyCompleted&&current.weekendKey===weekend.weekendKey)
    const weeklyAlreadyRan=Boolean(current?.weekendKey===weekend.weekendKey&&(
      current?.weeklyCompleted||
      (current?.mode==='weekly'&&Number(current.hp)<=0)||
      (current?.mode==='completed'&&Number(current.maxHp)>=25000)
    ))
    if(weekend.open&&!weeklyAlreadyRan){
      if(current?.mode==='weekly'&&current.weekendKey===weekend.weekendKey&&Number(current.hp)>0&&Number(current.endsAt||0)>Date.now()){
        return {already:true,...current,endsLabel:weekend.endsLabel}
      }
      const maxHp=85000+Math.floor(Math.random()*25001)
      const state={mode:'weekly',name:'Golem Ancestral do Alpha',hp:maxHp,maxHp,atk:20,participants:{},startedAt:Date.now(),weekendKey:weekend.weekendKey,weeklyCompleted:false,endsAt:weekend.endsAt,endsLabel:weekend.endsLabel}
      await saveGame(c,chat,'boss',state); return state
    }
    if(current?.mode==='common'&&Number(current.hp)>0) return {already:true,...current}
    // Boss comum: no máximo 1 novo Boss por grupo a cada 2 horas após a derrota.
    const commonCooldownMs=60*60*1000
    const lastCommonEndedAt=Number(current?.lastCommonEndedAt||0)
    if(lastCommonEndedAt&&Date.now()-lastCommonEndedAt<commonCooldownMs){
      const remaining=Math.ceil((commonCooldownMs-(Date.now()-lastCommonEndedAt))/60000)
      return {cooldown:true,mode:'common',remainingMinutes:remaining,weeklyCompleted:Boolean(weeklyCompleted)}
    }
    const maxHp=9000+Math.floor(Math.random()*3001)
    const state={mode:'common',name:'Golem do Alpha',hp:maxHp,maxHp,atk:11,participants:{},startedAt:Date.now(),weekendKey:weekend.weekendKey,weeklyCompleted:Boolean(weeklyCompleted),lastCommonEndedAt}
    await saveGame(c,chat,'boss',state); return state
  })
}
async function loadBossCombatPet(c,jid,slot=1){
  slot=Number(slot)||1
  if(slot===1){
    const p=(await c.query('SELECT species,name,level,xp,energy,hp,max_hp FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]||null
    return p?{...p,teamSlot:1,collectionId:null}:null
  }
  const p=(await c.query(`SELECT p.* FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id
    WHERE t.jid=$1 AND t.slot=$2 FOR UPDATE OF p`,[jid,slot])).rows[0]||null
  return p?{...p,teamSlot:slot,collectionId:Number(p.id)}:null
}

async function persistBossCombatPet(c,jid,pet){
  if(!pet) return
  if(Number(pet.teamSlot)===1){
    await c.query('UPDATE pets SET hp=$1,energy=$2 WHERE jid=$3',[pet.hp,pet.energy,jid])
    await c.query('UPDATE pet_collection SET hp=$1,energy=$2 WHERE jid=$3 AND active=TRUE',[pet.hp,pet.energy,jid])
  }else if(pet.collectionId){
    await c.query('UPDATE pet_collection SET hp=$1,energy=$2 WHERE id=$3 AND jid=$4',[pet.hp,pet.energy,pet.collectionId,jid])
  }
}
export async function attackBoss(chat,jid,name,usePet=true){
  await ensureUser(jid,name||'')
  const weekend=bossWeekendInfo()
  return tx(async c=>{
    const now=Math.floor(Date.now()/1000)
    const sleeping=await c.query('SELECT ends_at FROM player_sleep WHERE jid=$1 AND ends_at>$2',[jid,now])
    if(sleeping.rows.length) throw new Error('Você está dormindo e não pode atacar o Boss agora.')
    const carpindo=await c.query('SELECT ends_at FROM player_carpinar WHERE jid=$1 AND ends_at>$2',[jid,now])
    if(carpindo.rows.length) throw new Error('Você está carpindo e não pode atacar o Boss agora.')
    const event=await loadGame(c,chat,'boss_event')
    const eventActive=Boolean(event&&event.active!==false&&Number(event.hp)>0&&(!event.endsAt||Number(event.endsAt)>Date.now()))
    const gameType=eventActive?'boss_event':'boss'
    const s=eventActive?event:await loadGame(c,chat,'boss')
    if(!s||Number(s.hp)<=0) throw new Error('Não há Boss ativo. Use !boss para iniciar um.')
    if(gameType==='boss'&&!s.mode&&Number(s.maxHp)>=25000&&s.weekendKey===weekend.weekendKey){
      s.mode='weekly'; s.weeklyCompleted=false
    }
    if(gameType==='boss'&&s.mode==='weekly'&&(!weekend.open||s.weekendKey!==weekend.weekendKey||Number(s.endsAt||0)<=Date.now())) throw new Error('O Superboss semanal encerrou. Use !boss para iniciar um Boss comum.')
    const st=(await c.query('SELECT hp,max_hp,atk,def,weapon_id,armor_id FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(st?.hp||0)<=0) return {playerDead:true,hp:Number(s.hp),maxHp:Number(s.maxHp)}
    s.participants=s.participants||{}
    const existingParticipant=s.participants[jid]||{}
    const bossCadenceMs=gameType==='boss_event'?8000:10000
    const bossLastAttackAt=Number(existingParticipant.lastAttackAt||0)
    const bossNow=Date.now()
    if(bossLastAttackAt && bossNow-bossLastAttackAt<bossCadenceMs-250){
      return {cooldown:true,remainingMs:Math.max(250,bossCadenceMs-(bossNow-bossLastAttackAt)),mode:s.mode||'common',hp:Number(s.hp||0),maxHp:Number(s.maxHp||0)}
    }
    let activePetSlot=Number(existingParticipant.activePetSlot||1)
    let petRow=usePet?await loadBossCombatPet(c,jid,activePetSlot):null
    let petSwitch=null
    if(usePet&&activePetSlot===1&&petRow&&Number(petRow.hp)<=0){
      const reserve=await loadBossCombatPet(c,jid,3)
      if(reserve&&Number(reserve.hp)>0&&Number(reserve.energy)>=2){
        petSwitch={from:petRow.name,to:reserve.name}
        activePetSlot=3
        petRow=reserve
      }
    }
    const petNoEnergy=Boolean(usePet&&petRow&&Number(petRow.energy)<2)
    const petNoHp=Boolean(usePet&&petRow&&Number(petRow.hp)<=0)
    const petUnavailable=petNoEnergy||petNoHp||Boolean(usePet&&!petRow)
    let pet=petUnavailable?null:petRow
    if(pet){
      pet.energy=Number(pet.energy)-2
      await persistBossCombatPet(c,jid,pet)
    }
    const petBonus=petBossBonus(pet)
    const teamPets=(await c.query(
      'SELECT t.slot,p.species FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id WHERE t.jid=$1 ORDER BY t.slot',
      [jid]
    )).rows
    const teamSynergy=petTeamSynergy(teamPets)||{attack:0,defense:0,crit:0}
    const upgradeRows=(await c.query(
      'SELECT item_id,level FROM equipment_upgrades WHERE jid=$1 AND item_id=ANY($2::text[])',
      [jid,[st.weapon_id,st.armor_id].filter(Boolean)]
    )).rows
    const itemLevel=itemId=>Number(upgradeRows.find(r=>r.item_id===itemId)?.level||1)
    const weapon=st.weapon_id?equipmentStatsAtLevel(st.weapon_id,itemLevel(st.weapon_id)):{atk:0,def:0,hp:0,crit:0}
    const armor=st.armor_id?equipmentStatsAtLevel(st.armor_id,itemLevel(st.armor_id)):{atk:0,def:0,hp:0,crit:0}
    const atk=Number(st.atk)+Number(weapon?.atk||0)+Number(armor?.atk||0)
    const def=Number(st.def)+Number(weapon?.def||0)+Number(armor?.def||0)
    const gearHp=Number(weapon?.hp||0)+Number(armor?.hp||0)
    const effectiveMaxHp=Number(st.max_hp)+gearHp
    const petCritChance=Math.max(0,Number(petBonus.crit||0)+Number(teamSynergy.crit||0))
    const gearCritChance=Math.max(0,Number(weapon?.crit||0)+Number(armor?.crit||0))
    const baseCritChance=.10
    const roll=Math.random()
    const totalCritChance=Math.min(.45,baseCritChance+gearCritChance+petCritChance)
    const crit=roll<totalCritChance
    const petCrit=crit&&roll>=Math.min(totalCritChance,baseCritChance+gearCritChance)
    const gearCrit=crit&&!petCrit
    const petMultiplier=1+petBonus.damage+Number(teamSynergy.attack||0)
    const variance=.85+Math.random()*.45
    const rawBase=Math.max(5,Math.floor(atk*variance))
    const baselineWithGearCrit=Math.max(5,Math.floor(rawBase*(gearCrit?1.5:1)))
    const damage=Math.max(5,Math.floor(rawBase*petMultiplier*(crit?1.5:1)))
    const petDamage=pet?Math.max(0,damage-baselineWithGearCrit):0
    s.hp=Math.max(0,Number(s.hp)-damage)
    const old=existingParticipant
    const attackCount=Number(old.attacks||0)+1
    s.participants[jid]={
      ...old,
      damage:Number(old.damage||0)+damage,
      name:old.name||name||'Jogador',
      attacks:attackCount,
      petHealing:Number(old.petHealing||0),
      activePetSlot,
      lastAttackAt:bossNow
    }
    let php=Math.min(Number(st.hp),effectiveMaxHp),bossDamage=0,bossCritical=false,autoHeal=null,autoPetHeal=null,petSkillHeal=null
    if(s.hp>0){
      const dodged=petBonus.dodge>0&&Math.random()<petBonus.dodge
      bossCritical=!dodged&&Math.random()<.05
      bossDamage=dodged?0:Math.max(1,Math.round((Number(s.atk||18)-def*.22)*(.8+Math.random()*.4)*(1-petBonus.defense)*(1-Number(teamSynergy.defense||0))*(bossCritical?1.5:1)))
      php=Math.max(0,php-bossDamage)
      if(pet){
        const petTaken=Math.max(1,Math.round(Number(s.atk||18)*(.30+Math.random()*.22)*(1-Math.min(.75,Number(petBonus.defense||0)))))
        pet.hp=Math.max(0,Number(pet.hp)-petTaken)
        pet.petDamageTaken=petTaken
        pet.petFainted=pet.hp<=0
        // Boss/eventos seguem a mesma política preventiva da Raid:
        // abaixo de 35% de HP, usa automaticamente a menor poção de pet
        // suficiente. Em 0 HP, preserva a prioridade de troca para o Reserva.
        const maxPetHp=Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species))
        if(!pet.petFainted && maxPetHp>0 && Number(pet.hp)/maxPetHp<.35){
          const petPotionIds=['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema']
          const petPotionRows=(await c.query(
            'SELECT item_id,quantity FROM inventories WHERE jid=$1 AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',
            [jid,petPotionIds]
          )).rows
          const missing=Math.max(1,maxPetHp-Number(pet.hp||0))
          const chosenPet=raidPetPotion(petPotionRows,missing)
          if(chosenPet){
            pet.hp=Math.min(maxPetHp,Number(pet.hp||0)+Number(chosenPet.heal||0))
            await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,chosenPet.item_id])
            autoPetHeal={id:chosenPet.item_id,name:chosenPet.name,heal:Number(chosenPet.heal||0),hp:Number(pet.hp),maxHp:maxPetHp,petName:pet.name}
          }
        }
        await persistBossCombatPet(c,jid,pet)
        if(pet.petFainted){
          let switched=false
          if(Number(pet.teamSlot||1)===1){
            const reserve=await loadBossCombatPet(c,jid,3)
            if(reserve&&Number(reserve.hp)>0&&Number(reserve.energy)>=2){
              petSwitch={from:pet.name,to:reserve.name}
              s.participants[jid].activePetSlot=3
              switched=true
            }
          }
          // Mesmo comportamento da Raid: sem Reserva disponível, o pet usa
          // automaticamente a menor poção suficiente quando chegar a 0 HP.
          if(!switched){
            const petPotionIds=['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema']
            const petPotionRows=(await c.query(
              'SELECT item_id,quantity FROM inventories WHERE jid=$1 AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',
              [jid,petPotionIds]
            )).rows
            const missing=Math.max(1,Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species))-Number(pet.hp||0))
            const chosenPet=raidPetPotion(petPotionRows,missing)
            if(chosenPet){
              const maxPetHp=Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species))
              pet.hp=Math.min(maxPetHp,Number(pet.hp||0)+Number(chosenPet.heal||0))
              pet.petFainted=false
              await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,chosenPet.item_id])
              await persistBossCombatPet(c,jid,pet)
              autoPetHeal={id:chosenPet.item_id,name:chosenPet.name,heal:Number(chosenPet.heal||0),hp:Number(pet.hp),maxHp:maxPetHp,petName:pet.name}
            }
          }
        }
      }
      // Skill de cura do pet principal: ativa por ciclos do próprio jogador.
      // Não ressuscita e ocorre antes da poção automática.
      const healCooldown=Math.max(0,Number(petBonus.healCooldown||0))
      if(
        pet && Number(pet.hp)>0 && php>0 && effectiveMaxHp>0 &&
        Number(petBonus.healPct||0)>0 && healCooldown>0 &&
        attackCount%healCooldown===0 &&
        php/effectiveMaxHp<.70
      ){
        const requested=Math.max(1,Math.round(effectiveMaxHp*Number(petBonus.healPct)))
        const beforeHeal=php
        php=Math.min(effectiveMaxHp,php+requested)
        const healed=Math.max(0,php-beforeHeal)
        if(healed>0){
          s.participants[jid].petHealing=Number(s.participants[jid].petHealing||0)+healed
          petSkillHeal={
            name:pet.name,
            species:pet.species,
            heal:healed,
            hp:php,
            maxHp:effectiveMaxHp,
            cooldown:healCooldown
          }
        }
      }

      if(php<=0){
        const ids=['pocao_p','pocao_m','pocao_g','elixir_supremo']
        const heals={pocao_p:35,pocao_m:80,pocao_g:160,elixir_supremo:999999}
        const names={pocao_p:'Poção Pequena',pocao_m:'Poção Média',pocao_g:'Poção Grande',elixir_supremo:'Elixir Supremo'}
        const inv=(await c.query('SELECT item_id,quantity FROM inventories WHERE jid=$1 AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',[jid,ids])).rows
        const available=inv.map(x=>({...x,heal:heals[x.item_id]})).sort((a,b)=>a.heal-b.heal)
        const chosen=available.find(x=>x.heal>=effectiveMaxHp)||available[available.length-1]
        if(chosen){php=Math.min(effectiveMaxHp,chosen.heal);await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,chosen.item_id]);autoHeal={name:names[chosen.item_id],hp:php}}
      }
      await c.query('UPDATE stats SET hp=$1 WHERE jid=$2',[php,jid])
    }
    if(s.hp<=0){
      const entries=Object.entries(s.participants).map(([pjid,v])=>({
        jid:pjid,
        damage:Number(v.damage||0),
        name:v.name||'Jogador',
        attacks:Number(v.attacks||0),
        petHealing:Number(v.petHealing||0)
      })).sort((a,b)=>b.damage-a.damage)
      const moneyMultiplier=await getDoubleEventMultiplier(c,'money')
      const xpMultiplier=await getDoubleEventMultiplier(c,'xp')
      const total=entries.reduce((n,x)=>n+x.damage,0)||1,rewards=[]
      for(let i=0;i<entries.length;i++){
        const p=entries[i],position=i+1,share=p.damage/total
        const pp=(await c.query('SELECT species,name,level FROM pets WHERE jid=$1',[p.jid])).rows[0]||null
        const pb=petBossBonus(pp)
        const weekly=s.mode==='weekly'
        const eventMode=s.mode==='event'
        const tier=weekly?(BOSS_PLACEMENT[i]||{cash:0,xp:0}):{cash:0,xp:0}
        let cash=0,exp=0,petXp=0,petXpTeam=[],drops=[]
        if(eventMode){
          const night=s.eventId==='night_0303'
          const siege=s.eventId==='cerco_colosso'
          const positionXp=[900,600,350,200,100][i]||50
          const localMult=night?2:1
          cash=siege?Math.round(3000+25000*share):Math.round((5000+Math.floor(80000*share))*moneyMultiplier*localMult)
          exp=siege?Math.round(Math.floor((700+3500*share+positionXp)*(1+pb.xp))):Math.round(Math.floor((900+6000*share+positionXp)*(1+pb.xp))*xpMultiplier*localMult)
          await credit(c,p.jid,cash,siege?'boss_event_cerco':(night?'boss_event_night_0303':'boss_event_eclipse'))
          await grantExpInTransaction(c,p.jid,exp)
          if(pp){
            petXp=siege?Math.round(180+700*share+(i===0?180:i===1?90:0)):Math.round(Math.floor(200+1200*share+(i===0?300:i===1?150:0))*xpMultiplier*localMult)
            petXpTeam=await grantTeamPetXp(c,p.jid,petXp)
          }
          if(siege){
            if(p.damage>=1500 && Math.random()<.35){
              drops.push(await grantBossItem(c,p.jid,{id:'colete_vital',name:'Colete Vital (+18 DEF / +60 HP)',rarity:'Raro'}))
            }
            if(i===0){
              drops.push(await grantBossItem(c,p.jid,{id:'armadura_colosso',name:'Armadura do Colosso (+52 DEF / +140 HP / +4% CRIT)',rarity:'Evento'}))
            }else if(i===1 && Math.random()<.65){
              drops.push(await grantBossItem(c,p.jid,{id:'couraca_predador',name:'Couraça do Predador (+38 DEF / +90 HP / +3% CRIT)',rarity:'Épico'}))
            }else if(i===2 && Math.random()<.35){
              drops.push(await grantBossItem(c,p.jid,{id:'couraca_predador',name:'Couraça do Predador (+38 DEF / +90 HP / +3% CRIT)',rarity:'Épico'}))
            }
            if(i<3) drops.push(await grantBossItem(c,p.jid,{id:'caixa_rara',name:'Caixa Rara — Cerco',rarity:'Raro'}))
          }else if(night){
            const groupBonus=entries.filter(x=>x.damage>=500).length>=3
            if(p.damage>=500){
              drops.push(await grantBossItem(c,p.jid,{id:'caixa_epica',name:'Caixa Épica',rarity:'Épico'}))
              const mark=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[p.jid,'marca_insone'])).rows[0]
              if(Number(mark?.quantity||0)<1) drops.push(await grantBossItem(c,p.jid,{id:'marca_insone',name:'Marca do Insone',rarity:'Evento Único'}))
              await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'nucleo_pedra',2)
                ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+2`,[p.jid])
              drops.push({id:'nucleo_pedra',name:'Fragmento do Núcleo de Pedra ×2',rarity:'Incomum'})
              if(groupBonus&&Math.random()<.25) drops.push(await grantBossItem(c,p.jid,{id:'caixa_rara',name:'Caixa Rara — bônus coletivo',rarity:'Raro'}))
            }
            if(i===0){
              const crown=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[p.jid,'coroa_madrugada'])).rows[0]
              if(Number(crown?.quantity||0)<1) drops.push(await grantBossItem(c,p.jid,{id:'coroa_madrugada',name:'Coroa da Madrugada (+20 ATK / +50 DEF)',rarity:'Evento Único'}))
            }
          }else{
            if(i===0) drops.push(await grantBossItem(c,p.jid,{id:'caixa_epica',name:'Caixa Épica',rarity:'Épico'}))
            else if(i<3) drops.push(await grantBossItem(c,p.jid,{id:'caixa_rara',name:'Caixa Rara',rarity:'Raro'}))
            else if(Math.random()<.35) drops.push(await grantBossItem(c,p.jid,{id:'caixa_sorte',name:'Caixa da Sorte',rarity:'Comum'}))
            const uniqueBase=[.25,.18,.12,.08,.06][i]||.05
            const relic=await maybeGrantEventRelic(c,p.jid,Math.min(.35,uniqueBase+Number(pb.drop||0)))
            if(relic) drops.push(relic)
          }
        }else{
          // Boss comum é atividade secundária: recompensa muito abaixo do Superboss semanal.
          cash=(weekly?5000+Math.floor(150000*share)+tier.cash:150+Math.floor(2500*share))*moneyMultiplier
          exp=Math.floor((weekly?150+1000*share+tier.xp:10+35*share)*(1+pb.xp))*xpMultiplier
          await credit(c,p.jid,cash,weekly?'boss_weekend':'boss_common')
          await grantExpInTransaction(c,p.jid,exp)
          if(pp){
            petXp=weekly
              ? Math.round(80+260*share+(i===0?80:i===1?40:0))
              : Math.max(5,Math.round(12+35*share))
            petXpTeam=await grantTeamPetXp(c,p.jid,petXp)
          }
          drops=weekly?await giveBossDrops(c,p.jid,position,pb.drop):(Math.random()<.03+Math.min(.02,pb.drop)?[await grantBossItem(c,p.jid,{id:'caixa_sorte',name:'Caixa da Sorte',rarity:'Comum'})]:[])
        }
        // Reclassificação é recompensa de endgame: só entra no sorteio a partir do Nv.100.
        // Boss comum e Boss de evento: 1%. Superboss semanal: 3%.
        const reclassDrop=await maybeGrantReclassScroll(c,p.jid,weekly?'weekly':(eventMode?'event':'common'))
        if(reclassDrop) drops.push(reclassDrop)
        rewards.push({...p,position,cash,exp,petXp,petXpTeam,drops,share,pet:pp?{name:pp.name,species:pp.species,bonus:pb.label}:null})
      }
      if(s.mode==='event'){
        const schedule=bossEventFridayInfo()
        const marker={
          ...s,
          mode:'event_completed',
          active:false,
          hp:0,
          participants:{},
          scheduleKey:s.scheduleKey||(schedule.due?schedule.fridayKey:null),
          completedAt:Date.now()
        }
        await saveGame(c,chat,'boss_event',marker)
      }else{
        const marker={mode:'completed',name:s.name,hp:0,maxHp:s.maxHp,participants:{},weekendKey:s.weekendKey,weeklyCompleted:s.mode==='weekly'||Boolean(s.weeklyCompleted),endsAt:s.endsAt||0,lastCommonEndedAt:s.mode==='common'?Date.now():Number(s.lastCommonEndedAt||0)}
        await saveGame(c,chat,'boss',marker)
      }
      return {dead:true,mode:s.mode,damage,bossDamage,bossCritical,playerHp:php,hp:0,maxHp:s.maxHp,players:entries.length,rewards,autoHeal,autoPetHeal,petSkillHeal,petSwitch,petUnavailable,petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
    }
    await saveGame(c,chat,gameType,s)
    return {dead:false,mode:s.mode||'common',endsAt:Number(s.endsAt||0),damage,bossDamage,bossCritical,playerHp:php,playerMaxHp:effectiveMaxHp,playerDead:php<=0,hp:s.hp,maxHp:s.maxHp,autoHeal,autoPetHeal,petSkillHeal,petSwitch,petUnavailable,petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal),pet:pet?{name:pet.name,species:pet.species,bonus:petBonus.label,damage:petDamage,crit,energy:pet.energy,hp:Number(pet.hp),maxHp:Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species)),damageTaken:Number(pet.petDamageTaken||0),fainted:Boolean(pet.petFainted)}:null}
  })
}
