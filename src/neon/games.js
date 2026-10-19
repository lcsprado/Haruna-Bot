import { db, ensureUser, equipmentStatsAtLevel, grantExpInTransaction, petMaxHp, petMaxEnergy, getDoubleEventMultiplier, getPetXpEventMultiplier, petTeamSynergy } from './db.js'
import { petCombatSpecialty, classCritBonus, classAttack, classDefense } from './game-catalog.js'
import {activeRelic} from './relics.js'
import {getEquippedEnchants} from './enchantments-alpha.js'
import {scaleRaidHpOnLateJoin} from './raid-hp-scaling.js'
import {PECADOS_ESSENCES,PECADOS_EDITIONS} from './sete-pecados-catalog.js'
import {TITAN_EVENT_ID,TITAN_EVENT_KEY,TITAN_START,TITAN_END,TITAN_PHASES,createTitanState,rollupTitanDamage,rankTitanPlayers,titanRewards} from './titan-invasion.js'

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
    CREATE TABLE IF NOT EXISTS player_damage_stats(
      jid TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('boss','raid')),
      samples JSONB NOT NULL DEFAULT '[]'::jsonb,
      PRIMARY KEY(jid,category)
    )
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS trevo_games(
      chat_jid TEXT NOT NULL,
      game_type TEXT NOT NULL,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      PRIMARY KEY(chat_jid,game_type)
    )
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS boss_auto_sessions(
      jid TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Jogador',
      use_pet BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'active',
      boss_id TEXT NOT NULL,
      ends_at BIGINT NOT NULL DEFAULT 0,
      last_attack_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    )
  `)
  // Compensação pontual da Raid 65 de 17/10/2026: o HP inflou com
  // reentradas repetidas antes da correção. Não altera o HP-base nem futuras Raids.
  // A UPDATE é atômica com as rodadas (bloqueio da mesma linha no Neon).
  const raid65Repair=await db.query(`
    UPDATE trevo_games
    SET state=jsonb_set(
      jsonb_set(state,'{hp}',to_jsonb(30000::integer),true),
      '{raidHpRepair20261017}',
      jsonb_build_object(
        'reason','HP aumentado indevidamente por reentradas',
        'previousHp',(state->>'hp')::numeric,
        'hpAfter',30000,
        'round',(state->>'round')::integer,
        'appliedAt',EXTRACT(EPOCH FROM NOW())::bigint
      ),
      true
    ),
    updated_at=EXTRACT(EPOCH FROM NOW())::bigint
    WHERE chat_jid='120363429534634131@g.us'
      AND game_type='raid:65'
      AND state->>'status'='active'
      AND (state->>'round')::integer>=70
      AND (state->>'maxHp')::numeric>=993600
      AND (state->>'hp')::numeric>30000
      AND (state->>'startedAt')::bigint>=1792249200000
      AND (state->>'startedAt')::bigint<1792251000000
      AND NOT (state ? 'raidHpRepair20261017')
    RETURNING state->>'hp' AS hp_after,
              state->>'maxHp' AS max_hp,
              state->>'round' AS round,
              state->'raidHpRepair20261017' AS correction
  `).catch(err=>({rows:[],error:String(err?.message||err)}))
  console.log('[RAID 65 HP REPAIR 20261017]',JSON.stringify(raid65Repair.error?{error:raid65Repair.error}:{applied:raid65Repair.rows.length,details:raid65Repair.rows}))
  const repair=await reconcileAllWeeklyBossOutages20261009()
    .catch(err=>({status:'error',message:String(err?.message||err)}))
  console.log('[Boss All Player Repair] startup',JSON.stringify(repair))
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

// Golpe normal: só transmite HP, o participante afetado e escala/fase caso mudem.
// loadGame já mantém o bloqueio FOR UPDATE até o COMMIT, então o ranking e
// os ataques permanecem atômicos mesmo com jogadores em grupos diferentes.
// Conclusão do Boss continua usando saveGame para persistir o resultado completo.
async function saveBossAttackProgress(client,chat,type,state,jid){
  const patch={hp:Number(state.hp)}
  if(state.maxHp!==undefined) patch.maxHp=Number(state.maxHp)
  if(state.phase!==undefined) patch.phase=state.phase
  if(state.mode!==undefined) patch.mode=state.mode
  if(state.weeklyCompleted!==undefined) patch.weeklyCompleted=state.weeklyCompleted
  const updated=await client.query(`
    UPDATE trevo_games
    SET state=(state || $3::jsonb) || jsonb_build_object(
      'participants',
      COALESCE(state->'participants','{}'::jsonb)
        || jsonb_build_object($4::text,$5::jsonb)
    ),updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE chat_jid=$1 AND game_type=$2
  `,[chat,type,JSON.stringify(patch),jid,JSON.stringify(state.participants[jid])])
  if(updated.rowCount!==1) throw new Error('Estado do Boss ausente durante persistência do golpe.')
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

async function groupGamesEventMultiplier(queryable,chat){
  if(!String(chat||'').endsWith('@g.us')) return 1
  const row=(await queryable.query('SELECT value FROM trevo_settings WHERE key=$1',['group_games_event:'+chat])).rows[0]
  const raw=row?.value||{}
  const now=Date.now()
  const startsAt=Number(raw.startsAt||0),endsAt=Number(raw.endsAt||0)
  if(!startsAt||startsAt>now||endsAt<=now) return 1
  return Math.max(1,Number(raw.multiplier||1))
}

const CACADA_ALPHA_START=Date.parse('2026-10-06T19:00:00-03:00')
const CACADA_ALPHA_END=Date.parse('2026-10-06T20:30:00-03:00')
const cacadaAlphaActive=()=>Date.now()>=CACADA_ALPHA_START&&Date.now()<CACADA_ALPHA_END


async function credit(client,jid,amount,note){
  amount=Math.round(Number(amount)||0)
  await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[amount,jid])
  await client.query(`
    INSERT INTO transactions(from_jid,to_jid,amount,type,note)
    VALUES('system',$1,$2,'minigame',$3)
  `,[jid,amount,note])
}

export async function roulette(jid,amount,choice,chat=null){
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
      const groupMultiplier=await groupGamesEventMultiplier(c,chat)
      // Eventos multiplicam só o lucro; a aposta devolvida continua 1x.
      payout=amount+(baseProfit*lucky3xMultiplier()*groupMultiplier)
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
        const groupMultiplier=await groupGamesEventMultiplier(c,chat)
        payout=stake+(baseProfit*lucky3xMultiplier()*groupMultiplier)
      }
      if(payout) await credit(c,player,payout,'roleta-coletiva')
      results.push({jid:player,amount:Number(bet.amount),choice:bet.choice,payout})
    }
    await clearGame(c,chat,'roulette_group')
    return {number:n,color,results}
  })
}

export async function coinFlip(jid,amount,choice,chat=null){
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
    const groupMultiplier=await groupGamesEventMultiplier(c,chat)
    const payout=won?amount+(amount*lucky3xMultiplier()*groupMultiplier):0
    if(payout) await credit(c,jid,payout,'cara-ou-coroa')
    return {result,choice,amount,payout,profit:payout-amount,eventMultiplier:groupMultiplier}
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

export async function expireQuiz(chat,expectedStarted){
  return tx(async c=>{
    const state=await loadGame(c,chat,'quiz')
    if(!state||state.finished||Number(state.started)!==Number(expectedStarted))return false
    if(Date.now()-Number(state.started||0)<120000)return false
    await saveGame(c,chat,'quiz',{...state,finished:true,answeredAt:Date.now(),expired:true})
    return true
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
    const groupMultiplier=await groupGamesEventMultiplier(c,chat)
    const reward=correct?1000*moneyMultiplier*groupMultiplier:0
    if(reward) await credit(c,jid,reward,'quiz')
    return {correct,reward,correctAnswer:s.c,correctText:s.a[s.c-1],eventMultiplier:moneyMultiplier*groupMultiplier}
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
      const groupMultiplier=await groupGamesEventMultiplier(c,chat)
      const reward=Math.max(300,1500-(s.attempts-1)*100)*moneyMultiplier*groupMultiplier
      await credit(c,jid,reward,'adivinhar-numero')
      return {won:true,reward,attempts:s.attempts,number:s.number,eventMultiplier:moneyMultiplier*groupMultiplier}
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
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
  const open=parts.weekday==='Sat'||(parts.weekday==='Fri'&&(Number(parts.hour||0)>0||(Number(parts.hour||0)===0&&Number(parts.minute||0)>=1)))
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
  {cash:650000,xp:4000,epicBoxes:12,bonusChance:.95,exclusiveChance:.40},
  {cash:450000,xp:3000,epicBoxes:9,bonusChance:.85,exclusiveChance:.28},
  {cash:300000,xp:2200,epicBoxes:7,bonusChance:.75,exclusiveChance:.20},
  {cash:200000,xp:1400,epicBoxes:5,bonusChance:.65,exclusiveChance:.12},
  {cash:125000,xp:900,epicBoxes:3,bonusChance:.55,exclusiveChance:.08},
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


// Bônus passivos do esquadrão: 100% ativo, 50% slot 2, 25% slot 3.
// O slot ativo não é contado duas vezes. As habilidades especiais e
// bônus econômicos de XP/drop continuam exclusivos do pet combatente.
function squadCombatBonus(activeBonus,activeSlot,team=[]){
  const total={...activeBonus}
  for(const key of ['damage','defense','crit','dodge']){
    let value=Number(activeBonus?.[key]||0)
    for(const row of team){
      const slot=Number(row.slot)
      if(slot===Number(activeSlot)||![1,2,3].includes(slot)) continue
      if(Number(row.hp)<=0||Number(row.energy)<=0) continue
      const weight=slot===1 ? 1 : slot===2 ? 0.5 : 0.25
      value+=Number(petBossBonus(row)[key]||0)*weight
    }
    total[key]=Math.min(({damage:.30,defense:.25,crit:.20,dodge:.20})[key],Math.max(0,value))
  }
  return total
}

// Mesmo cálculo de bônus fixos que a Raid/Boss usa: principal (100%),
// suporte no slot 2 (50%), reserva no slot 3 (25%) e limites por atributo.
// Se o principal ficar sem HP, a reserva pode assumir; sem energia, os
// bônus dele ficam suspensos até recuperação (sem forçar troca).
export function profileCombatPetBonuses(primaryPet,team=[]){
  const squad=Array.isArray(team)?team:[]
  const primaryReady=Boolean(primaryPet&&Number(primaryPet.hp)>0&&Number(primaryPet.energy)>0)
  const reserve=primaryPet&&!primaryReady&&Number(primaryPet.hp)<=0
    ?squad.find(row=>Number(row.slot)===3&&Number(row.hp)>0&&Number(row.energy)>0)
    :null
  const activePet=primaryReady?primaryPet:reserve||null
  const activeSlot=reserve?3:1
  const active=activePet?squadCombatBonus(petBossBonus(activePet),activeSlot,squad):petBossBonus(null)
  const recovered=primaryPet?squadCombatBonus(petBossBonus(primaryPet),1,squad):petBossBonus(null)
  return {active,recovered,activeSlot:activePet?activeSlot:0,usingReserve:Boolean(reserve)}
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
  {level:60,name:'Titã do Caos',hp:410000,atk:135,keyId:'chave_raid_60',keyPrice:230000,cashPool:440000,xpPool:14500,petXpPool:1450,material:{id:'fragmento_caos',name:'Fragmento do Caos'},box:'caixa_epica',gear:['lamina_caos','machado_tita','couraca_caos','armadura_tita_ancestral'],gearChance:.005},
  {level:65,name:'Imperador Abissal',hp:540000,atk:165,keyId:'chave_raid_65',keyPrice:300000,cashPool:550000,xpPool:18500,petXpPool:1850,material:{id:'coroa_abissal',name:'Coroa Abissal'},box:'caixa_epica',gear:['foice_abismo','espada_aurora','manto_abismo_eterno','armadura_aurora'],gearChance:.004},
  {level:70,name:'Deus do Eclipse',hp:710000,atk:200,keyId:'chave_raid_70',keyPrice:390000,cashPool:710000,xpPool:24000,petXpPool:2400,material:{id:'essencia_eclipse',name:'Essência do Eclipse'},box:'caixa_epica',gear:['exterminadora_eclipse','armadura_deus_eclipse'],gearChance:.003}
]
const raidConfig=level=>RAID_CONFIGS.find(r=>r.level===Number(level))||null
const raidDurationMinutes=level=>({10:12,15:15,20:18,25:22,30:25,40:30,50:35,60:40,65:45,70:50}[Number(level)]||15)
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
async function resolveGlobalPlayerRaid(c,jid){
  const {rows}=await c.query(
    `SELECT chat_jid,game_type,state,updated_at
     FROM trevo_games
     WHERE game_type='raid' OR game_type LIKE 'raid:%'
     ORDER BY updated_at DESC
     FOR UPDATE`
  )
  return rows
    .map(r=>({chatJid:r.chat_jid,gameType:r.game_type,...(r.state||{})}))
    .filter(raidIsOpen)
    .find(r=>Boolean(r.players?.[jid])) || null
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
  if(!cfg) throw new Error('Raid inválida. Níveis: 10, 15, 20, 25, 30, 40, 50, 60, 65 e 70.')
  const gameType=raidGameType(cfg.level)
  await ensureUser(host,name)
  return tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`raid-membership:${host}`])
    const sameRoom=(await resolveRaidRoom(c,chat,cfg.level))[0]
    if(sameRoom) throw new Error(`Já existe uma sala da Raid Lv.${cfg.level} neste grupo.`)
    const otherRoom=await resolveGlobalPlayerRaid(c,host)
    if(otherRoom) throw new Error(`🔒 RAID GLOBAL ATIVA\n\nVocê já está na *Raid Lv.${otherRoom.level}*. Cada personagem pode participar de apenas *1 Raid por vez*, mesmo em outro grupo ou pelo RPG Web.\nConclua ou encerre a Raid atual antes de entrar em outra.`)
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
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`raid-membership:${jid}`])
    const joinedHere=(await resolveRaidRoom(c,chat,null,{jid}))[0]
    if(joinedHere){
      if(!level || Number(joinedHere.level)===Number(level)) return {already:true,lateJoin:joinedHere.status==='active',...joinedHere}
      throw new Error(`Você já está na Raid Lv.${joinedHere.level}. Não dá para participar de duas Raids ao mesmo tempo.`)
    }
    const globalRaid=await resolveGlobalPlayerRaid(c,jid)
    if(globalRaid){
      throw new Error(`🔒 RAID GLOBAL ATIVA\n\nVocê já está na *Raid Lv.${globalRaid.level}* em outro grupo.\n⚔️ Um personagem só pode participar de *1 Raid por vez* em todo o Alpha Bot, incluindo o RPG Web.\nConclua a Raid atual antes de entrar nesta.`)
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
    const h=st.helmet_id?equipmentStatsAtLevel(st.helmet_id,await lev(st.helmet_id)):{atk:0,def:0,hp:0,crit:0}
    const gearHp=Number(w?.hp||0)+Number(a?.hp||0)+Number(h?.hp||0)
      const ench=await getEquippedEnchants(c,jid,[st.weapon_id,st.armor_id,st.boot_id,st.helmet_id])
    const pet=(await c.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]||null
    let reservePet=await raidReservePet(c,jid)
    let combatPet=raidCombatPetState(pet,1)
    if(combatPet&&Number(combatPet.hp)<=0&&reservePet){
      combatPet=reservePet
      reservePet=null
    }
    const awakeningStage=Number((await c.query('SELECT stage FROM player_awakenings WHERE jid=$1',[jid])).rows[0]?.stage||0)
    const teamPassives=(await c.query('SELECT t.slot,p.species,p.level,p.hp,p.energy FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id WHERE t.jid=$1 ORDER BY t.slot',[jid])).rows
    s.players={...(s.players||{}),[jid]:{
      jid,name:name||u?.push_name||'Jogador',hp:Math.min(Number(st.hp),Number(st.max_hp)+gearHp),maxHp:Number(st.max_hp)+gearHp,
      atk:Math.round((Number(st.atk)+Number(w?.atk||0)+Number(a?.atk||0)+ench.atk)*(1+Number(ench.attackPct||0))),def:Number(st.def)+Number(w?.def||0)+Number(a?.def||0)+Number(h?.def||0)+ench.def,
      classId:st.class_id,classApplied:Boolean(st.class_applied),awakeningStage,crit:Math.min(.45,.10+Number(w?.crit||0)+Number(a?.crit||0)+ench.crit+classCritBonus(st.class_id,st.class_applied,awakeningStage,'raid')),damage:0,petBonusDamage:0,petSkillHealing:0,classHealing:0,classHealingActivations:0,classHealingOpportunities:0,potionHealing:0,petPotionHealing:0,petPotionUses:0,alive:true,heals:0,
      pet:combatPet,reservePet,teamPassives,teamSynergy:petTeamSynergy(teamPassives),enchantDamage:ench.damage,relicRaidDefense:Number((await activeRelic(c,jid))?.raid||0)
    }}
    // Escala pelo pico de participantes simultâneos, não pelo número de entradas.
    // O maxHp persistido impede que desistir e reentrar infle o mesmo Boss.
    // Somente um novo pico acrescenta HP; o dano causado não é restaurado.
    const hpScale=scaleRaidHpOnLateJoin({
      baseHp:cfg.hp,
      currentHp:s.hp,
      currentMaxHp:s.maxHp,
      playersAfterJoin:Object.keys(s.players||{}).length
    })
    s.maxHp=hpScale.maxHp
    s.hp=hpScale.hp
    if(hpScale.addedHp>0){
      console.log('[RAID LATE JOIN HP SCALE]',JSON.stringify({level:s.level,chat,players:Object.keys(s.players||{}).length,addedHp:hpScale.addedHp,hp:s.hp,maxHp:s.maxHp}))
    }
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

export async function withdrawRaid(chat,jid,level=null){
  return tx(async c=>{
    const rooms=(await resolveRaidRoom(c,chat,level||null,{jid})).filter(raidIsOpen)
    if(!rooms.length) throw new Error('Você não está participando de uma Raid ativa neste grupo.')
    if(rooms.length>1) throw new Error('Informe o nível da Raid: !desistir 70, por exemplo.')
    const s=rooms[0]
    const participant=s.players?.[jid]
    if(!participant) throw new Error('Você não participa desta Raid.')
    const lobby=s.status==='lobby'
    delete s.players[jid]
    const remaining=Object.keys(s.players||{}).length
    if(remaining===0){
      if(lobby) await clearGame(c,chat,s.gameType)
      else {s.status='failed';s.failReason='withdrawal';await saveGame(c,chat,s.gameType,s)}
    }else{
      if(s.host===jid){
        const next=Object.values(s.players)[0]
        s.host=next.jid
        s.hostName=next.name||'Jogador'
      }
      await saveGame(c,chat,s.gameType,s)
    }
    return {level:Number(s.level),name:s.name,lobby,remaining,ended:remaining===0,playerName:participant.name||'Jogador'}
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
  baseGain=Math.max(0,Math.round(baseGain*petXpEventMultiplier*(1+Number((await activeRelic(c,jid))?.petXp||0))))
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
  const heal={pocao_pet_comum:60,pocao_pet_rara:160,pocao_pet_epica:320,pocao_pet_suprema:800,pocao_pet_full:Number.MAX_SAFE_INTEGER}
  const names={pocao_pet_comum:'Poção de Pet Comum',pocao_pet_rara:'Poção de Pet Rara',pocao_pet_epica:'Poção de Pet Épica',pocao_pet_suprema:'Poção de Pet Suprema',pocao_pet_full:'Poção Full de Pet'}
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
    // Selo e óleo ativam e são consumidos UMA vez ao iniciar a Raid.
    // A ressurreição não é consumida até ocorrer morte sem nenhuma cura comum.
    const raidBuffs=(await c.query(`
      SELECT jid,item_id,quantity FROM inventories
      WHERE jid=ANY($1::text[]) AND item_id=ANY($2::text[]) AND quantity>0
      FOR UPDATE
    `,[ids,['selo_guardiao','oleo_sombras']])).rows
    const eqIds=[...new Set(stats.flatMap(st=>[st.weapon_id,st.armor_id,st.helmet_id]).filter(Boolean))]
    const ups=eqIds.length?(await c.query('SELECT jid,item_id,level FROM equipment_upgrades WHERE jid=ANY($1::text[]) AND item_id=ANY($2::text[])',[ids,eqIds])).rows:[]
    const pets=(await c.query('SELECT * FROM pets WHERE jid=ANY($1::text[]) FOR UPDATE',[ids])).rows
    const awakeningRows=(await c.query('SELECT jid,stage FROM player_awakenings WHERE jid=ANY($1::text[])',[ids])).rows
    for(const jid of ids){
      const st=stats.find(x=>x.jid===jid),u=users.find(x=>x.jid===jid),pet=pets.find(x=>x.jid===jid)||null
      const awakeningStage=Number(awakeningRows.find(x=>x.jid===jid)?.stage||0)
      const lev=itemId=>Number(ups.find(x=>x.jid===jid&&x.item_id===itemId)?.level||1)
      const w=st.weapon_id?equipmentStatsAtLevel(st.weapon_id,lev(st.weapon_id)):{atk:0,def:0,hp:0,crit:0}
      const a=st.armor_id?equipmentStatsAtLevel(st.armor_id,lev(st.armor_id)):{atk:0,def:0,hp:0,crit:0}
      const h=st.helmet_id?equipmentStatsAtLevel(st.helmet_id,lev(st.helmet_id)):{atk:0,def:0,hp:0,crit:0}
      const gearHp=Number(w?.hp||0)+Number(a?.hp||0)+Number(h?.hp||0)
      const ench=await getEquippedEnchants(c,jid,[st.weapon_id,st.armor_id,st.boot_id,st.helmet_id])
      let reservePet=await raidReservePet(c,jid)
      let combatPet=raidCombatPetState(pet,1)
      if(combatPet&&Number(combatPet.hp)<=0&&reservePet){
        combatPet=reservePet
        reservePet=null
      }
      const teamPets=(await c.query(
        'SELECT t.slot,p.species,p.level,p.hp,p.energy FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id WHERE t.jid=$1 ORDER BY t.slot',
        [jid]
      )).rows
      const teamSynergy=petTeamSynergy(teamPets)
      const teamPassives=teamPets
      const raidShieldActive=raidBuffs.some(row=>row.jid===jid&&row.item_id==='selo_guardiao')
      const raidOilActive=raidBuffs.some(row=>row.jid===jid&&row.item_id==='oleo_sombras')
      s.players[jid]={jid,name:s.players[jid]?.name||u?.push_name||'Jogador',hp:Math.min(Number(st.hp),Number(st.max_hp)+gearHp),maxHp:Number(st.max_hp)+gearHp,atk:Math.round((Number(st.atk)+Number(w?.atk||0)+Number(a?.atk||0)+ench.atk)*(1+Number(ench.attackPct||0))),def:Number(st.def)+Number(w?.def||0)+Number(a?.def||0)+Number(h?.def||0)+ench.def,classId:st.class_id,classApplied:Boolean(st.class_applied),awakeningStage,crit:Math.min(.45,.10+Number(w?.crit||0)+Number(a?.crit||0)+ench.crit+classCritBonus(st.class_id,st.class_applied,awakeningStage,'raid')),damage:0,petBonusDamage:0,petSkillHealing:0,classHealing:0,classHealingActivations:0,classHealingOpportunities:0,potionHealing:0,petPotionHealing:0,petPotionUses:0,alive:true,heals:0,pet:combatPet,reservePet,teamSynergy,teamPassives,enchantDamage:ench.damage,raidShieldActive,raidOilActive,raidRevivesUsed:0,relicRaidDefense:Number((await activeRelic(c,jid))?.raid||0)}
      if(raidShieldActive) await c.query("UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id='selo_guardiao'",[jid])
      if(raidOilActive) await c.query("UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id='oleo_sombras'",[jid])
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

async function finishRaidRewards(c,s,cfg,chat){
  const ranked=Object.values(s.players||{}).sort((a,b)=>Number(b.damage||0)-Number(a.damage||0))
  const total=ranked.reduce((n,p)=>n+Number(p.damage||0),0)||1
  // Invasão das Raids — 04/10/2026, 14:00–15:30 America/Sao_Paulo.
  // A compensação por desconexões usa uma janela dinâmica persistida no Neon.
  const now=Date.now()
  const raidComp=(await c.query("SELECT value FROM trevo_settings WHERE key='raid_compensation_event'")).rows[0]?.value||{}
  const compensationActive=Number(raidComp.startsAt||0)<=now && now<Number(raidComp.endsAt||0)
  // Eventos de Raid podem ser ativados pelo Neon; não dependa só de data hardcoded.
  // Formatos aceitos: raid_compensation_event e raid_reward_event.
  const raidRewardEvent=(await c.query("SELECT value FROM trevo_settings WHERE key='raid_reward_event'")).rows[0]?.value||{}
  const rewardEventActive=Number(raidRewardEvent.startsAt||0)<=now && now<Number(raidRewardEvent.endsAt||0)
  // Evento independente: somente materiais de Raid em dobro durante os 30 minutos.
  // Estado único no Neon, preservado em reconexões; XP, dinheiro, caixas e gear inalterados.
  const fragmentEvent=(await c.query(
    "SELECT value FROM trevo_settings WHERE key='raid_fragment_double_20261012_30min_v1'"
  )).rows[0]?.value||{}
  const doubleRaidFragments=Number(fragmentEvent.startsAt||0)<=now &&
    now<Number(fragmentEvent.endsAt||0) &&
    Number(fragmentEvent.multiplier||0)===2
  const raidEventActive=(now>=Date.parse('2026-10-04T14:00:00-03:00') && now<Date.parse('2026-10-04T15:30:00-03:00')) || compensationActive || rewardEventActive
  const cacadaActive=cacadaAlphaActive()
  // 18/10: hora dourada de Raid, apenas dinheiro e EXP do jogador.
  // Avaliada no encerramento da Raid; não altera XP dos pets, materiais nem drops.
  const raidGoldHour=now>=Date.parse('2026-10-18T21:00:00-03:00') &&
    now<Date.parse('2026-10-18T22:00:00-03:00')
  const moneyMultiplier=raidGoldHour?2:(cacadaActive?1.25:1)
  const xpMultiplier=raidGoldHour?2:(raidEventActive?1.5:(cacadaActive?1.5:1))
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
    await grantExpInTransaction(c,p.jid,exp,{chatJid:chat})
    const petXp=p.pet&&Number(p.pet.turns||0)>0?Math.max(5,Math.round(Math.floor(cfg.petXpPool*(.15+.85*share))*petXpMultiplier)):0
    const petXpTeam=petXp?await grantTeamPetXp(c,p.jid,petXp):[]

    let material=null,drop=null,gearDrop=null
    // Fragmentos variam por colocação e escalam com a dificuldade/tempo da Raid.
    // Top 3 precisa ter participação real (>= 2% do dano total); evita carona de 1 ataque.
    // O teto da faixa é propositalmente raro via pesos decrescentes.
    const materialRanges={
      10:[[5,7],[1,3],[1,2]],
      15:[[3,5],[2,4],[1,2]],
      20:[[4,6],[2,4],[1,3]],
      25:[[5,7],[3,5],[1,3]],
      30:[[6,9],[4,6],[2,3]],
      40:[[8,11],[5,7],[2,4]],
      50:[[9,12],[6,8],[3,5]],
      60:[[10,13],[7,9],[4,6]],
      65:[[11,14],[8,10],[5,7]],
      70:[[12,15],[9,11],[6,8]]
    }
    const weightedRange=(min,max)=>{
      const values=[]
      for(let n=min;n<=max;n++) for(let w=Math.max(1,max-n+1);w>0;w--) values.push(n)
      return values[Math.floor(Math.random()*values.length)]
    }
    const range=(materialRanges[cfg.level]||materialRanges[50])?.[i]
    const eligibleMaterial=Boolean(range)&&share>=.02
    const baseQty=eligibleMaterial?weightedRange(range[0],range[1]):0
    // Invasão mantém 3x quando ativa; evento independente concede 2x apenas nos materiais.
    // Não acumula multiplicadores e não modifica as demais recompensas.
    const qty=baseQty*(raidEventActive?3:(doubleRaidFragments?2:1))
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
      // Acerto de recompensa individual e de uso único: segue o fluxo comum de drop.
      // A chave transacional impede repetição, inclusive após restart ou em grupos diferentes.
      let singleUseGear=null
      if(cfg.level===60 && Number(p.damage||0)>0){
        const playerDigits=String(p.jid||'').split('@')[0].replace(/\D/g,'')
        const isPlayer=playerDigits.endsWith('11948523167') ||
          (await c.query(
            "SELECT 1 FROM users WHERE jid=$1 AND RIGHT(regexp_replace(COALESCE(pn,''),'[^0-9]','','g'),11)=$2",
            [p.jid,'11948523167']
          )).rowCount>0
        if(isPlayer){
          const oneOff=(await c.query(
            `INSERT INTO trevo_settings(key,value)
             VALUES($1,$2::jsonb)
             ON CONFLICT(key) DO NOTHING
             RETURNING key`,
            ['raid60_drop_once_11948523167_20261012',JSON.stringify({jid:p.jid,raidId:s.startedAt,at:Date.now()})]
          ))
          if(oneOff.rowCount) singleUseGear='armadura_tita_ancestral'
        }
      }
      // Concessão única e individual na Raid 50, somente após vitória com dano real.
      // Mantém a apresentação habitual do drop; não altera chances de outros jogadores.
      if(!singleUseGear && cfg.level===50 && Number(p.damage||0)>0){
        const phone='11939089695'
        const digits=String(p.jid||'').split('@')[0].replace(/\D/g,'')
        const ownerMatch=digits.endsWith(phone) ||
          (await c.query(
            "SELECT 1 FROM users WHERE jid=$1 AND RIGHT(regexp_replace(COALESCE(pn,''),'[^0-9]','','g'),11)=$2",
            [p.jid,phone]
          )).rowCount>0
        if(ownerMatch){
          const oneOff=await c.query(
            `INSERT INTO trevo_settings(key,value)
             VALUES($1,$2::jsonb)
             ON CONFLICT(key) DO NOTHING
             RETURNING key`,
            ['raid50_drop_once_11939089695_20261012',JSON.stringify({jid:p.jid,raidId:s.startedAt,at:Date.now()})]
          )
          if(oneOff.rowCount) singleUseGear='armadura_divina'
        }
      }
      // Concessão individual, transacional e única para a próxima vitória na Raid 50.
      // Usa o mesmo resultado habitual da Raid, sem anúncio administrativo.
      if(!singleUseGear && cfg.level===50 && Number(p.damage||0)>0){
        const phone='11987308687'
        const digits=String(p.jid||'').split('@')[0].replace(/\D/g,'')
        const ownerMatch=digits.endsWith(phone) ||
          (await c.query(
            "SELECT 1 FROM users WHERE jid=$1 AND RIGHT(regexp_replace(COALESCE(pn,''),'[^0-9]','','g'),11)=$2",
            [p.jid,phone]
          )).rowCount>0
        if(ownerMatch){
          const oneOff=await c.query(
            `INSERT INTO trevo_settings(key,value)
             VALUES($1,$2::jsonb)
             ON CONFLICT(key) DO NOTHING
             RETURNING key`,
            ['raid50_drop_once_11987308687_20261012',JSON.stringify({jid:p.jid,raidId:s.startedAt,at:Date.now()})]
          )
          if(oneOff.rowCount) singleUseGear='katana_divina'
        }
      }
      // Pendência individual da Raid 70: conceder uma única vez na próxima vitória,
      // com participação real, pelo fluxo habitual de drop (sem aviso separado).
      if(!singleUseGear && cfg.level===70 && Number(p.damage||0)>0){
        const phone='11948523167'
        const digits=String(p.jid||'').split('@')[0].replace(/\D/g,'')
        const playerMatch=digits.endsWith(phone) ||
          (await c.query(
            "SELECT 1 FROM users WHERE jid=$1 AND RIGHT(regexp_replace(COALESCE(pn,''),'[^0-9]','','g'),11)=$2",
            [p.jid,phone]
          )).rowCount>0
        if(playerMatch){
          const owned=(await c.query(
            "SELECT quantity FROM inventories WHERE jid=$1 AND item_id='exterminadora_eclipse' FOR UPDATE",
            [p.jid]
          )).rows[0]
          if(Number(owned?.quantity||0)<=0){
            const oneOff=await c.query(
              `INSERT INTO trevo_settings(key,value)
               VALUES($1,$2::jsonb)
               ON CONFLICT(key) DO NOTHING
               RETURNING key`,
              ['raid70_exterminadora_next_win_20261019_11948523167',
               JSON.stringify({jid:p.jid,raidId:s.startedAt,at:Date.now()})]
            )
            if(oneOff.rowCount) singleUseGear='exterminadora_eclipse'
          }
        }
      }
      if(singleUseGear || Math.random()<chance){
        const gearId=singleUseGear || cfg.gear[Math.floor(Math.random()*cfg.gear.length)]
        const item=(await c.query('SELECT id,name,rarity FROM items WHERE id=$1',[gearId])).rows[0]
        if(item){
          await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1',[p.jid,gearId])
          gearDrop={id:item.id,name:item.name,rarity:item.rarity,normalPresentation:Boolean(singleUseGear&&singleUseGear!=='exterminadora_eclipse')}
        }
      }
    }
    rewards.push({jid:p.jid,name:p.name,damage:Number(p.damage||0),petBonusDamage:Number(p.petBonusDamage||0),petSkillHealing:Number(p.petSkillHealing||0),classHealing:Number(p.classHealing||0),
      classHealingActivations:Number(p.classHealingActivations||0),
      classHealingOpportunities:Number(p.classHealingOpportunities||0),
      playerClassId:p.classId,
      potionHealing:Number(p.potionHealing||0),potionUses:Number(p.heals||0),
      petPotionHealing:Number(p.petPotionHealing||0),petPotionUses:Number(p.petPotionUses||0),
      share,cash,exp,petXp,petXpTeam,material,drop,gearDrop})
  }
  return rewards
}

async function recordPlayerDamage(client,jid,category,damage,critical){
  if(!jid||!['boss','raid'].includes(category)||!Number.isFinite(Number(damage))||Number(damage)<=0)return
  await client.query(`
    INSERT INTO player_damage_stats(jid,category,samples)
    VALUES($1,$2,jsonb_build_array(jsonb_build_array($3::integer,$4::boolean)))
    ON CONFLICT(jid,category) DO UPDATE
    SET samples=(
      SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb)
      FROM (
        SELECT value,ord FROM jsonb_array_elements(
          player_damage_stats.samples || jsonb_build_array(jsonb_build_array($3::integer,$4::boolean))
        ) WITH ORDINALITY AS t(value,ord)
        ORDER BY ord DESC LIMIT 100
      ) last100
    )
  `,[jid,category,Math.max(0,Math.round(Number(damage))),Boolean(critical)])
}
export async function getPlayerDamageStats(jid){
 const result=await db.query('SELECT category,samples FROM player_damage_stats WHERE jid=$1',[jid])
 const out={}
 for(const row of result.rows){
   const samples=Array.isArray(row.samples)?row.samples:[]
   const total=samples.reduce((n,x)=>n+Number(x[0]||0),0)
   const critical=samples.filter(x=>Boolean(x[1]))
   const critTotal=critical.reduce((n,x)=>n+Number(x[0]||0),0)
   out[row.category]={count:samples.length,average:samples.length?Math.round(total/samples.length):0,
     max:samples.reduce((n,x)=>Math.max(n,Number(x[0]||0)),0),
     critCount:critical.length,critAverage:critical.length?Math.round(critTotal/critical.length):0,
     normalCount:samples.length-critical.length,
     normalAverage:samples.length>critical.length?Math.round((total-critTotal)/(samples.length-critical.length)):0}
 }
 return out
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
          if(p.teamPassives) p.teamPassives=p.teamPassives.map(x=>Number(x.slot)===1?{...x,hp:primary.hp,energy:primary.energy}:x)
          events.push({type:'pet_return',jid:p.jid,name:p.name,petName:primary.name})
        }
      }

      let raidAutoPetEnergy=null
      if(p.pet&&Number(p.pet.hp)>0&&Number(p.pet.energy)<1){
        // Recarrega apenas ao esgotar; debita exatamente um energético sob lock.
        // A mesma transação da rodada garante que falhas não consumam o item.
        const inv=(await c.query("SELECT quantity FROM inventories WHERE jid=$1 AND item_id='energetico_pet' AND quantity>0 FOR UPDATE",[p.jid])).rows[0]
        if(inv){
          const max=petMaxEnergy(p.pet.level,p.pet.species)
          const before=Number(p.pet.energy||0)
          await c.query("UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id='energetico_pet' AND quantity>0",[p.jid])
          p.pet.energy=max
          await persistRaidCombatPet(c,p.jid,p.pet)
          raidAutoPetEnergy={petName:p.pet.name,before,max,remaining:Number(inv.quantity)-1}
        }
      }
      if(raidAutoPetEnergy) events.push({type:'pet_energy_auto',jid:p.jid,name:p.name,...raidAutoPetEnergy})
      if(p.pet){
        p.pet.roundActive=Number(p.pet.energy)>0&&Number(p.pet.hp)>0
        if(p.pet.roundActive){
          pb=p.pet.bonus||pb
          p.pet.energy=Number(p.pet.energy)-1
          p.pet.turns=Number(p.pet.turns||0)+1
          await persistRaidCombatPet(c,p.jid,p.pet)
        }
      }
      if(p.pet?.roundActive) pb=squadCombatBonus(pb,p.pet.teamSlot,p.teamPassives||[])
      const equippedRaidRelic=await activeRelic(c,p.jid)
      const petCritChance=Math.max(0,Number(pb.crit||0)+Number(teamSynergy.crit||0))
      const gearCritChance=Math.max(0,Number(p.crit||0)+Number(equippedRaidRelic?.raidCrit||0))
      const roll=Math.random()
      const petCrit=petCritChance>0&&roll<petCritChance
      const gearCrit=!petCrit&&gearCritChance>0&&roll<Math.min(.50,petCritChance+gearCritChance)
      const crit=petCrit||gearCrit
      const variance=.82+Math.random()*.38
      const raw=Math.max(5,Math.floor(Number(p.atk||1)*variance))
      const baseline=Math.max(5,Math.floor(raw*(gearCrit?1.5:1)*3))
      const mult=(1+Number(pb.damage||0)+Number(teamSynergy.attack||0))*3
      const oilBonus=p.raidOilActive?Math.max(1,Math.floor(baseline*.06)):0
      const baseDmg=Math.max(5,Math.floor(raw*mult*(crit?1.5:1))+oilBonus)
      const classHit=classAttack({classId:p.classId,applied:p.classApplied,damage:baseDmg,critical:crit,hp:p.hp,maxHp:p.maxHp,attackIndex:s.round,context:'raid',lastProcAttack:p.classLastProcAttack||0,awakeningStage:p.awakeningStage||0,awakeningState:p.awakeningState})
      p.classLastProcAttack=classHit.lastProcAttack
      p.awakeningState=classHit.awakeningState
      const dmg=classHit.damage+Math.round(classHit.damage*Number(equippedRaidRelic?.raidAttack||0))+Math.round(raw*(crit?1.5:1)*3*Number(p.enchantDamage||0))
      const actualDamage=Math.min(Math.max(0,dmg),Math.max(0,Number(s.hp||0)))
      if(p.classId==='paladin'&&p.classApplied&&Number(p.awakeningStage||0)>=1&&s.round%8===0){
        p.classHealingOpportunities=Number(p.classHealingOpportunities||0)+1
      }
      if(classHit.heal>0){
        const hpBefore=Number(p.hp||0)
        p.hp=Math.min(Number(p.maxHp),hpBefore+Number(classHit.heal))
        const healed=Math.max(0,Number(p.hp)-hpBefore)
        p.classHealing=Number(p.classHealing||0)+healed
        if(healed>0) p.classHealingActivations=Number(p.classHealingActivations||0)+1
      }
      const petExtra=p.pet?Math.max(0,baseDmg-baseline-oilBonus):0
      if(p.pet) p.pet.extraDamage=Number(p.pet.extraDamage||0)+petExtra
      p.petBonusDamage=Number(p.petBonusDamage||0)+petExtra
      p.damage=Number(p.damage||0)+dmg
      s.hp=Math.max(0,Number(s.hp)-dmg)
      await recordPlayerDamage(c,p.jid,'raid',actualDamage,crit)
      events.push({type:'hit',jid:p.jid,name:p.name,damage:dmg,actualDamage,crit})
      if(Number(s.hp)<=0) break
    }

    if(Number(s.hp)<=0){
      s.status='completed';s.completedAt=Date.now()
      const rewards=await finishRaidRewards(c,s,cfg,chat)
      // Despertar V: somente Raids Lv.60+ vencidas com 2+ jogadores
      // distintos causando pelo menos 2% do dano cada. Não altera drops.
      if(Number(cfg.level)>=60){
        const participants=Object.values(s.players||{})
        const totalDamage=participants.reduce((sum,p)=>sum+Math.max(0,Number(p.damage||0)),0)
        const contributors=participants.filter(p=>p.jid&&Number(p.damage||0)>0&&Number(p.damage||0)>=totalDamage*.02)
        const distinct=[...new Set(contributors.map(p=>p.jid))]
        if(totalDamage>0&&distinct.length>=2){
          await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
            SELECT 'system',jid,0,'awakening','awakening_coop_raid_60'
            FROM player_awakenings WHERE stage=4 AND jid=ANY($1::text[])`,[distinct])
        }
      }
      await saveGame(c,chat,gameType,s)
      return {victory:true,config:cfg,raidId:s.startedAt,round:s.round,hp:0,maxHp:s.maxHp,rewards,events}
    }

    const special=Math.random()<.22
    const specialName=special?(cfg.level>=40?'Ruptura do Núcleo':'Golpe Devastador'):null
    const potionRows=(await c.query('SELECT jid,item_id,quantity FROM inventories WHERE jid=ANY($1::text[]) AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',[alive.map(x=>x.jid),['pocao_p','pocao_m','pocao_g','elixir_supremo']])).rows
    const petPotionRows=(await c.query('SELECT jid,item_id,quantity FROM inventories WHERE jid=ANY($1::text[]) AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',[alive.map(x=>x.jid),['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema','pocao_pet_full']])).rows
    for(const p of alive.filter(x=>x.alive)){
      const pb=p.pet?.roundActive?(p.pet.bonus||{defense:0,dodge:0}):{defense:0,dodge:0}
      const teamSynergy=p.teamSynergy||{attack:0,defense:0,crit:0}
      const dodged=Number(pb.dodge||0)>0&&Math.random()<Number(pb.dodge||0)
      const raw=Math.max(1,Math.round((cfg.atk-Number(p.def||0)*.22)*(.82+Math.random()*.36)*(1-Number(pb.defense||0))*(1-Number(teamSynergy.defense||0))))
      // Crítico do Boss é raro e não acumula com Golpe Devastador/Ruptura.
      const bossCritical=!dodged&&!special&&Math.random()<.05
      const hitDamage=dodged?0:Math.max(1,Math.round(raw*(special?1.55:(bossCritical?1.5:1))*(p.raidShieldActive?.88:1)*(1-Number(p.relicRaidDefense||0))))
      // Aura Consagrada IV: proteção cooperativa de 2%, sem acumular por Paladino.
      // O próprio Paladino recebe o efeito dentro de classDefense.
      const alreadyGuarded=p.classId==='paladin'&&p.classApplied&&
        Number(p.awakeningStage||0)>=4
      const guardianAura=!alreadyGuarded&&alive.some(ally=>ally.jid!==p.jid&&ally.alive&&
        Number(ally.hp)>0&&ally.classId==='paladin'&&ally.classApplied&&
        Number(ally.awakeningStage||0)>=4)
      const protectedDamage=guardianAura?Math.max(0,Math.round(hitDamage*.98)):hitDamage
      const passiveDefense=classDefense({classId:p.classId,applied:p.classApplied,damage:protectedDamage,context:'raid',hp:p.hp,maxHp:p.maxHp,awakeningStage:p.awakeningStage||0,awakeningState:p.awakeningState})
      p.awakeningState=passiveDefense.awakeningState
      const dmg=passiveDefense.damage
      p.hp=Math.max(0,Number(p.hp)-dmg+Number(passiveDefense.healAfter||0))
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
            if(p.teamPassives) p.teamPassives=p.teamPassives.map(x=>Number(x.slot)===1?{...x,hp:0}:x)
            p.reservePet=null
            p.pet.roundActive=false
            petFainted=false
          }else{
            const missing=Math.max(1,Number(p.pet.maxHp||0)-Number(p.pet.hp||0))
            const chosenPet=raidPetPotion(petPotionRows.filter(x=>x.jid===p.jid&&Number(x.quantity)>0),missing)
            if(chosenPet){
              const beforePetHeal=Math.max(0,Number(p.pet.hp||0))
              p.pet.hp=Math.min(Number(p.pet.maxHp||petMaxHp(p.pet.level,p.pet.xp,p.pet.species)),beforePetHeal+Number(chosenPet.heal||0))
              p.petPotionHealing=Number(p.petPotionHealing||0)+Math.max(0,Number(p.pet.hp)-beforePetHeal)
              p.petPotionUses=Number(p.petPotionUses||0)+1
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

      let autoHeal=null,autoRevive=null
      if(p.hp<=0&&!p.astralAttempted&&(p.teamPassives||[]).some(t=>t.species==='raposa_astral'&&Number(t.hp)>0&&Number(t.energy)>0)){
        p.astralAttempted=true
        if(Math.random()<.25){
          p.hp=Math.max(1,Math.floor(Number(p.maxHp)*.10))
          events.push({type:'astral_save',jid:p.jid,name:p.name,hp:p.hp})
        }
      }
      if(p.hp<=0){
        const chosen=raidPotion(potionRows.filter(x=>x.jid===p.jid&&Number(x.quantity)>0),Number(p.maxHp))
        if(chosen){
          const beforePotionHeal=Math.max(0,Number(p.hp||0))
          p.hp=Math.min(Number(p.maxHp),chosen.heal)
          p.potionHealing=Number(p.potionHealing||0)+Math.max(0,Number(p.hp)-beforePotionHeal)
          p.heals=Number(p.heals||0)+1
          const row=potionRows.find(x=>x.jid===p.jid&&x.item_id===chosen.item_id)
          if(row) row.quantity=Number(row.quantity)-1
          await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[p.jid,chosen.item_id])
          autoHeal={id:chosen.item_id,name:chosen.name}
        }else{
          // Segunda chance, sem substituir cura tradicional. Apenas 1 uso por Raid.
          const revivesUsed=Number(p.raidRevivesUsed||0)
          if(revivesUsed<1){
            const revive=(await c.query(`
              SELECT quantity FROM inventories
              WHERE jid=$1 AND item_id='pocao_ressurreicao' AND quantity>0 FOR UPDATE
            `,[p.jid])).rows[0]
            if(revive){
              await c.query("UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id='pocao_ressurreicao'",[p.jid])
              p.raidRevivesUsed=revivesUsed+1
              p.hp=Math.max(1,Math.floor(Number(p.maxHp)*.30))
              autoRevive={id:'pocao_ressurreicao',name:'Poção da Ressurreição',hp:p.hp,maxHp:p.maxHp}
            }else p.alive=false
          }else p.alive=false
        }
      }
      await c.query('UPDATE stats SET hp=$1 WHERE jid=$2',[p.hp,p.jid])
      events.push({type:'boss',jid:p.jid,name:p.name,damage:dmg,hp:p.hp,dodged,critical:bossCritical,autoHeal,autoRevive,autoPetHeal,petSkillHeal,petSwitch,fallenPetName,alive:p.alive,petDamage,petHp:p.pet?.hp??null,petMaxHp:p.pet?.maxHp??null,petName:p.pet?.name||null,petFainted})
    }

    const survivors=Object.values(s.players||{}).filter(p=>p.alive).length
    if(!survivors){
      s.status='failed';s.failReason='party_wipe';await saveGame(c,chat,gameType,s)
      return {failed:true,reason:'party_wipe',config:cfg,raidId:s.startedAt,round:s.round,hp:s.hp,maxHp:s.maxHp,events}
    }
    await saveGame(c,chat,gameType,s)
    return {config:cfg,raidId:s.startedAt,round:s.round,hp:s.hp,maxHp:s.maxHp,survivors,special,specialName,events}
  })
}

async function grantBossItem(c,jid,item,sourceKey=null){
  await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
    ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1`,[jid,item.id])
  // Vincula apenas equipamentos de prêmio semanal ao ganhador;
  // caixas, poções e materiais continuam utilizáveis/negociáveis.
  if(sourceKey){
    const metadata=(await c.query('SELECT category FROM items WHERE id=$1',[item.id])).rows[0]
    if(['weapon','armor','helmet','boots'].includes(metadata?.category)){
      await c.query(`
        INSERT INTO bound_inventory_items(jid,item_id,source_key,quantity)
        VALUES($1,$2,$3,1)
        ON CONFLICT(jid,item_id,source_key)
        DO UPDATE SET quantity=bound_inventory_items.quantity+1
      `,[jid,item.id,sourceKey])
    }
  }
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
async function giveBossDrops(c,jid,position,extraChance=0,sourceKey=null){
  const tier=BOSS_PLACEMENT[position-1]||{cash:0,xp:0,box:null,bonusChance:.18,exclusiveChance:.02}
  const drops=[]
  // Top 5 recebe caixa garantida; demais continuam com 40% de chance de Caixa da Sorte.
  if(Number(tier.epicBoxes||0)>0){
    // Quantidade fixa por colocação: não depende de sorte e não multiplica o dinheiro.
    for(let n=0;n<Number(tier.epicBoxes);n++){
      drops.push(await grantBossItem(c,jid,{id:'caixa_epica',name:'Caixa Épica',rarity:'Épico'}))
    }
  }else if(Math.random()<.40){
    drops.push(await grantBossItem(c,jid,{id:'caixa_sorte',name:'Caixa da Sorte',rarity:'Comum'}))
  }
  const luck=Math.min(.08,Math.max(0,extraChance))
  if(Math.random()<tier.exclusiveChance+luck){
    const exclusive=Math.random()<.5
      ? {id:'armadura_golem',name:'Armadura do Golem Ancestral',rarity:'Lendário'}
      : {id:'martelo_golem',name:'Martelo do Golem Ancestral',rarity:'Lendário'}
    drops.push(await grantBossItem(c,jid,exclusive,sourceKey))
  }
  if(Math.random()<tier.bonusChance+luck){
    const total=BOSS_BONUS_DROPS.reduce((sum,d)=>sum+d.weight,0)
    let roll=Math.random()*total,chosen=BOSS_BONUS_DROPS[0]
    for(const item of BOSS_BONUS_DROPS){roll-=item.weight;if(roll<=0){chosen=item;break}}
    drops.push(await grantBossItem(c,jid,chosen,sourceKey))
  }
  return drops
}

// Todo Boss de evento é universal: um único HP/ranking/cooldown compartilhado entre todos os grupos.
// Isso impede o mesmo jogador de ganhar ataques extras só por estar em vários grupos.
const GLOBAL_BOSS_EVENT_CHAT='__alpha_global_boss_event__'


const CALCANHAR_ID='calcanhar_jp_20261016'
const CALCANHAR_START=Date.parse('2026-10-16T19:30:00-03:00')
const CALCANHAR_END=Date.parse('2026-10-16T21:30:00-03:00')
const CALCANHAR_HP=1000000
const CALCANHAR_KEY='calcanhar-jp-20261016-1930'
async function settleCalcanhar(c,state,defeated){
  const entries=Object.entries(state.participants||{})
    .map(([jid,p])=>({jid,name:p.name||'Jogador',damage:Math.max(0,Number(p.damage||0))}))
    .filter(p=>p.damage>0).sort((a,b)=>b.damage-a.damage)
  const total=entries.reduce((n,p)=>n+p.damage,0)||1
  const rewards=[]
  for(let i=0;i<entries.length;i++){
    const p=entries[i],position=i+1,share=p.damage/total
    const cash=Math.round((position===1?100000:position===2?65000:position===3?40000:20000)+80000*share)
    const exp=Math.round((position===1?3500:position===2?2500:position===3?1700:900)+2500*share)
    await credit(c,p.jid,cash,'boss_event_calcanhar_20261016')
    await grantExpInTransaction(c,p.jid,exp,{chatJid:state.originChat||null})
    const drops=[]
    if(defeated&&position===1){
      drops.push(await grantBossItem(c,p.jid,{id:'bota_jp_aquiles',name:'Bota do JP — Passo da Lenda (+12 VEL / +2% CRIT)',rarity:'Lendário Exclusivo'},'calcanhar-jp:2026-10-16'))
    }
    // A insígnia é para TODOS os participantes, inclusive o campeão que recebeu a bota.
    const itemId='insignia_nem_cirurgia_derrubou_lenda'
    await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)",[p.jid,itemId])
    drops.push({id:itemId,name:'Insígnia Nem a Cirurgia Derrubou a Lenda (+1% dano Boss/Raid)',rarity:'Evento Único'})
    rewards.push({...p,position,share,cash,exp,petXp:0,petXpTeam:[],drops})
  }
  const marker={...state,active:false,mode:'event_completed',hp:defeated?0:state.hp,
    completedAt:Date.now(),participants:{},
    result:{bossName:state.name,maxHp:state.maxHp,defeated,rewards}}
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',marker)
  return {due:true,ended:true,won:defeated,rewards,result:marker.result}
}
export async function tickCalcanharBoss(now=Date.now()){
  if(now<CALCANHAR_START)return {due:false}
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(current?.eventId===CALCANHAR_ID){
      if(now>=CALCANHAR_END&&current.active!==false&&Number(current.hp)>0)return settleCalcanhar(c,current,false)
      // Reparo retroativo e silencioso do prêmio do campeão de 16/10.
      // Executa somente no resultado finalizado e é idempotente.
      if(current.mode==='event_completed'&&current.result?.defeated){
        const winner=(current.result.rewards||[]).find(p=>Number(p.position)===1)
        const itemId='insignia_nem_cirurgia_derrubou_lenda'
        if(winner?.jid&&!(winner.drops||[]).some(d=>d.id===itemId)){
          await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)",[winner.jid,itemId])
          winner.drops=[...(winner.drops||[]),{id:itemId,name:'Insígnia Nem a Cirurgia Derrubou a Lenda (+1% dano Boss/Raid)',rarity:'Evento Único'}]
          await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',current)
          console.log('[CALCANHAR JP] insignia do campeao reconciliada no inventario')
        }
      }
      return {due:true,already:true,active:current.active!==false&&Number(current.hp)>0,
        completed:current.mode==='event_completed',result:current.result}
    }
    if(now>=CALCANHAR_END)return {due:false,expired:true}
    // Nunca substituir o Boss de outro evento que tenha participantes.
    const activeOther=current&&current.active!==false&&Number(current.hp)>0&&(!current.endsAt||Number(current.endsAt)>now)
    const emptyFridayEclipse=activeOther&&current.eventId==='eclipse'&&current.scheduleKey==='2026-10-16'&&
      Object.keys(current.participants||{}).length===0
    if(activeOther&&!emptyFridayEclipse)return {due:true,blocked:true,blockingBoss:current.name}
    const state={mode:'event',eventId:CALCANHAR_ID,origin:'scheduled',active:true,
      scheduleKey:CALCANHAR_KEY,name:'Carrasco de Aquiles — Calcanhar do JP',
      hp:CALCANHAR_HP,maxHp:CALCANHAR_HP,baseHp:CALCANHAR_HP,atk:85,
      participants:{},startedAt:now,endsAt:CALCANHAR_END}
    await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state)
    console.log('[CALCANHAR JP] iniciado',JSON.stringify({hp:state.hp,endsAt:state.endsAt}))
    return {due:true,spawned:true,...state}
  })
}

const PECADOS_PHASES=[
  {id:'preguica',name:'💤 Preguiça',hp:60000,atk:35,cash:[20000,15000,10000]},
  {id:'gula',name:'🍖 Gula',hp:75000,atk:45,cash:[25000,18000,12000]},
  {id:'ganancia',name:'💰 Ganância',hp:90000,atk:55,cash:[30000,22000,15000]},
  {id:'inveja',name:'🐍 Inveja',hp:105000,atk:65,cash:[35000,25000,18000]},
  {id:'luxuria',name:'💋 Luxúria',hp:120000,atk:75,cash:[40000,30000,20000]},
  {id:'ira',name:'🔥 Ira',hp:140000,atk:90,cash:[50000,35000,25000]},
  {id:'soberba',name:'👑 Soberba',hp:160000,atk:110,cash:[60000,45000,30000]},
  {id:'azazel',name:'👹 Azazel, o Pecado Original',hp:200000,atk:135,cash:[150000,100000,70000],boxes:[10,6,4]}
]
const PECADOS_MIN_DAMAGE=10000
const PECADOS_RELIC='insignia_sete_pecados'
const PECADOS_TITLE='titulo_conquistador_pecados'
function pecadosPhaseState(index,ledger,startedAt,edition){
  const phase=PECADOS_PHASES[index]
  return {mode:'event',eventId:'sete_pecados',origin:'scheduled',scheduleKey:edition.key,
    active:true,phaseIndex:index,phaseCount:PECADOS_PHASES.length,name:phase.name,
    hp:phase.hp,maxHp:phase.hp,baseHp:phase.hp,atk:phase.atk,
    participants:{},ledger:ledger||{},startedAt,endsAt:edition.end}
}
export async function tickSetePecados(now=Date.now()){
  const edition=PECADOS_EDITIONS.find(e=>now>=e.start&&now<=e.end+120000)
  if(!edition)return {due:false}
  return tx(async c=>{
    const s=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(s?.scheduleKey===edition.key){
      if(s.active!==false&&now>=edition.end){
        const ended={...s,active:false,mode:'event_completed',completedAt:now,outcome:'time_limit'}
        await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',ended)
        console.log('[SETE PECADOS] ended on time',JSON.stringify({phase:s.phaseIndex,hp:s.hp}))
        return {due:true,ended:true,phaseIndex:s.phaseIndex}
      }
      return {due:true,already:true,active:s.active!==false,phaseIndex:s.phaseIndex}
    }
    if(now>=edition.end)return {due:false,missed:true}
    if(s&&s.active!==false&&Number(s.hp)>0&&(!s.endsAt||Number(s.endsAt)>now)){
      console.warn('[SETE PECADOS] existing global boss blocks spawn',s.name)
      return {due:true,blocked:true,blockingBoss:s.name}
    }
    const state=pecadosPhaseState(0,{},now,edition)
    await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state)
    console.log('[SETE PECADOS] started',JSON.stringify({phase:0,at:now,endsAt:edition.end}))
    return {due:true,spawned:true,...state}
  })
}
async function settlePecadoPhase(c,s,chat){
  const phaseIndex=Number(s.phaseIndex||0),phase=PECADOS_PHASES[phaseIndex]
  const participants=Object.entries(s.participants||{})
    .map(([jid,p])=>({jid,name:p.name||'Jogador',damage:Math.max(0,Number(p.damage||0))}))
    .filter(p=>p.damage>0).sort((a,b)=>b.damage-a.damage)
  const ledger={...(s.ledger||{})},rewards=[]
  for(let i=0;i<participants.length;i++){
    const p=participants[i]
    const eligible=p.damage>=PECADOS_MIN_DAMAGE
    const cash=eligible?Number(phase.cash[i]||0):0
    const exp=eligible?Math.round(250+Math.min(3000,p.damage/75)):0
    const drops=[]
    const old=ledger[p.jid]||{name:p.name,phases:{}}
    old.name=p.name
    old.phases={...(old.phases||{}),[phase.id]:p.damage}
    ledger[p.jid]=old
    if(eligible){
      if(cash)await credit(c,p.jid,cash,'boss_event_sete_pecados')
      if(exp)await grantExpInTransaction(c,p.jid,exp,{chatJid:chat})
    }
    if(eligible&&phaseIndex<7){
      const itemId=PECADOS_ESSENCES[phaseIndex]
      // A partir de 25/10 toda repetição acumula essência; nunca converte em dinheiro.
      await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1",[p.jid,itemId])
      drops.push({id:itemId,name:'Essência de '+phase.name,rarity:'Evento'})

    }
    if(eligible&&phaseIndex===7){
      const boxQty=Number(phase.boxes?.[i]||0)
      if(boxQty){
        await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'caixa_epica',$2) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity",[p.jid,boxQty])
        drops.push({id:'caixa_epica',name:'Caixa Épica ×'+boxQty,rarity:'Épico'})
      }
      const full=PECADOS_PHASES.every(x=>Number(old.phases[x.id]||0)>=PECADOS_MIN_DAMAGE)
      if(full){
        const oldRelic=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[p.jid,PECADOS_RELIC])).rows[0]
        if(Number(oldRelic?.quantity||0)<1){
          await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)",[p.jid,PECADOS_RELIC])
          drops.push({id:PECADOS_RELIC,name:'⚜️ Insígnia dos Sete Pecados (+2% Boss/Raid, +1pp CRIT)',rarity:'Evento Único'})
        }else{
          // A insígnia permanece única; compensação em essência em vez de dinheiro.
          await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,7) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+7",[p.jid,PECADOS_ESSENCES[0]])
          drops.push({id:'bonus_pecados_repetido',name:'🩸 Insígnia já obtida: +7 essências para o baú da collab',rarity:'Compensação'})
        }
        const oldTitle=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[p.jid,PECADOS_TITLE])).rows[0]
        if(Number(oldTitle?.quantity||0)<1){
          await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)",[p.jid,PECADOS_TITLE])
          await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'caixa_epica',3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+3",[p.jid])
          await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'caixa_lendaria',1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1",[p.jid])
          drops.push({id:PECADOS_TITLE,name:'Título Conquistador dos Pecados + 3 Caixas Épicas + 1 Caixa Lendária',rarity:'Evento Único'})
        }
      }
    }
    rewards.push({...p,position:i+1,share:p.damage/(participants.reduce((n,x)=>n+x.damage,0)||1),cash,exp,petXp:0,petXpTeam:[],drops,eligible})
  }
  const nextIndex=phaseIndex+1
  if(nextIndex>=PECADOS_PHASES.length){
    const end={...s,active:false,mode:'event_completed',hp:0,participants:{},
      ledger,completedAt:Date.now(),outcome:'defeated',
      result:{bossName:s.name,maxHp:s.maxHp,rewards}}
    await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',end)
    console.log('[SETE PECADOS] completed',JSON.stringify({phase:phaseIndex,players:rewards.length}))
    return {completed:true,rewards,phaseIndex,phaseName:phase.name}
  }
  const next=pecadosPhaseState(nextIndex,ledger,s.startedAt,{key:s.scheduleKey,end:s.endsAt})
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',next)
  console.log('[SETE PECADOS] next phase',JSON.stringify({defeated:phaseIndex,next:nextIndex,rewards:rewards.length}))
  return {completed:false,rewards,phaseIndex,phaseName:phase.name,next:{name:next.name,hp:next.hp,atk:next.atk,phaseIndex:nextIndex}}
}


// Invasão dos Titãs: três fases, HP fixo e um pagamento somente no encerramento.
async function finishTitanInvasion(c,state,defeated){
 const ledger=rollupTitanDamage(state)
 const ranked=rankTitanPlayers(ledger),rewards=[]
 for(const player of ranked){
  const {cash,exp}=titanRewards(player.rank),drops=[]
  if(cash)await credit(c,player.jid,cash,'boss_event_titas_20261017')
  if(exp)await grantExpInTransaction(c,player.jid,exp,{chatJid:GLOBAL_BOSS_EVENT_CHAT})
  if(defeated&&player.phases.length===TITAN_PHASES.length){
    await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'insignia_matador_titas',1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)",[player.jid])
    drops.push({id:'insignia_matador_titas',name:'Insígnia Matador de Titãs (+1% Boss/Raid)',rarity:'Evento Único'})
  }
  rewards.push({...player,position:player.rank||ranked.length+1,cash,exp,petXp:0,petXpTeam:[],drops,eligible:player.rank>0})
 }
 const ended={...state,active:false,mode:'event_completed',participants:{},ledger,
  completedAt:Date.now(),outcome:defeated?'defeated':'time_limit',
  result:{bossName:state.name,maxHp:state.maxHp,defeated,rewards}}
 await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',ended)
 return {ended:true,completed:defeated,rewards}
}
export async function tickTitanInvasion(now=Date.now()){
 if(now<TITAN_START)return {due:false}
 return tx(async c=>{
  const state=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
  if(state?.scheduleKey===TITAN_EVENT_KEY){
    if(now>=TITAN_END&&state.active!==false)return {due:true,...await finishTitanInvasion(c,state,false)}
    return {due:true,already:true,active:state.active!==false,phaseIndex:state.phaseIndex,result:state.result||null,completedAt:state.completedAt||null}
  }
  if(now>=TITAN_END)return {due:false,missed:true}
  if(state&&state.active!==false&&Number(state.hp)>0&&(!state.endsAt||Number(state.endsAt)>now))
    return {due:true,blocked:true,blockingBoss:state.name}
  const next=createTitanState(0,{},now)
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',next)
  return {due:true,spawned:true,...next}
 })
}
async function defeatTitanPhase(c,state){
 const index=Number(state.phaseIndex||0)
 if(index===TITAN_PHASES.length-1)return {...await finishTitanInvasion(c,state,true),next:null}
 const next=createTitanState(index+1,rollupTitanDamage(state),state.startedAt)
 await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',next)
 return {completed:false,rewards:[],next:{name:next.name,hp:next.hp,atk:next.atk,phaseIndex:next.phaseIndex}}
}

const RUPTURA_INICIO=Date.parse('2026-10-09T20:00:00-03:00')
const RUPTURA_FIM=Date.parse('2026-10-09T21:00:00-03:00')
const RUPTURA_ID='ruptura-estelar-2026-10-09'
export async function iniciarRupturaEstelar(chat,now=new Date()){
  const t=now.getTime()
  if(t<RUPTURA_INICIO||t>=RUPTURA_FIM) return {due:false}
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(current?.scheduleKey===RUPTURA_ID) return {due:true,already:current.active!==false&&Number(current.hp)>0,...current}
    if(current&&current.active!==false&&Number(current.hp)>0&&(!current.endsAt||Number(current.endsAt)>t))
      return {due:true,blocked:true,blockingBoss:current.name}
    const maxHp=480000
    const state={mode:'event',eventId:'ruptura_estelar',active:true,origin:'scheduled',scheduleKey:RUPTURA_ID,
      name:'Nharok, o Devorador de Mundos',hp:maxHp,maxHp,atk:28,phase:1,participants:{},startedAt:t,endsAt:RUPTURA_FIM}
    await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state)
    return {due:true,spawned:true,...state}
  })
}
async function premiarRupturaEstelar(c,s,chat,outcome){
  const entries=Object.entries(s.participants||{}).map(([jid,v])=>({
    jid,name:v.name||'Jogador',damage:Math.max(0,Number(v.damage||0)),
    attacks:Number(v.attacks||0),phases:Array.isArray(v.phases)?v.phases:[]
  })).filter(p=>p.damage>0).sort((a,b)=>b.damage-a.damage)
  const total=entries.reduce((n,p)=>n+p.damage,0)||1
  const rewards=[]
  for(let i=0;i<entries.length;i++){
    const p=entries[i],position=i+1,share=p.damage/total
    const pet=(await c.query('SELECT species,name,level FROM pets WHERE jid=$1',[p.jid])).rows[0]||null
    const bonus=petBossBonus(pet)
    const positionXp=[900,600,350,200,100][i]||50
    const baseExp=Math.floor((900+6000*share+positionXp)*(1+bonus.xp))
    const xp=baseExp*2
    const cash=Math.round(3000+12000*share)
    await credit(c,p.jid,cash,'boss_event_ruptura')
    await grantExpInTransaction(c,p.jid,xp,{chatJid:chat})
    const petXp=pet?Math.round((200+1200*share+(i===0?300:i===1?150:0))*1.5):0
    const petXpTeam=pet?await grantTeamPetXp(c,p.jid,petXp):[]
    const drops=[]
    const epicBoxes=position===1?20:position===2?5:position===3?3:0
    if(epicBoxes>0){
      await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'caixa_epica',$2) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity",[p.jid,epicBoxes])
      drops.push({id:'caixa_epica',name:'Caixa Épica ×'+epicBoxes,rarity:'Épico'})
    }
    const relicId='insignia_guardiao_ruptura'
    const hasRelic=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[p.jid,relicId])).rows[0]
    const relicChance=position<=3?1:(p.attacks>=10?.15:0)
    if(Number(hasRelic?.quantity||0)<1&&Math.random()<relicChance){
      await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)',[p.jid,relicId])
      drops.push({id:relicId,name:'Insígnia Guardião da Ruptura',rarity:'Evento Único'})
    }
    const phases=new Set(p.phases.map(Number))
    const missionXP=outcome==='defeated'&&p.attacks>=10&&phases.size>=2&&phases.has(3)?500:0
    if(missionXP){
      await grantExpInTransaction(c,p.jid,missionXP,{chatJid:chat})
      drops.push({id:'desafio_ruptura',name:'Missões concluídas: +500 EXP',rarity:'Especial'})
    }
    rewards.push({...p,position,share,cash,exp:xp+missionXP,petXp,petXpTeam,drops})
  }
  const marker={...s,mode:'event_completed',active:false,hp:0,participants:{},completedAt:Date.now(),
    outcome,rankings:rewards.map(p=>({position:p.position,name:p.name,damage:p.damage})),scheduleKey:RUPTURA_ID}
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',marker)
  return {rewards,marker}
}
export async function encerrarRupturaEstelar(chat,now=new Date()){
  if(now.getTime()<RUPTURA_FIM) return {due:false}
  return tx(async c=>{
    const s=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(s?.scheduleKey!==RUPTURA_ID) return {due:false}
    if(s.active===false||s.mode==='event_completed') return {due:true,alreadyEnded:true,...s}
    const result=await premiarRupturaEstelar(c,s,chat,'time_limit')
    return {due:true,ended:true,...result.marker,rewards:result.rewards}
  })
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
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state)
  return state
}

export async function autoStartSiegeBossEvent(chat,now=new Date()){
  const ts=now.getTime()
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(ts>=SIEGE_EVENT_END){
      if(current?.eventId==='cerco_colosso'&&current.active!==false&&Number(current.hp)>0){
        current.active=false;current.mode='event_stopped';current.stoppedAt=Date.now()
        await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',current)
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
      await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',current)
      return {due:true,reopened:true,...current}
    }

    if(current&&current.active!==false&&Number(current.hp)>0){
      if(current.eventId==='cerco_colosso'){
        if(Number(current.hp)>5000){
          current.hp=5000
          current.manualHpAdjustment='2026-10-04:set-to-5000'
          await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',current)
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

// Boss global de 01h: top 3 recebe valor FIXO, mesmo quando o tempo termina.
const INICIO_MADRUGADA_ID='inicio_madrugada_20261010_0100'
const INICIO_MADRUGADA_START=Date.parse('2026-10-10T01:00:00-03:00')
const INICIO_MADRUGADA_END=Date.parse('2026-10-10T01:30:00-03:00')
const INICIO_MADRUGADA_PRIZES=[1000000,500000,200000]
const INICIO_MADRUGADA_MIN_DAMAGE=1000

async function settleInicioMadrugada(c,s,defeated){
  const ranked=Object.entries(s.participants||{}).map(([jid,p])=>({
    jid,name:p.name||'Jogador',damage:Math.max(0,Number(p.damage||0))
  })).filter(p=>p.damage>=INICIO_MADRUGADA_MIN_DAMAGE).sort((a,b)=>b.damage-a.damage)
  const rewards=[]
  for(let i=0;i<ranked.length;i++){
    const p=ranked[i],cash=INICIO_MADRUGADA_PRIZES[i]||0
    // Não pagar dinheiro fora do Top 3; não conceder EXP ao personagem.
    if(cash)await credit(c,p.jid,cash,'boss_event_inicio_madrugada_20261010')
    const petXp=Math.round(220+Math.min(1600,p.damage/80))
    const petXpTeam=await grantTeamPetXp(c,p.jid,petXp)
    rewards.push({...p,position:i+1,cash,exp:0,petXp,petXpTeam,drops:[]})
  }
  const marker={...s,mode:defeated?'event_completed':'event_stopped',active:false,
    hp:defeated?0:Number(s.hp||0),completedAt:Date.now(),participants:{},
    result:{bossName:s.name,maxHp:s.maxHp,defeated,rewards}}
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',marker)
  return {due:true,ended:true,stopped:!defeated,...marker,rewards}
}

export async function autoStartInicioMadrugada(chat,now=new Date()){
  const ts=now.getTime()
  if(ts<INICIO_MADRUGADA_START)return {due:false}
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(ts>=INICIO_MADRUGADA_END){
      if(current?.eventId===INICIO_MADRUGADA_ID&&current.active!==false&&Number(current.hp)>0)
        return settleInicioMadrugada(c,current,false)
      return {due:false,ended:true}
    }
    if(current?.eventId===INICIO_MADRUGADA_ID)return {due:true,alreadyRun:true}
    if(current&&current.active!==false&&Number(current.hp)>0&&(!current.endsAt||Number(current.endsAt)>ts))
      return {due:true,blocked:true,boss:current.name}
    const maxHp=90000
    const state={mode:'event',eventId:INICIO_MADRUGADA_ID,active:true,origin:'scheduled',
      scheduleKey:INICIO_MADRUGADA_ID,name:'Vigia do Primeiro Breu',hp:maxHp,maxHp,atk:120,
      participants:{},startedAt:ts,endsAt:INICIO_MADRUGADA_END,
      minDamage:INICIO_MADRUGADA_MIN_DAMAGE}
    await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state)
    return {due:true,spawned:true,...state}
  })
}



const CAM_START=Date.parse('2026-10-10T23:15:00-03:00'),CAM_END=Date.parse('2026-10-10T23:45:00-03:00'),CAM_ID='camaleao_20261010'
async function finishCam(c,state,beaten){
 const ranking=Object.entries(state.participants||{}).map(([jid,v])=>({jid,name:v.name||'Jogador',damage:Number(v.damage||0)})).filter(x=>x.damage>0).sort((a,b)=>b.damage-a.damage)
 const eligible=ranking.filter(x=>x.damage>0),win=beaten,total=ranking.reduce((a,p)=>a+p.damage,0)||1,rewards=[]
 for(const p of ranking){
   const cash=Math.round(1000+18000*p.damage/total),exp=Math.round(150+2400*p.damage/total),drops=[]
   await credit(c,p.jid,cash,'boss_camaleao');await grantExpInTransaction(c,p.jid,exp)
   if(win&&p.jid===eligible[0].jid){
     const got=await c.query("INSERT INTO pet_collection(jid,species,name,level,xp,hunger,hygiene,energy,power,hp,max_hp,active) VALUES($1,'camaleao_lendario','🦎 Camaleão Lendário',1,0,100,100,100,145,145,145,FALSE) RETURNING id",[p.jid])
     drops.push({id:'camaleao_lendario',name:'🦎 Camaleão Lendário #'+got.rows[0].id,rarity:'Lendário'})
   }
   rewards.push({...p,position:rewards.length+1,cash,exp,petXp:0,petXpTeam:[],drops})
 }
 const end={...state,active:false,mode:'event_completed',participants:{},result:{bossName:state.name,maxHp:state.maxHp,defeated:win,rewards}}
 await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',end)
 return {ended:true,won:win,rewards}
}
export async function autoStartCamEvent(now=new Date()){
 const ts=now.getTime();if(ts<CAM_START)return {due:false}
 return tx(async c=>{
  const old=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
  if(old?.eventId===CAM_ID&&Number(old.startedAt||0)>=CAM_START){if(ts>=CAM_END&&old.active!==false)return finishCam(c,old,false);return {due:true}}
  if(ts>=CAM_END)return {due:false,expired:true}
  if(old?.eventId!==CAM_ID&&old?.active!==false&&Number(old?.hp)>0&&(!old.endsAt||Number(old.endsAt)>ts))return {due:true,blocked:true}
  const state={mode:'event',eventId:CAM_ID,scheduleKey:CAM_ID,origin:'scheduled',active:true,name:'Quimera Cromática',hp:1300000,maxHp:1300000,atk:220,participants:{},startedAt:ts,endsAt:CAM_END}
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state);return {due:true,spawned:true}
 })
}

const AURORA_START=Date.parse('2026-10-11T07:00:00-03:00')
const AURORA_END=Date.parse('2026-10-11T07:45:00-03:00')
const AURORA_KEY='guardiao-aurora-2026-10-11-0700'
const AURORA_ID='aurora_20261011'
const AURORA_MIN_DAMAGE=20000
async function settleAurora(c,s,defeated){
  const entries=Object.entries(s.participants||{}).map(([jid,p])=>({jid,name:p.name||'Jogador',damage:Number(p.damage||0)})).filter(p=>p.damage>0).sort((a,b)=>b.damage-a.damage)
  const total=entries.reduce((n,p)=>n+p.damage,0)||1
  let eligibleRank=0
  const rewards=[]
  for(const p of entries){
    const share=p.damage/total
    const cash=Math.round(2500+45000*share)
    const exp=Math.round(350+4800*share)
    await credit(c,p.jid,cash,'boss_event_aurora_20261011')
    await grantExpInTransaction(c,p.jid,exp)
    const drops=[]
    if(p.damage>=AURORA_MIN_DAMAGE && eligibleRank<3){
      eligibleRank++
      drops.push(await grantBossItem(c,p.jid,{id:'elmo_aurora',name:'Elmo da Aurora (+40 DEF / +100 HP)',rarity:'Épico'}))
    }
    rewards.push({...p,position:rewards.length+1,cash,exp,petXp:0,petXpTeam:[],drops,eligible:p.damage>=AURORA_MIN_DAMAGE})
  }
  const marker={...s,active:false,mode:'event_completed',hp:defeated?0:s.hp,completedAt:Date.now(),participants:{},result:{bossName:s.name,maxHp:s.maxHp,defeated,rewards}}
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',marker)
  return {due:true,ended:true,stopped:!defeated,rewards,result:marker.result}
}
export async function autoStartAuroraBossEvent(chat,now=new Date()){
  const ts=now.getTime()
  if(ts<AURORA_START)return {due:false}
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(current?.eventId===AURORA_ID){
      if(ts>=AURORA_END&&current.active!==false&&Number(current.hp)>0)return settleAurora(c,current,false)
      return {due:true,alreadyRun:true,completed:current.active===false}
    }
    if(ts>=AURORA_END)return {due:false,expired:true}
    if(current&&current.active!==false&&Number(current.hp)>0&&(!current.endsAt||Number(current.endsAt)>ts))
      return {due:true,blocked:true,blockingBoss:current.name}
    const state={mode:'event',eventId:AURORA_ID,active:true,origin:'scheduled',scheduleKey:AURORA_KEY,name:'Guardião da Aurora',hp:180000,maxHp:180000,atk:35,participants:{},startedAt:ts,endsAt:AURORA_END,minDamage:AURORA_MIN_DAMAGE}
    await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state)
    return {due:true,spawned:true,...state}
  })
}

const NIGHT_EVENT_START=Date.parse('2026-10-10T04:04:00-03:00')
const NIGHT_EVENT_END=Date.parse('2026-10-10T04:34:00-03:00')
const NIGHT_EVENT_KEY='madrugada-maldita-2026-10-10-0404'
const NIGHT_EVENT_ID='night_0404_20261010'
const NIGHT_EVENT_MIN_DAMAGE=25000

async function createNightBossEventState(c,chat){
  const maxHp=350000
  const state={mode:'event',eventId:NIGHT_EVENT_ID,active:true,origin:'scheduled',scheduleKey:NIGHT_EVENT_KEY,name:'Madrugada Maldita',hp:maxHp,maxHp,atk:24,participants:{},startedAt:Date.now(),endsAt:NIGHT_EVENT_END,minDamage:NIGHT_EVENT_MIN_DAMAGE}
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state)
  return state
}

// Finalização transacional: se o boss resistir, apenas moedas e XP proporcionais;
// nenhuma bota nem morcego poderá ser entregue.
async function settleUnbeatenNightBoss(c,state){
  const entries=Object.entries(state.participants||{}).map(([jid,p])=>({jid,name:p.name||'Jogador',damage:Number(p.damage||0)})).filter(x=>x.damage>0).sort((a,b)=>b.damage-a.damage)
  const total=entries.reduce((sum,p)=>sum+p.damage,0)||1
  const rewards=[]
  for(let i=0;i<entries.length;i++){
    const p=entries[i],share=p.damage/total
    const cash=Math.round(1500+35000*share)
    const exp=Math.round(150+2400*share)
    await credit(c,p.jid,cash,'boss_event_night_0404_survived')
    await grantExpInTransaction(c,p.jid,exp,{chatJid:state.originChat||null})
    const drops=[]
    if(p.damage>=NIGHT_EVENT_MIN_DAMAGE){
      drops.push(await grantBossItem(c,p.jid,{id:'bota_celestial',name:'Bota Celestial Lendária (+10 VEL)',rarity:'Lendário'},'night-0404:'+NIGHT_EVENT_KEY))
    }
    rewards.push({...p,position:i+1,cash,exp,petXp:0,petXpTeam:[],drops})
  }
  const marker={...state,active:false,mode:'event_stopped',stoppedAt:Date.now(),participants:{},
    result:{bossName:state.name,maxHp:state.maxHp,defeated:false,rewards}}
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',marker)
  return {due:false,ended:true,stopped:true,...marker}
}

export async function autoStartNightBossEvent(chat,now=new Date()){
  const ts=now.getTime()
  if(ts<NIGHT_EVENT_START)return {due:false}
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(ts>=NIGHT_EVENT_END){
      if(current?.eventId===NIGHT_EVENT_ID&&current.active!==false&&Number(current.hp)>0)
        return settleUnbeatenNightBoss(c,current)
      return {due:false,ended:true}
    }
    if(current?.scheduleKey===NIGHT_EVENT_KEY)return {due:true,alreadyRun:true}
    if(current&&current.active!==false&&Number(current.hp)>0)return {due:true,blocked:true}
    const state=await createNightBossEventState(c,chat)
    console.log('[NIGHT 04:04] boss ativado',JSON.stringify({eventId:state.eventId,maxHp:state.maxHp,endsAt:state.endsAt}))
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
  await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',state)
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
    const s=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    return s&&s.active!==false&&Number(s.hp)>0&&(!s.endsAt||Number(s.endsAt)>Date.now())?s:null
  })
}

export async function activateBossEvent(chat){
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(current&&current.active!==false&&Number(current.hp)>0) return {already:true,...current}
    return createBossEventState(c,chat,{origin:'manual'})
  })
}

export async function autoStartBossEvent(chat,now=new Date()){
  if(now.getTime()<BOSS_EVENT_AUTO_NOT_BEFORE) return {due:false,notBefore:BOSS_EVENT_AUTO_NOT_BEFORE}
  const schedule=bossEventFridayInfo(now)
  if(!schedule.due) return {due:false}
  // Sexta 16/10 reservada para o Calcanhar do JP às 19:30.
  if(schedule.fridayKey==='2026-10-16')return {due:false,reservedFor:'calcanhar_jp_20261016'}
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')

    // O evento manual que já estava ativo quando o agendamento foi criado
    // conta como o evento desta sexta, evitando um segundo spawn no mesmo dia.
    if(current&&current.active!==false&&Number(current.hp)>0){
      if(!current.scheduleKey){
        current.scheduleKey=schedule.fridayKey
        current.origin=current.origin||'manual'
        await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',current)
      }
      return {due:true,already:true,...current}
    }

    // Derrotado ou encerrado: nunca recria o Boss na mesma sexta.
    if(current?.scheduleKey===schedule.fridayKey||current?.scheduleKey===RUPTURA_ID){
      return {due:true,alreadyRun:true,...current}
    }

    const state=await createBossEventState(c,chat,{scheduleKey:schedule.fridayKey,origin:'scheduled'})
    return {due:true,spawned:true,...state}
  })
}

export async function deactivateBossEvent(chat){
  return tx(async c=>{
    const current=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(!current||current.active===false||Number(current.hp)<=0) return {active:false,already:true}
    const marker={...current,mode:'event_stopped',active:false,stoppedAt:Date.now()}
    await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',marker)
    return {active:false,stopped:true,name:current.name,hp:Number(current.hp),maxHp:Number(current.maxHp)}
  })
}

// O Boss semanal é único para todos os grupos. Migra o progresso já causado em
// Bosses de grupo durante o fim de semana sem duplicar HP nem recompensas.
const GLOBAL_WEEKLY_BOSS_CHAT='__alpha_global_weekly_boss__'
async function loadWeeklyBoss(c,weekend,{create=false}={}){
  const current=await loadGame(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss')
  if(current?.weekendKey===weekend.weekendKey) return current
  if(!create||!weekend.open) return null
  const rows=(await c.query(`
    SELECT chat_jid,state FROM trevo_games
    WHERE game_type='boss' AND chat_jid<>$1
      AND state->>'weekendKey'=$2
      AND (state->>'mode'='weekly'
           OR (state->>'mode' IS NULL AND COALESCE((state->>'maxHp')::numeric,0)>=25000))
  `,[GLOBAL_WEEKLY_BOSS_CHAT,weekend.weekendKey])).rows
  const bosses=rows.map(r=>r.state).filter(x=>Number(x.maxHp)>0)
  const maxHp=bosses.length?Math.max(...bosses.map(x=>Number(x.maxHp))):5000000+Math.floor(Math.random()*1500001)
  const participants={}
  let totalDamage=0
  for(const boss of bosses){
    totalDamage+=Math.max(0,Number(boss.maxHp)-Number(boss.hp))
    for(const [jid,p] of Object.entries(boss.participants||{})){
      const prev=participants[jid]
      participants[jid]=prev?{
        ...prev,damage:Number(prev.damage||0)+Number(p.damage||0),
        attacks:Number(prev.attacks||0)+Number(p.attacks||0),
        lastAttackAt:Math.max(Number(prev.lastAttackAt||0),Number(p.lastAttackAt||0)),
        oilChecked:Boolean(prev.oilChecked||p.oilChecked),
        oilActive:Boolean(prev.oilActive||p.oilActive)
      }:{...p}
    }
  }
  const state={
    mode:'weekly',name:'Golem Ancestral do Alpha',
    hp:Math.max(0,maxHp-totalDamage),maxHp,atk:165,participants,
    startedAt:bosses.length?Math.min(...bosses.map(x=>Number(x.startedAt||Date.now()))):Date.now(),
    weekendKey:weekend.weekendKey,weeklyCompleted:bosses.some(x=>x.weeklyCompleted),
    endsAt:weekend.endsAt,endsLabel:weekend.endsLabel
  }
  await saveGame(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss',state)
  return state
}


/**
 * Reposição única, auditável e conservadora dos ataques perdidos após reinícios.
 * 00:19 -> 02:45: Boss ficou no mesmo HP em duas capturas.
 * O total é limitado pela cadência observada de 00:01 a 00:19 e
 * repartido proporcionalmente ao dano médio por ataque dos 3 participantes.
 * Não cria dinheiro, XP, itens, poções ou ataques fictícios nos logs.
 */
export async function compensateFrozenWeeklyBoss20261009(){
  const marker='boss-auto-repair-20261009-0019-0245-v1'
  return tx(async c=>{
    const previous=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',[marker])).rows[0]?.value
    if(previous) return {status:'already',...previous}
    const state=await loadGame(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss')
    if(!state||state.mode!=='weekly'||state.weekendKey!=='2026-10-09'||Number(state.maxHp)!==5681920||Number(state.hp)<=0){
      return {status:'skipped',reason:'boss semanal de 09/10/2026 indisponível ou diferente da captura'}
    }
    const startAt=Date.parse('2026-10-09T00:19:00-03:00')
    // Inclui quem entrou até o fim do congelamento, com tempo individual reduzido.
    const eligibleBy=Date.parse('2026-10-09T02:45:00-03:00')
    const endAt=Date.parse('2026-10-09T02:45:00-03:00')
    const maxBudget=Math.floor((5681920-5611086)*(146/18))
    const candidates=[]
    for(const [jid,p] of Object.entries(state.participants||{})){
      if(Number(p.attacks||0)<=0||Number(p.damage||0)<=0) continue
      const claimKey='weekly_boss_group:2026-10-09:'+jid
      const claim=(await c.query('SELECT value,updated_at FROM trevo_settings WHERE key=$1',[claimKey])).rows[0]
      const joinedAt=Number(claim?.updated_at||0)*1000
      if(!claim?.value?.chat||joinedAt<=0||joinedAt>eligibleBy) continue
      const missedMs=endAt-Math.max(startAt,joinedAt)
      const missedAttacks=Math.max(0,Math.floor(missedMs/10000))
      if(!missedAttacks) continue
      candidates.push({jid,name:p.name||'Jogador',missedAttacks,
        averageDamage:Number(p.damage)/Number(p.attacks),
        weight:missedAttacks*Number(p.damage)/Number(p.attacks)})
    }
    // Apenas jogadores comprovadamente vinculados antes do fim da falha.
    // Limite de 3 impede premiar adesões posteriores/participação desconhecida.
    if(candidates.length<2||candidates.length>3){
      console.warn('[Boss Compensation] revisão necessária: participantes elegíveis=',candidates.length)
      return {status:'skipped',reason:'participantes comprovados fora do intervalo de segurança de 2 a 3',found:candidates.length}
    }
    const totalWeight=candidates.reduce((sum,p)=>sum+p.weight,0)
    if(!(totalWeight>0)) return {status:'skipped',reason:'sem dano médio confiável'}
    // A compensação não deve disparar uma vitória artificial sem finalizar recompensas.
    if(Number(state.hp)<=maxBudget){
      return {status:'skipped',reason:'HP atual insuficiente para reposição sem finalizar prematuramente o Boss'}
    }
    let remainder=maxBudget
    const allocations=candidates.map((p,i)=>{
      const damage=i===candidates.length-1?remainder:Math.min(remainder,Math.floor(maxBudget*p.weight/totalWeight))
      remainder-=damage
      state.participants[p.jid].damage=Number(state.participants[p.jid].damage||0)+damage
      state.participants[p.jid].recoveredDamage=Number(state.participants[p.jid].recoveredDamage||0)+damage
      return {jid:p.jid,name:p.name,damage,missedAttacks:p.missedAttacks,averageDamage:Math.round(p.averageDamage)}
    })
    const hpBefore=Number(state.hp)
    state.hp=hpBefore-maxBudget
    const record={status:'applied',bossKey:state.weekendKey,hpBefore,hpAfter:state.hp,
      amount:maxBudget,method:'00:01-00:19 HP delta / 18 min multiplied by 146 min, distributed by average attack damage and time active',
      allocations,appliedAt:Date.now()}
    await saveGame(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss',state)
    await c.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)',[marker,JSON.stringify(record)])
    console.log('[Boss Compensation] applied',JSON.stringify({amount:maxBudget,hpBefore,hpAfter:state.hp,participants:allocations.map(p=>({name:p.name,damage:p.damage}))}))
    return record
  })
}

/**
 * Auditoria corretiva 09/10: a primeira repartição considerou indevidamente
 * o timestamp de criação da trava de grupo como início real do combate.
 * A vinculação tardia não comprova ausência de ataques nas horas anteriores.
 *
 * Redistribui o MESMO dano compensado entre os três jogadores informados,
 * ponderando o dano médio real por ataque registrado (excluindo o crédito v1).
 * Não altera o HP global nem emite novos drops, XP ou dinheiro.
 */
export async function rectifyFrozenWeeklyBossShare20261009(){
  const marker='boss-auto-repair-20261009-share-v2'
  const originalMarker='boss-auto-repair-20261009-0019-0245-v1'
  const roles=[
    {jid:'5511948523167@s.whatsapp.net',label:'~LP🍀☘️'},
    {jid:'5511939089695@s.whatsapp.net',label:'Kaique Rodrigues'},
    {jid:'5511987308687@s.whatsapp.net',label:'João Pedro'}
  ]
  return tx(async c=>{
    const prior=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',[marker])).rows[0]?.value
    if(prior) return {status:'already',...prior}
    const previous=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',[originalMarker])).rows[0]?.value
    if(previous?.status!=='applied'||Number(previous.amount)!==574542){
      return {status:'skipped',reason:'crédito original não comprovado'}
    }
    const state=await loadGame(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss')
    if(!state||state.mode!=='weekly'||state.weekendKey!=='2026-10-09'||Number(state.maxHp)!==5681920||Number(state.hp)<=0){
      return {status:'skipped',reason:'Superboss original não está mais ativo; requer auditoria de recompensas'}
    }
    const credited=new Map((previous.allocations||[]).map(p=>[String(p.jid),Number(p.damage||0)]))
    if(credited.size!==2
      ||credited.get('5511939089695@s.whatsapp.net')!==169600
      ||credited.get('5511987308687@s.whatsapp.net')!==404942){
      return {status:'skipped',reason:'repartição anterior difere da auditoria'}
    }
    const candidates=[]
    for(const role of roles){
      const p=state.participants?.[role.jid]
      if(!p||Number(p.attacks||0)<=0) return {status:'skipped',reason:'participante necessário não encontrado: '+role.label}
      const old=Number(credited.get(role.jid)||0)
      const recovered=Number(p.recoveredDamage||0)
      const raw=Number(p.damage||0)-recovered
      if(recovered<old||raw<=0) return {status:'skipped',reason:'histórico de dano inconclusivo: '+role.label}
      candidates.push({...role,averageDamage:raw/Number(p.attacks),old,participant:p})
    }
    const weightTotal=candidates.reduce((sum,p)=>sum+p.averageDamage,0)
    if(!(weightTotal>0)) return {status:'skipped',reason:'média inválida'}
    const budget=574542
    let remainder=budget
    const allocations=candidates.map((p,i)=>{
      const damage=i===candidates.length-1?remainder:Math.floor(budget*p.averageDamage/weightTotal)
      remainder-=damage
      return {...p,damage,delta:damage-p.old}
    })
    if(allocations.reduce((sum,p)=>sum+p.delta,0)!==0) throw new Error('redistribuição não conservou o dano total')
    for(const item of allocations){
      const p=item.participant
      if(Number(p.damage||0)+item.delta<0||Number(p.recoveredDamage||0)+item.delta<0)
        throw new Error('repartição produziria dano negativo')
      p.damage=Number(p.damage||0)+item.delta
      p.recoveredDamage=Number(p.recoveredDamage||0)+item.delta
    }
    const hpPreserved=Number(state.hp)
    const record={
      status:'corrected',bossKey:state.weekendKey,method:'dano médio por ataque de cada participante, sem usar timestamp tardio de claim',
      budget,addedBossDamage:0,hpUnchanged:hpPreserved,correctedAt:Date.now(),
      allocations:allocations.map(p=>({jid:p.jid,name:p.participant.name||p.label,
        before:p.old,after:p.damage,delta:p.delta,averageDamage:Math.round(p.averageDamage*100)/100}))
    }
    await saveGame(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss',state)
    await c.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)',[marker,JSON.stringify(record)])
    console.log('[Boss Reallocation 09/10] confirmado',JSON.stringify({
      budget,hpUnchanged:hpPreserved,
      shares:record.allocations.map(p=>({name:p.name,before:p.before,after:p.after,delta:p.delta}))
    }))
    return record
  })
}


/**
 * Reconstituição proporcional de participantes comprovados do Boss semanal.
 * O intervalo 00:19-02:45 tem HP idêntico em duas capturas; somente jogadores
 * que haviam iniciado o Boss até 00:19 são elegíveis. O primeiro atacante tem
 * adicional documentado das 00:06 às 06:56, pois iniciou às 00:02 (captura WA)
 * e seu loop em RAM perdeu-se nos deploys. Todos os créditos anteriores são
 * abatidos; não atribui ataques artificiais nem muda economia/recompensas.
 */
export async function reconcileAllWeeklyBossOutages20261009(){
  const correctionKey='boss-auto-repair-20261009-all-participants-v4'
  return tx(async c=>{
    const done=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',[correctionKey])).rows[0]?.value
    if(done) return {status:'already',...done}
    const v1=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',
      ['boss-auto-repair-20261009-0019-0245-v1'])).rows[0]?.value
    const v2=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',
      ['boss-auto-repair-20261009-share-v2'])).rows[0]?.value
    if(v1?.status!=='applied'||Number(v1.amount)!==574542||v2?.status!=='corrected'){
      return {status:'skipped',reason:'initial compensation audit not verified'}
    }
    const boss=await loadGame(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss')
    if(boss?.mode!=='weekly'||boss.weekendKey!=='2026-10-09'||Number(boss.maxHp)!==5681920||Number(boss.hp)<=0){
      return {status:'skipped',reason:'original Boss no longer active'}
    }
    const players=Object.entries(boss.participants||{})
    const verified=[
      {name:'~LP🍀☘️',since:'2026-10-09T00:06:00-03:00',until:'2026-10-09T06:56:37-03:00',avgCap:435.79},
      {name:'João Pedro',since:'2026-10-09T00:19:00-03:00',until:'2026-10-09T02:45:00-03:00',avgCap:629.77},
      {name:'Kaique Rodrigues',since:'2026-10-09T00:19:00-03:00',until:'2026-10-09T02:45:00-03:00',avgCap:265.17}
    ]
    const creditedV2=new Map((v2.allocations||[]).map(x=>[String(x.jid),Number(x.after||0)]))
    if(creditedV2.size!==3) return {status:'skipped',reason:'unexpected previous participant count'}
    const existingSum=players.reduce((v,[,p])=>v+Number(p.damage||0),0)
    if(existingSum!==Number(boss.maxHp)-Number(boss.hp)){
      return {status:'skipped',reason:'participant damage does not reconcile with global Boss HP'}
    }
    const allocations=[]
    for(const rule of verified){
      const found=players.filter(([,p])=>String(p.name||'')===rule.name)
      if(found.length!==1) return {status:'skipped',reason:'cannot uniquely match participant '+rule.name}
      const [jid,p]=found[0]
      const oldCredit=Number(p.recoveredDamage||0)
      if(creditedV2.get(jid)!==oldCredit||Number(p.attacks||0)<=0){
        return {status:'skipped',reason:'inconsistent previous credit for '+rule.name}
      }
      const avg=Math.min(rule.avgCap,
        (Number(p.damage||0)-oldCredit)/Number(p.attacks))
      const ticks=Math.floor((Date.parse(rule.until)-Date.parse(rule.since))/10000)
      if(!Number.isFinite(avg)||avg<=0||ticks<=0) return {status:'skipped',reason:'invalid rate for '+rule.name}
      const expectedTotal=Math.floor(ticks*avg)
      const additional=Math.max(0,expectedTotal-oldCredit)
      allocations.push({jid,name:rule.name,average:Math.round(avg*100)/100,
        expectedTicks:ticks,oldCredit,expectedTotal,additional})
    }
    // Os outros jogadores continuam com seus danos reais: sem bônus indevido
    // por períodos anteriores ao início efetivo da participação.
    const additionalTotal=allocations.reduce((n,p)=>n+p.additional,0)
    if(additionalTotal<=0){
      return {status:'skipped',reason:'no additional missing damage'}
    }
    if(Number(boss.hp)<=additionalTotal+100000){
      return {status:'skipped',reason:'Boss too low to safely apply estimate without resolving rewards'}
    }
    for(const item of allocations){
      const p=boss.participants[item.jid]
      p.damage=Number(p.damage||0)+item.additional
      p.recoveredDamage=Number(p.recoveredDamage||0)+item.additional
      p.repair20261009=item.additional
    }
    const hpBefore=Number(boss.hp)
    boss.hp=hpBefore-additionalTotal
    if(players.reduce((n,[,p])=>n+Number(p.damage||0),0)!==Number(boss.maxHp)-Number(boss.hp)){
      throw new Error('Boss damage accounting mismatch after reconciliation')
    }
    const record={status:'applied',weekendKey:boss.weekendKey,method:'observed damage per real attack, capped by 08:06 audit, 10-second cadence and verified gaps; prior credits deducted',
      hpBefore,hpAfter:boss.hp,additionalTotal,allocations,
      unaffected:players.filter(([jid])=>!allocations.some(p=>p.jid===jid))
        .map(([,p])=>({name:p.name,reason:'no verified outage within participation period'})),
      appliedAt:Date.now()}
    await saveGame(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss',boss)
    await c.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)',
      [correctionKey,JSON.stringify(record)])
    console.log('[Boss All Player Repair] confirmed',JSON.stringify({
      hpBefore,hpAfter:boss.hp,additionalTotal,
      allocations:allocations.map(p=>({name:p.name,additional:p.additional,totalOutageCredit:p.oldCredit+p.additional}))
    }))
    return record
  })
}

export async function startBoss(chat){
  const weekend=bossWeekendInfo()
  return tx(async c=>{
    const event=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    if(event&&event.active!==false&&Number(event.hp)>0&&(!event.endsAt||Number(event.endsAt)>Date.now())) return {already:true,...event}
    if(weekend.open){
      const weekly=await loadWeeklyBoss(c,weekend,{create:true})
      if(weekly) return {already:true,...weekly,endsLabel:weekend.endsLabel}
    }
    const current=await loadGame(c,chat,'boss')
    if(current?.mode==='common'&&Number(current.hp)>0) return {already:true,...current}
    const lastCommonEndedAt=Number(current?.lastCommonEndedAt||0)
    if(lastCommonEndedAt&&Date.now()-lastCommonEndedAt<60*60*1000){
      return {cooldown:true,mode:'common',remainingMinutes:Math.ceil((60*60*1000-(Date.now()-lastCommonEndedAt))/60000)}
    }
    const maxHp=9000+Math.floor(Math.random()*3001)
    const state={mode:'common',name:'Golem do Alpha',hp:maxHp,maxHp,atk:11,participants:{},startedAt:Date.now(),lastCommonEndedAt}
    await saveGame(c,chat,'boss',state)
    return state
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
export async function attackBoss(chat,jid,name,usePet=true,options={}){
  // O runner já garantiu users/wallets/stats na primeira chamada desta sessão.
  // Chamadas diretas e sessões retomadas mantêm o cadastro inicial obrigatório.
  if(!options.skipEnsureUser) await ensureUser(jid,name||'')
  const weekend=bossWeekendInfo()
  return tx(async c=>{
    const now=Math.floor(Date.now()/1000)
    // Uma consulta para os dois impedimentos, preservando a prioridade do sono.
    const blocked=await c.query(`
      SELECT EXISTS(SELECT 1 FROM player_sleep WHERE jid=$1 AND ends_at>$2) AS sleeping,
             EXISTS(SELECT 1 FROM player_carpinar WHERE jid=$1 AND ends_at>$2) AS carpindo
    `,[jid,now])
    if(blocked.rows[0]?.sleeping) throw new Error('Você está dormindo e não pode atacar o Boss agora.')
    if(blocked.rows[0]?.carpindo) throw new Error('Você está carpindo e não pode atacar o Boss agora.')
    // Uma única participação por jogador no Boss semanal, mesmo em grupos diferentes.
    // Trava por jogador antes de carregar a sala para serializar ataques simultâneos.
    if(weekend.open){
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`weekly-boss-player:${weekend.weekendKey}:${jid}`])
    }
    const event=await loadGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event')
    const eventActive=Boolean(event&&event.active!==false&&Number(event.hp)>0&&(!event.endsAt||Number(event.endsAt)>Date.now()))
    const weeklyActive=!eventActive&&weekend.open
    const gameType=eventActive?'boss_event':'boss'
    const bossChat=weeklyActive?GLOBAL_WEEKLY_BOSS_CHAT:chat
    const s=eventActive?event:(weeklyActive?await loadWeeklyBoss(c,weekend,{create:true}):await loadGame(c,chat,'boss'))
    if(!s||Number(s.hp)<=0) throw new Error('Não há Boss ativo. Use !boss para iniciar um.')
    if(gameType==='boss'&&!s.mode&&Number(s.maxHp)>=25000&&s.weekendKey===weekend.weekendKey){
      s.mode='weekly'; s.weeklyCompleted=false
    }
    if(gameType==='boss'&&s.mode==='weekly'&&(!weekend.open||s.weekendKey!==weekend.weekendKey||Number(s.endsAt||0)<=Date.now())) throw new Error('O Superboss semanal encerrou. Use !boss para iniciar um Boss comum.')
    // A checagem atômica de grupo abaixo também protege o Superboss semanal;
    // não ler o mesmo vínculo duas vezes antes da validação.
    if((gameType==='boss'&&s.mode==='weekly')||gameType==='boss_event'){
      const globalBossId=gameType==='boss_event'
        ?String(s.scheduleKey||s.eventId||s.startedAt||s.endsAt||'event')
        :weekend.weekendKey
      const claimKey=gameType==='boss_event'?'global_boss_event_group:'+globalBossId+':'+jid:'weekly_boss_group:'+weekend.weekendKey+':'+jid
      await c.query("INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING",
        [claimKey,JSON.stringify({chat,globalBossId})])
      const claim=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',[claimKey])).rows[0]?.value
      if(claim?.chat!==chat){
        throw new Error('⚠️ Você já está participando deste Boss em outro grupo. Continue no grupo original; ataques em grupos diferentes não são autorizados.')
      }
    }
    const st=(await c.query('SELECT hp,max_hp,atk,def,weapon_id,armor_id,helmet_id,class_id,class_applied FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(st?.hp||0)<=0) return {playerDead:true,hp:Number(s.hp),maxHp:Number(s.maxHp)}
    s.participants=s.participants||{}
    // HP escala quando um NOVO participante causa seu primeiro ataque, inclusive após !go.
    if((s.eventId==='sete_pecados'||s.eventId===CALCANHAR_ID)&&!s.participants[jid]){
      const oldCount=Object.keys(s.participants).length
      if(oldCount>=1){
        const hpIncrease=Math.round(Number(s.baseHp||s.maxHp)*(s.eventId===CALCANHAR_ID?.12:.35))
        s.maxHp+=hpIncrease
        s.hp+=hpIncrease
      }
    }
    const existingParticipant=s.participants[jid]||{}
    const bossCadenceMs=gameType==='boss_event'?8000:10000
    const bossLastAttackAt=Number(existingParticipant.lastAttackAt||0)
    const bossNow=Date.now()
    if(bossLastAttackAt && bossNow-bossLastAttackAt<bossCadenceMs-250){
      return {cooldown:true,remainingMs:Math.max(250,bossCadenceMs-(bossNow-bossLastAttackAt)),mode:s.mode||'common',hp:Number(s.hp||0),maxHp:Number(s.maxHp||0)}
    }
    // O óleo só é consumido no primeiro ataque válido de cada Boss por jogador.
    // Não acumula, não multiplica dano do pet e dura somente até este Boss terminar.
    let oilConsumedNow=false
    if(!existingParticipant.oilChecked){
      const oil=(await c.query(`
        SELECT quantity FROM inventories
        WHERE jid=$1 AND item_id='oleo_sombras' AND quantity>0 FOR UPDATE
      `,[jid])).rows[0]
      existingParticipant.oilChecked=true
      if(oil){
        await c.query("UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id='oleo_sombras'",[jid])
        existingParticipant.oilActive=true
        oilConsumedNow=true
      }
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
    // Recarrega o pet automaticamente e consome um energético na mesma transação.
    let autoPetEnergy=null
    if(usePet&&petRow&&Number(petRow.hp)>0&&Number(petRow.energy)<2){
      const inv=(await c.query(`SELECT quantity FROM inventories WHERE jid=$1
        AND item_id='energetico_pet' AND quantity>0 FOR UPDATE`,[jid])).rows[0]
      if(inv){
        const maxEnergy=petMaxEnergy(petRow.level,petRow.species)
        const before=Number(petRow.energy||0)
        await c.query(`UPDATE inventories SET quantity=quantity-1 WHERE jid=$1
          AND item_id='energetico_pet' AND quantity>0`,[jid])
        petRow.energy=maxEnergy
        autoPetEnergy={petName:petRow.name,before,energy:maxEnergy,max:maxEnergy,remaining:Number(inv.quantity)-1}
        await persistBossCombatPet(c,jid,petRow)
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
    // Lê composição do time, melhorias e despertar no mesmo round-trip.
    // Sem cache: qualquer troca de equipamento, pet ou evolução é observada
    // no próximo golpe, inclusive após reconexão/redeploy.
    const combatSnapshot=(await c.query(`
      SELECT
        COALESCE((SELECT stage FROM player_awakenings WHERE jid=$1),0) AS awakening_stage,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'slot',t.slot,'species',p.species,'level',p.level,'hp',p.hp,'energy',p.energy
        ) ORDER BY t.slot)
          FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id
          WHERE t.jid=$1),'[]'::jsonb) AS team_pets,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id',u.item_id,'level',u.level))
          FROM equipment_upgrades u
          WHERE u.jid=$1 AND u.item_id=ANY($2::text[])),'[]'::jsonb) AS upgrade_rows
    `,[jid,[st.weapon_id,st.armor_id,st.helmet_id].filter(Boolean)])).rows[0]
    const awakeningStage=Number(combatSnapshot?.awakening_stage||0)
    const teamPets=combatSnapshot?.team_pets||[]
    const petBonus=pet?squadCombatBonus(petBossBonus(pet),activePetSlot,teamPets):petBossBonus(null)
    const teamSynergy=petTeamSynergy(teamPets)||{attack:0,defense:0,crit:0}
    const upgradeRows=combatSnapshot?.upgrade_rows||[]
    const enchanted=await getEquippedEnchants(c,jid,[st.weapon_id,st.armor_id,st.boot_id,st.helmet_id])
    const itemLevel=itemId=>Number(upgradeRows.find(r=>r.item_id===itemId)?.level||1)
    const weapon=st.weapon_id?equipmentStatsAtLevel(st.weapon_id,itemLevel(st.weapon_id)):{atk:0,def:0,hp:0,crit:0}
    const armor=st.armor_id?equipmentStatsAtLevel(st.armor_id,itemLevel(st.armor_id)):{atk:0,def:0,hp:0,crit:0}
    const helmet=st.helmet_id?equipmentStatsAtLevel(st.helmet_id,itemLevel(st.helmet_id)):{atk:0,def:0,hp:0,crit:0}
    const atk=Math.round((Number(st.atk)+Number(weapon?.atk||0)+Number(armor?.atk||0)+enchanted.atk)*(1+Number(enchanted.attackPct||0)))
    const def=Number(st.def)+Number(weapon?.def||0)+Number(armor?.def||0)+Number(helmet?.def||0)+enchanted.def
    const gearHp=Number(weapon?.hp||0)+Number(armor?.hp||0)+Number(helmet?.hp||0)
    const effectiveMaxHp=Number(st.max_hp)+gearHp
    const petCritChance=Math.max(0,Number(petBonus.crit||0)+Number(teamSynergy.crit||0))
    const gearCritChance=Math.max(0,Number(weapon?.crit||0)+Number(armor?.crit||0))
    const baseCritChance=.10
    const roll=Math.random()
    const equippedRelic=await activeRelic(c,jid)
    const totalCritChance=Math.min(.45,baseCritChance+gearCritChance+petCritChance+enchanted.crit+classCritBonus(st.class_id,st.class_applied,awakeningStage,'boss')+Number(equippedRelic?.bossCrit||0))
    const crit=roll<totalCritChance
    const petCrit=crit&&roll>=Math.min(totalCritChance,baseCritChance+gearCritChance)
    const gearCrit=crit&&!petCrit
    const petMultiplier=1+petBonus.damage+Number(teamSynergy.attack||0)
    const variance=.85+Math.random()*.45
    const rawBase=Math.max(5,Math.floor(atk*variance))
    const baselineWithGearCrit=Math.max(5,Math.floor(rawBase*(gearCrit?1.5:1)))
    const oilBonus=existingParticipant.oilActive?Math.max(1,Math.floor(baselineWithGearCrit*.06)):0
    const baseDamage=Math.max(5,Math.floor(rawBase*petMultiplier*(crit?1.5:1))+oilBonus)
    const passiveHit=classAttack({classId:st.class_id,applied:st.class_applied,damage:baseDamage,critical:crit,hp:st.hp,maxHp:effectiveMaxHp,attackIndex:Number(existingParticipant.attacks||0)+1,context:'boss',lastProcAttack:Number(existingParticipant.classLastProcAttack||0),awakeningStage,awakeningState:existingParticipant.awakeningState})
    const ruptura=gameType==='boss_event'&&s.eventId==='ruptura_estelar'
    const faseAnterior=ruptura?Math.max(1,Number(s.phase||1)):1
    const eclipseRelic=equippedRelic
    const relicDamage=eclipseRelic?.boss?Math.max(1,Math.round(passiveHit.damage*eclipseRelic.boss)):0
    let damage=(ruptura&&faseAnterior===3?Math.floor(passiveHit.damage*1.10):passiveHit.damage)+relicDamage+Math.round(rawBase*(crit?1.5:1)*Number(enchanted.damage||0))
    if(s.eventId==='sete_pecados'||s.eventId===TITAN_EVENT_ID){
      damage=Math.min(Math.max(0,damage),Math.max(0,Number(s.hp||0)))
    }

    const petDamage=pet?Math.max(0,baseDamage-baselineWithGearCrit-oilBonus):0
    s.hp=Math.max(0,Number(s.hp)-damage)
    const nextPhase=ruptura?(s.hp<=s.maxHp/3?3:(s.hp<=s.maxHp*2/3?2:1)):faseAnterior
    const phaseChanged=ruptura&&nextPhase>faseAnterior?nextPhase:0
    if(ruptura) s.phase=nextPhase
    const old=existingParticipant
    const attackCount=Number(old.attacks||0)+1
    s.participants[jid]={
      ...old,
      damage:Number(old.damage||0)+damage,
      name:old.name||name||'Jogador',
      attacks:attackCount,
      phases:ruptura?[...new Set([...(Array.isArray(old.phases)?old.phases:[]),faseAnterior])]:old.phases,
      petHealing:Number(old.petHealing||0),
      activePetSlot,
      lastAttackAt:bossNow,
      usePet:Boolean(usePet),
      classLastProcAttack:passiveHit.lastProcAttack,
      awakeningState:passiveHit.awakeningState
    }
    let php=Math.min(Number(st.hp)+passiveHit.heal,effectiveMaxHp),bossDamage=0,bossCritical=false,autoHeal=null,autoPetHeal=null,petSkillHeal=null
    if(s.hp>0){
      const dodged=petBonus.dodge>0&&Math.random()<petBonus.dodge
      bossCritical=!dodged&&Math.random()<.05
      const bossRawDamage=dodged?0:Math.max(1,Math.round((Number(s.atk||18)*(ruptura?(faseAnterior===2?1.15:faseAnterior===3?1.20:1):1)-def*.22)*(.8+Math.random()*.4)*(1-petBonus.defense)*(1-Number(teamSynergy.defense||0))*(bossCritical?1.5:1)))
      const defResult=classDefense({classId:st.class_id,applied:st.class_applied,damage:bossRawDamage,context:'boss',hp:php,maxHp:effectiveMaxHp,awakeningStage,awakeningState:s.participants[jid].awakeningState})
      bossDamage=defResult.damage
      s.participants[jid].awakeningState=defResult.awakeningState
      php=Math.max(0,php-bossDamage+Number(defResult.healAfter||0))
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
          const petPotionIds=['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema','pocao_pet_full']
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
            const petPotionIds=['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema','pocao_pet_full']
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
    await recordPlayerDamage(c,jid,'boss',damage,crit)
    if(s.hp<=0&&s.eventId===TITAN_EVENT_ID){
      const result=await defeatTitanPhase(c,s)
      return {dead:true,mode:s.mode,eventId:s.eventId,damage,bossDamage,bossCritical,
        playerHp:php,hp:0,maxHp:s.maxHp,players:result.rewards.length,rewards:result.rewards,
        nextPhase:result.next||null,finalCompleted:result.completed,
        autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,
        petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),
        petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
    }
    if(s.hp<=0&&s.eventId===CALCANHAR_ID){
      const result=await settleCalcanhar(c,s,true)
      return {dead:true,mode:s.mode,damage,bossDamage,bossCritical,
        playerHp:php,hp:0,maxHp:s.maxHp,players:result.rewards.length,rewards:result.rewards,
        autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,
        petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),
        petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
    }
    if(s.hp<=0&&s.eventId==='sete_pecados'){
      const outcome=await settlePecadoPhase(c,s,chat)
      return {dead:true,mode:s.mode,eventId:s.eventId,damage,bossDamage,bossCritical,
        playerHp:php,hp:0,maxHp:s.maxHp,players:outcome.rewards.length,rewards:outcome.rewards,
        nextPhase:outcome.next||null,phaseIndex:outcome.phaseIndex,finalCompleted:outcome.completed,
        autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,
        petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),
        petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
    }
    if(s.hp<=0&&s.eventId===INICIO_MADRUGADA_ID){
      const result=await settleInicioMadrugada(c,s,true)
      return {dead:true,mode:s.mode,damage,bossDamage,bossCritical,phaseChanged,
        playerHp:php,hp:0,maxHp:s.maxHp,players:result.rewards.length,rewards:result.rewards,
        autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,
        petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),
        petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
    }
    if(s.hp<=0&&s.eventId===CAM_ID){
      const result=await finishCam(c,s,true)
      return {dead:true,mode:s.mode,damage,bossDamage,bossCritical,phaseChanged,playerHp:php,hp:0,maxHp:s.maxHp,players:result.rewards.length,rewards:result.rewards,autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
    }
    if(s.hp<=0&&s.eventId===AURORA_ID){
      const result=await settleAurora(c,s,true)
      return {dead:true,mode:s.mode,damage,bossDamage,bossCritical,phaseChanged,
        playerHp:php,hp:0,maxHp:s.maxHp,players:result.rewards.length,rewards:result.rewards,
        autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,
        petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),
        petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
    }
    if(s.hp<=0&&ruptura){
      const result=await premiarRupturaEstelar(c,s,chat,'defeated')
      return {dead:true,mode:s.mode,damage,bossDamage,bossCritical,phase:nextPhase,phaseChanged,
        playerHp:php,hp:0,maxHp:s.maxHp,players:result.rewards.length,rewards:result.rewards,
        autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,
        petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),
        petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
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
          const night0404=s.eventId===NIGHT_EVENT_ID
          const siege=s.eventId==='cerco_colosso'
          const positionXp=[900,600,350,200,100][i]||50
          const localMult=night?2:1
          cash=night0404?Math.round(2500+60000*share):siege?Math.round(3000+25000*share):Math.round((5000+Math.floor(80000*share))*moneyMultiplier*localMult)
          exp=night0404?Math.round((450+4500*share)*(1+pb.xp)):siege?Math.round(Math.floor((700+3500*share+positionXp)*(1+pb.xp))):Math.round(Math.floor((900+6000*share+positionXp)*(1+pb.xp))*xpMultiplier*localMult)
          await credit(c,p.jid,cash,siege?'boss_event_cerco':(night?'boss_event_night_0303':night0404?'boss_event_night_0404':'boss_event_eclipse'))
          await grantExpInTransaction(c,p.jid,exp,{chatJid:chat})
          if(pp){
            petXp=night0404?Math.round(100+500*share):siege?Math.round(180+700*share+(i===0?180:i===1?90:0)):Math.round(Math.floor(200+1200*share+(i===0?300:i===1?150:0))*xpMultiplier*localMult)
            petXpTeam=await grantTeamPetXp(c,p.jid,petXp)
          }
          if(night0404){
            // Derrota do Boss é condição obrigatória; esta seção roda apenas em HP zero.
            // Qualquer participante com 25 mil ou mais recebe 1 bota, independentemente do ranking.
            if(p.damage>=NIGHT_EVENT_MIN_DAMAGE){
              drops.push(await grantBossItem(c,p.jid,{id:'bota_celestial',name:'Bota Celestial Lendária (+10 VEL)',rarity:'Lendário'}))
              if(i===0){
                const bat=await c.query(`INSERT INTO pet_collection
                  (jid,species,name,level,xp,hunger,hygiene,energy,power,hp,max_hp,active)
                  VALUES($1,'morcego_madrugada','🦇 Morcego da Madrugada',1,0,100,100,100,160,160,160,FALSE)
                  RETURNING id`,[p.jid])
                drops.push({id:'morcego_madrugada',name:'🦇 Morcego da Madrugada — Coringa (+6% CRIT / +5% esquiva) (Pet #'+bat.rows[0].id+')',rarity:'Evento Único'})
              }
            }
          }else if(siege){
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
          await grantExpInTransaction(c,p.jid,exp,{chatJid:chat})
          if(pp){
            petXp=weekly
              ? Math.round(80+260*share+(i===0?80:i===1?40:0))
              : Math.max(5,Math.round(12+35*share))
            petXpTeam=await grantTeamPetXp(c,p.jid,petXp)
          }
          drops=weekly?await giveBossDrops(c,p.jid,position,pb.drop,'weekly-boss:'+String(s.weekendKey||'unknown')):(Math.random()<.03+Math.min(.02,pb.drop)?[await grantBossItem(c,p.jid,{id:'caixa_sorte',name:'Caixa da Sorte',rarity:'Comum'})]:[])
        }
        // Uma insígnia por participante com dano: campeão recebe versão superior.
        // Não distribuir novamente o Elmo do Soberano Ancestral.
        if(weekly&&Number(p.damage||0)>0){
          const insignia=position===1
            ?{id:'insignia_tita_ancestral',name:'Insígnia do Titã Ancestral (+3% dano / +1pp CRIT Boss e Raid)',rarity:'Lendário Exclusivo'}
            :{id:'insignia_eco_ancestral',name:'Insígnia do Eco Ancestral (+1% dano Boss e Raid)',rarity:'Evento Único'}
          drops.push(await grantBossItem(c,p.jid,insignia,'weekly-boss:'+String(s.weekendKey||'unknown')))
        }
        // Reclassificação é recompensa de endgame: só entra no sorteio a partir do Nv.100.
        // Boss comum e Boss de evento: 1%. Superboss semanal: 3%.
        const reclassDrop=s.eventId===NIGHT_EVENT_ID?null:await maybeGrantReclassScroll(c,p.jid,weekly?'weekly':(eventMode?'event':'common'))
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
          // Snapshot transacional. Reenviar o resultado nunca redistribui premios.
          result:{bossName:s.name,maxHp:Number(s.maxHp||0),
            rewards:rewards.map(p=>({jid:p.jid,name:p.name,position:p.position,
              damage:p.damage,cash:p.cash,exp:p.exp,petXp:p.petXp,
              petXpTeam:p.petXpTeam,drops:p.drops}))},
          scheduleKey:s.scheduleKey||(schedule.due?schedule.fridayKey:null),
          completedAt:Date.now()
        }
        await saveGame(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',marker)
      }else{
        const marker={mode:'completed',name:s.name,hp:0,maxHp:s.maxHp,participants:{},weekendKey:s.weekendKey,weeklyCompleted:s.mode==='weekly'||Boolean(s.weeklyCompleted),endsAt:s.endsAt||0,lastCommonEndedAt:s.mode==='common'?Date.now():Number(s.lastCommonEndedAt||0)}
        await saveGame(c,s.mode==='weekly'?GLOBAL_WEEKLY_BOSS_CHAT:chat,'boss',marker)
      }
      return {dead:true,mode:s.mode,damage,bossDamage,bossCritical,oilConsumedNow,oilActive:Boolean(existingParticipant.oilActive),playerHp:php,hp:0,maxHp:s.maxHp,players:entries.length,rewards,autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal)}
    }
    await saveBossAttackProgress(c,eventActive?GLOBAL_BOSS_EVENT_CHAT:bossChat,gameType,s,jid)
    return {dead:false,mode:s.mode||'common',endsAt:Number(s.endsAt||0),phase:s.phase||0,phaseChanged,damage,bossDamage,bossCritical,oilConsumedNow,oilActive:Boolean(existingParticipant.oilActive),playerHp:php,playerMaxHp:effectiveMaxHp,playerDead:php<=0,hp:s.hp,maxHp:s.maxHp,autoHeal,autoPetHeal,petSkillHeal,petSwitch,autoPetEnergy,petUnavailable,petUnavailableReason:petNoHp?'hp':(petNoEnergy?'energy':null),petFainted:Boolean(pet?.petFainted&&!petSwitch&&!autoPetHeal),pet:pet?{name:pet.name,species:pet.species,bonus:petBonus.label,damage:petDamage,crit,energy:pet.energy,hp:Number(pet.hp),maxHp:Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species)),damageTaken:Number(pet.petDamageTaken||0),fainted:Boolean(pet.petFainted)}:null}
  })
}
