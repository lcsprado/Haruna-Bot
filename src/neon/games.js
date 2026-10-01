import { db, ensureUser } from './db.js'

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
  {q:'Qual planeta é conhecido como Planeta Vermelho?',a:['Vênus','Marte','Júpiter','Saturno'],c:2},
  {q:'Quanto é 7 × 8?',a:['54','56','58','64'],c:2},
  {q:'Qual é a capital do Japão?',a:['Seul','Pequim','Tóquio','Osaka'],c:3},
  {q:'Qual animal é o maior mamífero do mundo?',a:['Elefante africano','Baleia-azul','Girafa','Hipopótamo'],c:2},
  {q:'Em qual continente fica o Egito?',a:['África','Ásia','Europa','América'],c:1},
  {q:'Qual gás as plantas absorvem principalmente na fotossíntese?',a:['Oxigênio','Nitrogênio','Dióxido de carbono','Hidrogênio'],c:3},
  {q:'Quantos lados tem um hexágono?',a:['5','6','7','8'],c:2},
  {q:'Qual oceano é o maior?',a:['Atlântico','Índico','Ártico','Pacífico'],c:4}
]

export async function startQuiz(chat){
  return tx(async c=>{
    const current=await loadGame(c,chat,'quiz')
    const now=Date.now()
    const ttl=2*60*1000
    if(current && now-Number(current.started||0)<ttl){
      return {already:true,...current,remaining:Math.ceil((ttl-(now-Number(current.started||0)))/1000)}
    }
    if(current) await clearGame(c,chat,'quiz')
    const item=QUIZZES[Math.floor(Math.random()*QUIZZES.length)]
    const state={...item,started:now}
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
    if(!s) throw new Error('Não há quiz ativo. Use !quiz.')
    const expired=Date.now()-Number(s.started||0)>=2*60*1000
    if(expired){
      await clearGame(c,chat,'quiz')
      throw new Error('Esse quiz expirou. Use !quiz para iniciar outro.')
    }
    await clearGame(c,chat,'quiz')
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

export async function startBoss(chat){
  return tx(async c=>{
    const current=await loadGame(c,chat,'boss')
    if(current && Number(current.hp)>0) return {already:true,...current}
    const maxHp=500+Math.floor(Math.random()*501)
    const state={name:'Golem do Trevo',hp:maxHp,maxHp,participants:{},lastAttack:{}}
    await saveGame(c,chat,'boss',state)
    return state
  })
}

export async function attackBoss(chat,jid,name){
  await ensureUser(jid,name||'')
  return tx(async c=>{
    const s=await loadGame(c,chat,'boss')
    if(!s||Number(s.hp)<=0) throw new Error('Não há boss ativo. Use !boss.')

    const now=Date.now()
    s.lastAttack=s.lastAttack||{}
    const last=Number(s.lastAttack[jid]||0)
    const cooldownMs=10*1000
    if(now-last<cooldownMs){
      return {cooldown:true,remaining:Math.ceil((cooldownMs-(now-last))/1000),hp:Number(s.hp),maxHp:Number(s.maxHp)}
    }
    s.lastAttack[jid]=now

    const st=await c.query('SELECT atk,weapon_id FROM stats WHERE jid=$1',[jid])
    const base=Number(st.rows[0]?.atk||10)
    const weapon=st.rows[0]?.weapon_id
    const bonus=weapon==='espada_ferro'?12:weapon==='espada_madeira'?5:0
    const damage=Math.max(5,Math.floor((base+bonus)*(0.8+Math.random()*0.7)))
    s.hp=Math.max(0,Number(s.hp)-damage)
    s.participants=s.participants||{}
    s.participants[jid]=(Number(s.participants[jid]||0)+damage)

    if(s.hp<=0){
      const entries=Object.entries(s.participants)
      const rewardEach=Math.max(1,Math.floor(5000/Math.max(1,entries.length)))
      for(const [pjid] of entries) await credit(c,pjid,rewardEach,'boss')
      await clearGame(c,chat,'boss')
      return {dead:true,damage,hp:0,maxHp:s.maxHp,rewardEach,players:entries.length,pot:rewardEach*entries.length}
    }

    await saveGame(c,chat,'boss',s)
    return {dead:false,damage,hp:s.hp,maxHp:s.maxHp}
  })
}
