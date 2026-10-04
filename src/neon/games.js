import { db, ensureUser, equipmentStatsAtLevel, grantExpInTransaction, petMaxHp, getDoubleEventMultiplier } from './db.js'

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
const PET_BOSS_SPECIALTIES={
  cachorro:{label:'🐶 Guardião',defense:.05}, gato:{label:'🐱 Instinto',crit:.04},
  coelho:{label:'🐰 Agilidade',dodge:.04}, papagaio:{label:'🦜 Motivação',xp:.05},
  hamster:{label:'🐹 Sorte',drop:.025}, tartaruga:{label:'🐢 Casco',defense:.07},
  coruja:{label:'🦉 Sabedoria',xp:.08}, raposa:{label:'🦊 Astúcia',crit:.06},
  lobo:{label:'🐺 Caçador',damage:.06}, aguia:{label:'🦅 Precisão',crit:.07},
  panda:{label:'🐼 Resistência',defense:.08}, tigre:{label:'🐯 Fúria',damage:.07},
  leao:{label:'🦁 Rei da Caçada',damage:.08}, unicornio:{label:'🦄 Bênção',drop:.04,defense:.04},
  dragao:{label:'🐉 Caçador de Boss',bossDamage:.10},

  // Pets de Raid: todos têm pelo menos 2 especialidades. Eles exigem 100 materiais
  // e por isso devem superar pets comuns em utilidade endgame, sem tornar equipamento irrelevante.
  golem_ancestral:{label:'🪨 Muralha Ancestral',defense:.09,drop:.02,raid:true},
  urso_runico:{label:'🐻 Fúria Rúnica',damage:.07,defense:.06,raid:true},
  colosso_cristal:{label:'💎 Prisma Colossal',defense:.10,drop:.04,crit:.03,raid:true},

  salamandra_infernal:{label:'🔥 Chama Infernal',damage:.08,crit:.04,raid:true},
  dragao_vulcanico:{label:'🐲 Núcleo Vulcânico',damage:.09,defense:.05,raid:true},
  fenix_fogo:{label:'🔥 Renascimento Ígneo',damage:.08,dodge:.05,xp:.05,raid:true},

  corvo_abissal:{label:'👁️ Olho do Abismo',crit:.08,drop:.03,raid:true},
  lobo_abismo:{label:'🌑 Predador Abissal',damage:.09,crit:.05,raid:true},
  fenix_gelo:{label:'❄️ Alma Glacial',defense:.08,dodge:.05,xp:.06,raid:true},

  rinoceronte_titanico:{label:'🦏 Investida Titânica',defense:.10,damage:.05,raid:true},
  guardiao_obsidiana:{label:'🗿 Guarda Obsidiana',defense:.10,drop:.035,raid:true},
  leviata_gelo:{label:'🌊 Leviatã Congelado',defense:.10,dodge:.06,damage:.05,raid:true},

  cerbero_carmesim:{label:'🩸 Três Presas',damage:.10,crit:.06,raid:true},
  tigre_lunar:{label:'🌙 Caçador Lunar',damage:.09,dodge:.06,drop:.03,raid:true},
  imperador_abissal:{label:'👑 Soberano do Abismo',bossDamage:.10,defense:.07,drop:.04,raid:true},

  leao_solar:{label:'☀️ Rei Solar',damage:.10,crit:.07,xp:.05,raid:true},
  grifo_celestial:{label:'✨ Asas da Fortuna',crit:.10,dodge:.07,drop:.04,raid:true},
  fenix_celestial:{label:'🌟 Graça Celestial',defense:.10,dodge:.08,xp:.08,raid:true},

  serpente_cosmica:{label:'🌌 Oráculo Cósmico',crit:.09,drop:.06,xp:.08,raid:true},
  dragao_corrompido:{label:'☠️ Ruína Corrompida',bossDamage:.10,damage:.08,defense:.08,raid:true},
  fenix_alpha:{label:'👑 Fênix Alpha',damage:.10,defense:.10,crit:.08,dodge:.06,drop:.07,xp:.08,raid:true}
}
function petBossBonus(pet){
  if(!pet) return {label:null,damage:0,defense:0,crit:0,dodge:0,xp:0,drop:0}
  const base=PET_BOSS_SPECIALTIES[pet.species]||{}
  // O nível melhora o efeito em até 25%. Pets comuns continuam limitados a 10% por status;
  // pets de Raid podem chegar a 15% para preservar a vantagem conquistada com 100 materiais.
  const scale=1+Math.min(.25,Math.max(0,Number(pet.level||1)-1)*.01)
  const cap=base.raid?.15:.10
  const scaled=k=>Math.min(cap,Number(base[k]||0)*scale)
  return {
    label:base.label||pet.species,
    damage:scaled('damage')+scaled('bossDamage'),
    defense:scaled('defense'),
    crit:scaled('crit'),
    dodge:scaled('dodge'),
    xp:scaled('xp'),
    drop:scaled('drop')
  }
}

const RAID_CONFIGS=[
  {level:10,name:'Guardião de Pedra',hp:10000,atk:14,keyId:'chave_raid_10',keyPrice:10000,cashPool:20000,xpPool:1200,petXpPool:120,material:{id:'nucleo_pedra',name:'Fragmento do Núcleo de Pedra'},box:null,gear:null,gearChance:0},
  {level:15,name:'Dragão Vulcânico',hp:18000,atk:21,keyId:'chave_raid_15',keyPrice:16000,cashPool:35000,xpPool:1800,petXpPool:180,material:{id:'escama_vulcanica',name:'Escama Vulcânica'},box:'caixa_sorte',gear:['foice_carmesim','manto_fenix'],gearChance:.015},
  {level:20,name:'Devorador Abissal',hp:30000,atk:30,keyId:'chave_raid_20',keyPrice:25000,cashPool:55000,xpPool:2600,petXpPool:260,material:{id:'olho_abissal',name:'Olho Abissal'},box:'caixa_rara',gear:['lanca_solar','couraca_vulcanica'],gearChance:.0175},
  {level:25,name:'Titã de Ferro',hp:48000,atk:39,keyId:'chave_raid_25',keyPrice:40000,cashPool:80000,xpPool:3600,petXpPool:360,material:{id:'nucleo_titan',name:'Núcleo do Titã'},box:'caixa_rara',gear:['garras_vazio','armadura_vazio'],gearChance:.02},
  {level:30,name:'Rei Abissal',hp:75000,atk:50,keyId:'chave_raid_30',keyPrice:60000,cashPool:120000,xpPool:5000,petXpPool:500,material:{id:'essencia_rei_abissal',name:'Essência do Rei Abissal'},box:'caixa_epica',gear:['espada_eclipse','armadura_eclipse'],gearChance:.025},
  {level:40,name:'Serafim Caído',hp:130000,atk:70,keyId:'chave_raid_40',keyPrice:100000,cashPool:200000,xpPool:7500,petXpPool:750,material:{id:'fragmento_celestial',name:'Fragmento Celestial'},box:'caixa_epica',gear:['excalibur','armadura_titan'],gearChance:.008},
  {level:50,name:'Alpha Corrompido',hp:220000,atk:98,keyId:'chave_raid_50',keyPrice:160000,cashPool:350000,xpPool:11000,petXpPool:1100,material:{id:'nucleo_alpha_corrompido',name:'Núcleo Alpha Corrompido'},box:'caixa_epica',gear:['katana_divina','armadura_divina'],gearChance:.005},
]
const raidConfig=level=>RAID_CONFIGS.find(r=>r.level===Number(level))||null
const raidDurationMinutes=level=>({10:12,15:15,20:18,25:22,30:30,40:40,50:50}[Number(level)]||15)
export function getRaidCatalog(){ return RAID_CONFIGS.map(r=>({...r,durationMinutes:raidDurationMinutes(r.level)})) }

export async function getRaidStatus(chat){
  return tx(async c=>loadGame(c,chat,'raid'))
}

export async function createRaid(chat,host,name='Jogador',level=10){
  const cfg=raidConfig(level)
  if(!cfg) throw new Error('Raid inválida. Níveis: 10, 15, 20, 25, 30, 40 e 50.')
  await ensureUser(host,name)
  return tx(async c=>{
    const old=await loadGame(c,chat,'raid')
    if(old&&['lobby','active'].includes(old.status)&&Number(old.expiresAt||0)>Date.now()) throw new Error('Já existe uma Raid aberta neste grupo.')
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
    await saveGame(c,chat,'raid',state)
    return {...state,autoKeyPurchased,keyPrice:cfg.keyPrice}
  })
}

export async function joinRaid(chat,jid,name='Jogador'){
  await ensureUser(jid,name)
  return tx(async c=>{
    const s=await loadGame(c,chat,'raid')
    if(!s||!['lobby','active'].includes(s.status)||Number(s.expiresAt||0)<Date.now()) throw new Error('Não existe Raid disponível para entrar.')
    if(s.players?.[jid]) return {already:true,lateJoin:s.status==='active',...s}
    if(Object.keys(s.players||{}).length>=5) throw new Error('A Raid já está cheia (5 jogadores).')
    const u=(await c.query('SELECT level,push_name FROM users WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(u?.level||1)<Number(s.level)) throw new Error(`Essa Raid exige nível ${s.level}. Seu nível atual: ${Number(u?.level||1)}.`)
    const st=(await c.query('SELECT * FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(st?.hp||0)<=0) throw new Error('Você está sem HP. Cure-se antes de entrar.')
    const cfg=raidConfig(s.level)
    if(!cfg) throw new Error('Configuração da Raid não encontrada.')
    const key=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,cfg.keyId])).rows[0]
    if(Number(key?.quantity||0)<1) throw new Error(`🔑 Para entrar nesta Raid, você precisa ter 1 Chave de Raid Lv.${cfg.level}. Use !chaveraid ${cfg.level}.`)

    if(s.status==='lobby'){
      s.players={...(s.players||{}),[jid]:{jid,name:name||'Jogador',damage:0,alive:true}}
      await saveGame(c,chat,'raid',s)
      return {...s,lateJoin:false}
    }

    // Entrada tardia: consome a chave agora e cria o participante com os atributos atuais.
    // Dano começa em zero, portanto não há crédito pelas rodadas anteriores.
    await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,cfg.keyId])
    const lev=async itemId=>itemId?Number((await c.query('SELECT level FROM equipment_upgrades WHERE jid=$1 AND item_id=$2',[jid,itemId])).rows[0]?.level||1):1
    const w=st.weapon_id?equipmentStatsAtLevel(st.weapon_id,await lev(st.weapon_id)):{atk:0}
    const a=st.armor_id?equipmentStatsAtLevel(st.armor_id,await lev(st.armor_id)):{def:0}
    const pet=(await c.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]||null
    s.players={...(s.players||{}),[jid]:{
      jid,name:name||u?.push_name||'Jogador',hp:Number(st.hp),maxHp:Number(st.max_hp),
      atk:Number(st.atk)+Number(w?.atk||0)+Number(a?.atk||0),def:Number(st.def)+Number(w?.def||0)+Number(a?.def||0),
      damage:0,alive:true,heals:0,
      pet:pet?{name:pet.name,species:pet.species,level:Number(pet.level||1),xp:Number(pet.xp||0),energy:Number(pet.energy||0),hp:Number(pet.hp??petMaxHp(pet.level,pet.xp,pet.species)),maxHp:Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species)),bonus:petBossBonus(pet),extraDamage:0,turns:0}:null
    }}
    await saveGame(c,chat,'raid',s)
    return {...s,lateJoin:true,joinedJid:jid}
  })
}

export async function cancelRaid(chat,jid){
  return tx(async c=>{
    const s=await loadGame(c,chat,'raid')
    if(!s||s.status!=='lobby') throw new Error('Não existe Raid aguardando início.')
    if(s.host!==jid) throw new Error('Somente o host pode cancelar a Raid.')
    await clearGame(c,chat,'raid')
    return true
  })
}

async function raidPetXp(c,jid,gain){
  gain=Math.max(0,Math.floor(Number(gain)||0))
  if(!gain) return null
  const p=(await c.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(!p) return null
  const xp=Number(p.xp||0)+gain, level=1+Math.floor(xp/100), gained=Math.max(0,level-Number(p.level||1))
  const newMax=petMaxHp(level,xp,p.species)
  const oldMax=Math.max(1,Number(p.max_hp||petMaxHp(p.level,p.xp,p.species)))
  const hp=Math.min(newMax,Math.max(0,Number(p.hp??oldMax)+Math.max(0,newMax-oldMax)))
  const r=(await c.query('UPDATE pets SET xp=$1,level=$2,power=power+$3,energy=energy+$4,hp=$5,max_hp=$6 WHERE jid=$7 RETURNING *',[xp,level,gained*2,gained*3,hp,newMax,jid])).rows[0]
  if(r) await c.query('UPDATE pet_collection SET level=$1,xp=$2,power=$3,energy=$4,hp=$5,max_hp=$6 WHERE jid=$7 AND active=TRUE',[r.level,r.xp,r.power,r.energy,r.hp,r.max_hp,jid])
  return r?{name:r.name,xp:gain,level:Number(r.level),levels:gained,hp:Number(r.hp),maxHp:Number(r.max_hp)}:null
}

function raidPotion(rows,maxHp){
  const heal={pocao_p:35,pocao_m:80,pocao_g:160,elixir_supremo:999999}
  const names={pocao_p:'Poção Pequena',pocao_m:'Poção Média',pocao_g:'Poção Grande',elixir_supremo:'Elixir Supremo'}
  const a=(rows||[]).filter(x=>Number(x.quantity)>0).map(x=>({...x,heal:heal[x.item_id]||0})).sort((x,y)=>x.heal-y.heal)
  const p=a.find(x=>x.heal>=maxHp)||a[a.length-1]
  return p?{...p,name:names[p.item_id]}:null
}

export async function startRaid(chat,host){
  return tx(async c=>{
    const s=await loadGame(c,chat,'raid')
    if(!s||s.status!=='lobby') throw new Error('Não existe Raid pronta para iniciar.')
    if(s.host!==host) throw new Error('Somente quem abriu a Raid pode iniciar.')
    if(Number(s.expiresAt||0)<Date.now()) throw new Error('A sala expirou. Abra outra Raid.')
    const ids=Object.keys(s.players||{})
    if(ids.length<2) throw new Error('A Raid precisa de pelo menos 2 jogadores.')
    const cfg=raidConfig(s.level)
    if(!cfg) throw new Error('Configuração da Raid não encontrada.')

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
      s.players[jid]={jid,name:s.players[jid]?.name||u?.push_name||'Jogador',hp:Number(st.hp),maxHp:Number(st.max_hp)+gearHp,atk:Number(st.atk)+Number(w?.atk||0)+Number(a?.atk||0),def:Number(st.def)+Number(w?.def||0)+Number(a?.def||0),crit:Number(w?.crit||0)+Number(a?.crit||0),damage:0,petBonusDamage:0,alive:true,heals:0,pet:pet?{name:pet.name,species:pet.species,level:Number(pet.level||1),xp:Number(pet.xp||0),energy:Number(pet.energy||0),hp:Number(pet.hp??petMaxHp(pet.level,pet.xp,pet.species)),maxHp:Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species)),bonus:petBossBonus(pet),extraDamage:0,turns:0}:null}
    }
    s.status='active';s.round=0;s.hp=cfg.hp;s.maxHp=cfg.hp;s.atk=cfg.atk;s.startedAt=Date.now();s.durationMinutes=raidDurationMinutes(cfg.level);s.expiresAt=Date.now()+s.durationMinutes*60*1000
    await saveGame(c,chat,'raid',s)
    return s
  })
}

async function finishRaidRewards(c,s,cfg){
  const ranked=Object.values(s.players||{}).sort((a,b)=>Number(b.damage||0)-Number(a.damage||0))
  const total=ranked.reduce((n,p)=>n+Number(p.damage||0),0)||1
  // Invasão das Raids — 04/10/2026, 14:00–15:30 America/Sao_Paulo.
  // Dinheiro normal; +50% XP de jogador e pet, além de chance extra de equipamento.
  const raidEventActive=Date.now()>=Date.parse('2026-10-04T14:00:00-03:00') && Date.now()<Date.parse('2026-10-04T15:30:00-03:00')
  const moneyMultiplier=1
  const xpMultiplier=raidEventActive?1.5:1
  const petXpMultiplier=raidEventActive?1.5:1
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
    const exp=Math.max(20,Math.floor(cfg.xpPool*(.10+.90*share)*(1+Number(pb.xp||0))))*xpMultiplier
    await credit(c,p.jid,cash,`raid_${cfg.level}`)
    await grantExpInTransaction(c,p.jid,exp)
    const petXp=p.pet&&Number(p.pet.turns||0)>0?Math.max(5,Math.round(Math.floor(cfg.petXpPool*(.15+.85*share))*petXpMultiplier)):0
    if(petXp) await raidPetXp(c,p.jid,petXp)

    let material=null,drop=null,gearDrop=null
    // Materiais continuam garantidos para o top 3, mas em ritmo menor:
    // 2/1/1 em vez de 3/2/1. A invocação segue exigindo 100 materiais.
    const qty=cfg.level===10 ? (i===0?3:(i===1?2:(i===2?1:0))) : (i===0?2:(i===1||i===2?1:0))
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
      const chance=Math.min(.08,Number(cfg.gearChance||0)+rankBonus+collaborationBonus+petDropBonus+gearEventBonus)
      if(Math.random()<chance){
        const gearId=cfg.gear[Math.floor(Math.random()*cfg.gear.length)]
        const item=(await c.query('SELECT id,name,rarity FROM items WHERE id=$1',[gearId])).rows[0]
        if(item){
          await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1',[p.jid,gearId])
          gearDrop={id:item.id,name:item.name,rarity:item.rarity}
        }
      }
    }
    rewards.push({jid:p.jid,name:p.name,damage:Number(p.damage||0),petBonusDamage:Number(p.petBonusDamage||0),share,cash,exp,petXp,material,drop,gearDrop})
  }
  return rewards
}

export async function raidRound(chat){
  return tx(async c=>{
    const s=await loadGame(c,chat,'raid')
    if(!s||s.status!=='active') return {reason:'inactive'}
    const cfg=raidConfig(s.level)
    if(!cfg) throw new Error('Configuração da Raid não encontrada.')
    if(Number(s.expiresAt||0)<Date.now()){
      s.status='failed';s.failReason='timeout';await saveGame(c,chat,'raid',s)
      return {failed:true,reason:'timeout',config:cfg,hp:s.hp,maxHp:s.maxHp}
    }

    s.round=Number(s.round||0)+1
    const events=[]
    const alive=Object.values(s.players||{}).filter(p=>p.alive)
    if(!alive.length){
      s.status='failed';s.failReason='party_wipe';await saveGame(c,chat,'raid',s)
      return {failed:true,reason:'party_wipe',config:cfg,hp:s.hp,maxHp:s.maxHp}
    }

    for(const p of alive){
      let pb={damage:0,crit:0}
      if(p.pet){
        p.pet.roundActive=Number(p.pet.energy)>0&&Number(p.pet.hp)>0
        if(p.pet.roundActive){
          pb=p.pet.bonus||pb
          p.pet.energy=Number(p.pet.energy)-1
          p.pet.turns=Number(p.pet.turns||0)+1
          await c.query('UPDATE pets SET energy=$1 WHERE jid=$2',[p.pet.energy,p.jid])
          await c.query('UPDATE pet_collection SET energy=$1 WHERE jid=$2 AND active=TRUE',[p.pet.energy,p.jid])
        }
      }
      const petCritChance=Math.max(0,Number(pb.crit||0))
      const gearCritChance=Math.max(0,Number(p.crit||0))
      const roll=Math.random()
      const petCrit=petCritChance>0&&roll<petCritChance
      const gearCrit=!petCrit&&gearCritChance>0&&roll<Math.min(.50,petCritChance+gearCritChance)
      const crit=petCrit||gearCrit
      const variance=.82+Math.random()*.38
      const raw=Math.max(5,Math.floor(Number(p.atk||1)*variance))
      const baseline=Math.max(5,Math.floor(raw*(gearCrit?1.5:1)*3))
      const mult=(1+Number(pb.damage||0))*3
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
      await saveGame(c,chat,'raid',s)
      return {victory:true,config:cfg,round:s.round,hp:0,maxHp:s.maxHp,rewards,events}
    }

    const special=Math.random()<.22
    const specialName=special?(cfg.level>=40?'Ruptura do Núcleo':'Golpe Devastador'):null
    const potionRows=(await c.query('SELECT jid,item_id,quantity FROM inventories WHERE jid=ANY($1::text[]) AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',[alive.map(x=>x.jid),['pocao_p','pocao_m','pocao_g','elixir_supremo']])).rows
    for(const p of alive.filter(x=>x.alive)){
      const pb=p.pet?.roundActive?(p.pet.bonus||{defense:0,dodge:0}):{defense:0,dodge:0}
      const dodged=Number(pb.dodge||0)>0&&Math.random()<Number(pb.dodge||0)
      const raw=Math.max(1,Math.round((cfg.atk-Number(p.def||0)*.22)*(.82+Math.random()*.36)*(1-Number(pb.defense||0))))
      const dmg=dodged?0:Math.max(1,Math.round(raw*(special?1.55:1)))
      p.hp=Math.max(0,Number(p.hp)-dmg)
      let petDamage=0,petFainted=false
      if(p.pet?.roundActive&&Number(p.pet.hp)>0){
        const petDefense=Math.max(0,Math.min(.75,Number(p.pet.bonus?.defense||0)))
        petDamage=Math.max(1,Math.round(cfg.atk*(.28+Math.random()*.20)*(special?1.25:1)*(1-petDefense)))
        p.pet.hp=Math.max(0,Number(p.pet.hp)-petDamage)
        petFainted=p.pet.hp<=0
        await c.query('UPDATE pets SET hp=$1 WHERE jid=$2',[p.pet.hp,p.jid])
        await c.query('UPDATE pet_collection SET hp=$1 WHERE jid=$2 AND active=TRUE',[p.pet.hp,p.jid])
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
      events.push({type:'boss',jid:p.jid,name:p.name,damage:dmg,hp:p.hp,dodged,autoHeal,alive:p.alive,petDamage,petHp:p.pet?.hp??null,petMaxHp:p.pet?.maxHp??null,petName:p.pet?.name||null,petFainted})
    }

    const survivors=Object.values(s.players||{}).filter(p=>p.alive).length
    if(!survivors){
      s.status='failed';s.failReason='party_wipe';await saveGame(c,chat,'raid',s)
      return {failed:true,reason:'party_wipe',config:cfg,round:s.round,hp:s.hp,maxHp:s.maxHp,events}
    }
    await saveGame(c,chat,'raid',s)
    return {config:cfg,round:s.round,hp:s.hp,maxHp:s.maxHp,survivors,special,specialName,events}
  })
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

const SIEGE_EVENT_START=Date.parse('2026-10-04T18:00:00-03:00')
const SIEGE_EVENT_END=Date.parse('2026-10-04T20:00:00-03:00')
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
    if(current&&current.active!==false&&Number(current.hp)>0){
      if(current.eventId==='cerco_colosso') return {due:true,already:true,...current}
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
  const maxHp=42000+Math.floor(Math.random()*8001)
  const state={
    mode:'event',
    eventId:'eclipse',
    active:true,
    origin,
    scheduleKey,
    name:'Imperador do Eclipse',
    hp:maxHp,
    maxHp,
    atk:22,
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
      const maxHp=60000+Math.floor(Math.random()*20001)
      const state={mode:'weekly',name:'Golem Ancestral do Alpha',hp:maxHp,maxHp,atk:18,participants:{},startedAt:Date.now(),weekendKey:weekend.weekendKey,weeklyCompleted:false,endsAt:weekend.endsAt,endsLabel:weekend.endsLabel}
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
    const maxHp=6500+Math.floor(Math.random()*2501)
    const state={mode:'common',name:'Golem do Alpha',hp:maxHp,maxHp,atk:10,participants:{},startedAt:Date.now(),weekendKey:weekend.weekendKey,weeklyCompleted:Boolean(weeklyCompleted),lastCommonEndedAt}
    await saveGame(c,chat,'boss',state); return state
  })
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
    const petRow=usePet?(await c.query('SELECT species,name,level,xp,energy,hp,max_hp FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]||null:null
    const petNoEnergy=Boolean(usePet&&petRow&&Number(petRow.energy)<2)
    const petNoHp=Boolean(usePet&&petRow&&Number(petRow.hp)<=0)
    const petUnavailable=petNoEnergy||petNoHp
    let pet=petUnavailable?null:petRow
    if(pet){
      pet.energy=Number(pet.energy)-2
      await c.query('UPDATE pets SET energy=$1 WHERE jid=$2',[pet.energy,jid])
    }
    const petBonus=petBossBonus(pet)
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
    const petCritChance=Math.max(0,Number(petBonus.crit||0))
    const gearCritChance=Math.max(0,Number(weapon?.crit||0)+Number(armor?.crit||0))
    const roll=Math.random()
    const petCrit=petCritChance>0&&roll<petCritChance
    const gearCrit=!petCrit&&gearCritChance>0&&roll<Math.min(.50,petCritChance+gearCritChance)
    const crit=petCrit||gearCrit
    const petMultiplier=1+petBonus.damage
    const variance=.85+Math.random()*.45
    const rawBase=Math.max(5,Math.floor(atk*variance))
    const baselineWithGearCrit=Math.max(5,Math.floor(rawBase*(gearCrit?1.5:1)))
    const damage=Math.max(5,Math.floor(rawBase*petMultiplier*(crit?1.5:1)))
    const petDamage=pet?Math.max(0,damage-baselineWithGearCrit):0
    s.hp=Math.max(0,Number(s.hp)-damage); s.participants=s.participants||{}
    const old=s.participants[jid]||{damage:0,name:name||'Jogador'}
    s.participants[jid]={damage:Number(old.damage||0)+damage,name:old.name||name||'Jogador'}
    let php=Number(st.hp),bossDamage=0,autoHeal=null
    if(s.hp>0){
      const dodged=petBonus.dodge>0&&Math.random()<petBonus.dodge
      bossDamage=dodged?0:Math.max(1,Math.round((Number(s.atk||18)-def*.22)*(.8+Math.random()*.4)*(1-petBonus.defense)))
      php=Math.max(0,php-bossDamage)
      if(pet){
        const petTaken=Math.max(1,Math.round(Number(s.atk||18)*(.30+Math.random()*.22)*(1-Math.min(.75,Number(petBonus.defense||0)))))
        pet.hp=Math.max(0,Number(pet.hp)-petTaken)
        pet.petDamageTaken=petTaken
        pet.petFainted=pet.hp<=0
        await c.query('UPDATE pets SET hp=$1 WHERE jid=$2',[pet.hp,jid])
        await c.query('UPDATE pet_collection SET hp=$1 WHERE jid=$2 AND active=TRUE',[pet.hp,jid])
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
      const entries=Object.entries(s.participants).map(([pjid,v])=>({jid:pjid,damage:Number(v.damage||0),name:v.name||'Jogador'})).sort((a,b)=>b.damage-a.damage)
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
        let cash=0,exp=0,petXp=0,drops=[]
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
            await raidPetXp(c,p.jid,petXp)
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
          drops=weekly?await giveBossDrops(c,p.jid,position,pb.drop):(Math.random()<.03+Math.min(.02,pb.drop)?[await grantBossItem(c,p.jid,{id:'caixa_sorte',name:'Caixa da Sorte',rarity:'Comum'})]:[])
        }
        rewards.push({...p,position,cash,exp,petXp,drops,share,pet:pp?{name:pp.name,species:pp.species,bonus:pb.label}:null})
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
      return {dead:true,mode:s.mode,damage,bossDamage,playerHp:php,hp:0,maxHp:s.maxHp,players:entries.length,rewards,autoHeal,petUnavailable,petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),petFainted:Boolean(pet?.petFainted)}
    }
    await saveGame(c,chat,gameType,s)
    return {dead:false,damage,bossDamage,playerHp:php,playerMaxHp:effectiveMaxHp,playerDead:php<=0,hp:s.hp,maxHp:s.maxHp,autoHeal,petUnavailable,petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),petFainted:Boolean(pet?.petFainted),pet:pet?{name:pet.name,species:pet.species,bonus:petBonus.label,damage:petDamage,crit,energy:pet.energy,hp:Number(pet.hp),maxHp:Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species)),damageTaken:Number(pet.petDamageTaken||0),fainted:Boolean(pet.petFainted)}:null}
  })
}
