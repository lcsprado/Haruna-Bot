import 'dotenv/config'
import crypto from 'node:crypto'
import {
  db, ensureUser, getProfile, getShop, getInventory, getDailyStreak, getCareer,
  listPets, getPetTeam, getPetExpeditions, getAchievements, getRelationship, getProfileAvatar,
  listMyMarketListings, getGroupLicense, LEGENDARY_PET_SUMMONS, PET_HP_PROFILES,
  petStyleLabel, getEquipmentInfo, getDoubleRewardEvent, getLuckyBoxEvent,
  claimDaily, work, deposit, withdraw, buyItem, sellItem, equipItem, upgradeEquipment,
  usePotion, usePetPotion, usePetEnergyItem, adoptPet, selectPet, renamePet, petAction,
  setPetTeam, summonLegendaryPet, getCombatProfile, setPlayerClass, getGroupSettings, resolvePlayerSleep, petTeamSynergy,
  transfer, battle, petDuel, dungeon, robPlayer,
  createMarketListing, listMarket, buyMarketListing, cancelMarketListing,
  openLootBoxes, openLuckyBoxes, sellDuplicateEquipment,
  startPlayerSleep, wakePlayerEarly, getCarpinarPlans, startPlayerCarpinar, leavePlayerCarpinarEarly,
  petAdventure, startPetExpedition, resolvePetExpeditions,
  claimLevelRewards, getLevelRewardPreview, leaderboard, combatLeaderboard, petLeaderboard,
  weeklyActivityLeaderboard, getPlayerRanks,
  proposeRelationship, acceptRelationship, divorceRelationship
} from './db.js'
import {
  getRaidCatalog, getRaidStatuses, createRaid, joinRaid, cancelRaid, startRaid, raidRound,
  startBoss, attackBoss,
  coinFlip, roulette, rps, startQuiz, answerQuiz, startNumberGame, guessNumber,
  startHangman, hangmanLetter, hangmanWord, createCoinDuel, acceptCoinDuel,
  createRpsDuel, acceptRpsDuel, createGroupRoulette, joinGroupRoulette, spinGroupRoulette,
  createTournament, joinTournament, startTournament
} from './games.js'
import {
  HOUSES, CARS, MOTORCYCLES, BUSINESSES, CLT_UBER_TYPES,
  getDailyMissions, getHome, getGarage, getMotorcycleGarage,
  getBusinesses, getPatrimony, getCltUberStatus,
  progressDailyMission, progressGroupMission,
  buyHouse, buyCar, sellCar, driveUber, buyMotorcycle, sellMotorcycle, deliverIfood,
  buyBusiness, collectBusinesses, upgradeBusiness, startCltUberShift, collectCltUber,
  claimDailyMissions, createClan, listClans, getClanForUser, inviteToClan, acceptClanInvite,
  leaveClan, donateClan, kickClanMember, transferClanLeadership,
  getGroupMission, claimGroupMission, getGroupMissionLeaderboard, claimGroupEvent,
  patrimonyLeaderboard, hireCltUberDriver
} from './progression.js'
import { getLoanOverview, LOAN_RULES, acceptLoan, rejectLoan, payLoan, createLoanOffer, getLoanCredit } from './loans.js'
import { ADOPTABLE_PETS, PET_STATUS_SPECIALTIES, PLAYER_CLASSES } from './game-catalog.js'

const CODE_TTL_MS = 30 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
let webTablesReady = false
let webTablesPromise = null

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex')
const now = () => Date.now()

function memberRef(scope,jid){
  const secret=String(process.env.WEB_MEMBER_TOKEN_SECRET||process.env.DATABASE_URL||'alpha-web-dev-only')
  return 'mref_'+crypto.createHmac('sha256',secret).update(String(scope||'global')+'\0'+String(jid||'')).digest('base64url').slice(0,22)
}
function isPrivateJid(value){
  const s=String(value||'')
  return s.endsWith('@s.whatsapp.net') || s.endsWith('@lid')
}
function sanitizePrivateRefs(value,session,scope=null){
  const refScope=scope||session?.chatJid||'global'
  if(Array.isArray(value)) return value.map(v=>sanitizePrivateRefs(v,session,refScope))
  if(value && typeof value==='object'){
    const out={}
    for(const [rawKey,rawValue] of Object.entries(value)){
      let key=rawKey
      if(isPrivateJid(rawKey)) key=rawKey===session?.jid?rawKey:memberRef(refScope,rawKey)
      else {
        const m=rawKey.match(/^(coin_duel|rps_duel):(.+)$/)
        if(m && isPrivateJid(m[2]) && m[2]!==session?.jid) key=m[1]+':'+memberRef(refScope,m[2])
      }
      out[key]=sanitizePrivateRefs(rawValue,session,refScope)
    }
    return out
  }
  if(isPrivateJid(value) && String(value)!==String(session?.jid||'')) return memberRef(refScope,value)
  return value
}

async function ensureWebTables(){
  if(webTablesReady) return
  if(webTablesPromise) return webTablesPromise
  webTablesPromise=(async()=>{
    await db.query(`
      CREATE TABLE IF NOT EXISTS web_link_codes(
        code_hash TEXT PRIMARY KEY,
        jid TEXT NOT NULL,
        chat_jid TEXT,
        expires_at BIGINT NOT NULL,
        used_at BIGINT,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
      );

      CREATE INDEX IF NOT EXISTS web_link_codes_jid_idx
        ON web_link_codes(jid,expires_at DESC);

      CREATE TABLE IF NOT EXISTS web_sessions(
        token_hash TEXT PRIMARY KEY,
        jid TEXT NOT NULL,
        chat_jid TEXT,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS web_sessions_jid_idx
        ON web_sessions(jid,expires_at DESC);
    `)
    webTablesReady=true
  })().finally(()=>{ webTablesPromise=null })
  return webTablesPromise
}

function cleanChatJid(chatJid){
  const value=String(chatJid||'').trim()
  return value.endsWith('@g.us') ? value : null
}

function makeLinkCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes=crypto.randomBytes(8)
  let code=''
  for(let i=0;i<8;i++) code+=alphabet[bytes[i]%alphabet.length]
  return code
}

export async function createWebLinkCode(jid,chatJid=null){
  if(!jid) throw new Error('Jogador inválido.')
  await ensureUser(jid)
  await ensureWebTables()
  const group=cleanChatJid(chatJid)
  // Se !web foi gerado dentro de um grupo, promova imediatamente TODAS as sessões
  // Web válidas do jogador para esse grupo. Assim uma sessão antiga criada no privado
  // deixa de bloquear Boss/Raid mesmo antes de o usuário reabrir o link.
  if(group){
    const t=now()
    await db.query(
      'UPDATE web_sessions SET chat_jid=$1,last_seen_at=$2 WHERE jid=$3 AND expires_at>$2',
      [group,t,jid]
    ).catch(()=>{})
  }
  // Mantém até 3 códigos recentes por jogador para não invalidar o link anterior
  // quando !web é enviado novamente no grupo. Todos continuam sendo uso único.
  await db.query('DELETE FROM web_link_codes WHERE expires_at<$1',[now()])

  for(let attempt=0;attempt<5;attempt++){
    const code=makeLinkCode()
    const codeHash=sha256(code)
    try{
      const expiresAt=now()+CODE_TTL_MS
      await db.query(
        'INSERT INTO web_link_codes(code_hash,jid,chat_jid,expires_at,created_at) VALUES($1,$2,$3,$4,$5)',
        [codeHash,jid,group,expiresAt,now()]
      )
      await db.query(`
        DELETE FROM web_link_codes
        WHERE code_hash IN (
          SELECT code_hash FROM web_link_codes
          WHERE jid=$1 AND used_at IS NULL
          ORDER BY created_at DESC
          OFFSET 3
        )
      `,[jid]).catch(()=>{})
      const renderBase=String(process.env.RENDER_EXTERNAL_URL||'').trim().replace(/\/$/,'')
      const configured=String(process.env.WEB_APP_URL||(renderBase?renderBase+'/rpg':'')).trim()
      let origin=''
      try{ origin=configured?new URL(configured).origin:renderBase }catch{ origin=renderBase }
      return {
        code,
        expiresAt,
        chatJid:group,
        url:origin ? `${origin}/rpg#code=${encodeURIComponent(code)}` : null
      }
    }catch(err){
      if(err?.code!=='23505') throw err
    }
  }
  throw new Error('Não foi possível gerar o código Web. Tente novamente.')
}

async function exchangeWebLinkCode(code){
  await ensureWebTables()
  const normalized=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')
  if(normalized.length<6) throw new Error('Código inválido.')
  const codeHash=sha256(normalized)
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const row=(await client.query(
      'SELECT * FROM web_link_codes WHERE code_hash=$1 FOR UPDATE',
      [codeHash]
    )).rows[0]
    if(!row || row.used_at || Number(row.expires_at)<now()) throw new Error('Código inválido ou expirado.')

    const token=crypto.randomBytes(32).toString('base64url')
    const tokenHash=sha256(token)
    const expiresAt=now()+SESSION_TTL_MS
    await client.query('UPDATE web_link_codes SET used_at=$1 WHERE code_hash=$2',[now(),codeHash])
    await client.query(
      'INSERT INTO web_sessions(token_hash,jid,chat_jid,expires_at,created_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$5)',
      [tokenHash,row.jid,row.chat_jid||null,expiresAt,now()]
    )
    if(row.chat_jid){
      // Vincular pelo grupo atualiza também tokens antigos do mesmo jogador/aparelho.
      // Isso elimina o estado "entrei pelo link do grupo, mas Boss/Raid continuam privados".
      await client.query(
        'UPDATE web_sessions SET chat_jid=$1,last_seen_at=$2 WHERE jid=$3 AND expires_at>$2',
        [row.chat_jid,now(),row.jid]
      )
    }
    await client.query('COMMIT')
    return {token,expiresAt,groupLinked:Boolean(row.chat_jid)}
  }catch(err){
    await client.query('ROLLBACK')
    throw err
  }finally{
    client.release()
  }
}


async function webAuthSelfTest(){
  await ensureWebTables()
  const code=makeLinkCode()
  const codeHash=sha256(code)
  const jid='__alpha_web_health__'
  const group='120363000000000000@g.us'
  const created=now()
  await db.query(
    'INSERT INTO web_link_codes(code_hash,jid,chat_jid,expires_at,created_at) VALUES($1,$2,$3,$4,$5)',
    [codeHash,jid,group,created+60000,created]
  )
  let tokenHash=''
  try{
    const session=await exchangeWebLinkCode(code)
    tokenHash=sha256(session.token)
    const row=(await db.query('SELECT jid,chat_jid,expires_at FROM web_sessions WHERE token_hash=$1',[tokenHash])).rows[0]
    if(!row||row.jid!==jid||Number(row.expires_at)<=created) throw new Error('Sessão de teste não foi persistida.')
    if(row.chat_jid!==group||!session.groupLinked) throw new Error('Vínculo de grupo do Web não foi persistido.')
    return {ok:true,codeExchange:true,sessionPersisted:true,groupLinked:true}
  }finally{
    if(tokenHash) await db.query('DELETE FROM web_sessions WHERE token_hash=$1',[tokenHash]).catch(()=>{})
    await db.query('DELETE FROM web_link_codes WHERE code_hash=$1',[codeHash]).catch(()=>{})
  }
}

async function authSession(req){
  await ensureWebTables()
  const auth=String(req.headers.authorization||'')
  const match=auth.match(/^Bearer\s+(.+)$/i)
  if(!match) return null
  const tokenHash=sha256(match[1])
  const row=(await db.query(
    'SELECT jid,chat_jid,expires_at FROM web_sessions WHERE token_hash=$1',
    [tokenHash]
  )).rows[0]
  if(!row || Number(row.expires_at)<now()){
    if(row) await db.query('DELETE FROM web_sessions WHERE token_hash=$1',[tokenHash]).catch(()=>{})
    return null
  }
  await db.query('UPDATE web_sessions SET last_seen_at=$1 WHERE token_hash=$2',[now(),tokenHash]).catch(()=>{})
  return {tokenHash,jid:row.jid,chatJid:row.chat_jid||null,expiresAt:Number(row.expires_at)}
}

async function logoutSession(session){
  if(!session) return
  await db.query('DELETE FROM web_sessions WHERE token_hash=$1',[session.tokenHash])
}

function allowedOrigin(req){
  const configured=String(process.env.WEB_ALLOWED_ORIGINS||'*').trim()
  const origin=String(req.headers.origin||'')
  // Same-origin/browser GETs and server-to-server health checks may legitimately omit Origin.
  if(!origin) return null
  if(configured==='*') return '*'
  const allowed=configured.split(',').map(x=>x.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : (allowed.includes('null')&&origin==='null'?'null':'')
}

function setCors(req,res){
  const requestOrigin=String(req.headers.origin||'')
  const origin=allowedOrigin(req)
  if(requestOrigin && !origin) return false
  if(origin){
    res.setHeader('Access-Control-Allow-Origin',origin)
    res.setHeader('Vary','Origin')
  }
  res.setHeader('Access-Control-Allow-Headers','authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
  res.setHeader('Access-Control-Max-Age','600')
  return true
}

function json(res,status,payload){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
  res.end(JSON.stringify(payload,(_,value)=>typeof value==='bigint'?value.toString():value))
}

async function readJson(req,maxBytes=16384){
  let total=0
  const chunks=[]
  for await (const chunk of req){
    total+=chunk.length
    if(total>maxBytes) throw new Error('Payload muito grande.')
    chunks.push(chunk)
  }
  if(!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function petCatalog(){
  const legendary=LEGENDARY_PET_SUMMONS.flatMap(altar=>
    altar.pets.map(p=>({
      ...p,
      raidLevel:Number(altar.raidLevel),
      materialId:altar.materialId,
      materialName:altar.materialName,
      summonCost:Number(altar.summonCost||100),
      source:'raid'
    }))
  )
  const adoptable=ADOPTABLE_PETS.map(p=>({...p,source:'adoption'}))
  const all=[...adoptable,...legendary]
  return all.map(p=>({
    ...p,
    style:petStyleLabel(p.species),
    specialty:PET_STATUS_SPECIALTIES[p.species]||null,
    hpProfile:PET_HP_PROFILES[p.species]||null
  }))
}

function hangmanMask(word,letters=[]){
  const guessed=new Set((letters||[]).map(x=>String(x).toLowerCase()))
  return [...String(word||'')].map(ch=>guessed.has(ch.toLowerCase())?ch:'_').join(' ')
}

function sanitizeGameState(gameType,state){
  if(!state || typeof state!=='object') return state
  const safe=structuredClone(state)
  const type=String(gameType||'')

  if(type==='quiz'){
    delete safe.c
    delete safe.correctAnswer
    delete safe.correctText
  }

  if(type==='numero'){
    delete safe.number
  }

  if(type==='forca'){
    if(!safe.finished) safe.masked=hangmanMask(safe.word,safe.letters)
    if(!safe.finished) delete safe.word
  }

  if(type.startsWith('rps_duel:') || type.startsWith('coin_duel:')){
    delete safe.choice
    delete safe.targetChoice
  }

  return safe
}

function sanitizeActionResult(actionName,result){
  if(result==null || typeof result!=='object') return result
  const name=String(actionName||'')
  if(name==='game.quiz.start') return sanitizeGameState('quiz',result)
  if(name==='game.number.start') return sanitizeGameState('numero',result)
  if(name==='game.hangman.start' || name==='game.hangman.letter' || name==='game.hangman.word'){
    const copy=sanitizeGameState('forca',result)
    if(copy?.won || copy?.lost || copy?.finished) return result
    return copy
  }
  if(name==='game.rpsDuel.create') return sanitizeGameState('rps_duel',result)
  if(name==='game.coinDuel.create') return sanitizeGameState('coin_duel',result)
  return result
}

async function groupSnapshot(chatJid){
  if(!chatJid) return null
  const [raids,license,gameRows,roster]=await Promise.all([
    getRaidStatuses(chatJid),
    getGroupLicense(chatJid),
    db.query('SELECT game_type,state,updated_at FROM trevo_games WHERE chat_jid=$1 ORDER BY game_type',[chatJid]),
    weeklyActivityLeaderboard(chatJid,20)
  ])
  const games=Object.fromEntries(gameRows.rows.map(r=>[
    r.game_type,
    {...(sanitizeGameState(r.game_type,r.state)||{}),updatedAt:Number(r.updated_at||0)}
  ]))
  return {
    chatJid,license,raids,roster,
    boss:games.boss||null,
    bossEvent:games.boss_event||null,
    games
  }
}
async function playerBootstrap(session){
  const jid=session.jid
  const [
    profile,combatProfile,inventory,pets,petTeam,petExpeditions,dailyMissions,streak,career,
    home,cars,motorcycles,businesses,patrimony,cltUber,loans,market,achievements,relationship,group,
    doubleRewardEvent,luckyBoxEvent,cooldowns,sleep,carpinar,recentTransactions
  ]=await Promise.all([
    getProfile(jid),
    getCombatProfile(jid),
    getInventory(jid),
    listPets(jid),
    getPetTeam(jid),
    getPetExpeditions(jid),
    getDailyMissions(jid),
    getDailyStreak(jid),
    getCareer(jid),
    getHome(jid),
    getGarage(jid),
    getMotorcycleGarage(jid),
    getBusinesses(jid),
    getPatrimony(jid),
    getCltUberStatus(jid),
    getLoanOverview(jid),
    listMyMarketListings(jid),
    getAchievements(jid),
    getRelationship(jid),
    groupSnapshot(session.chatJid),
    getDoubleRewardEvent(),
    getLuckyBoxEvent(),
    db.query('SELECT key,expires_at FROM cooldowns WHERE key LIKE $1 AND expires_at>$2 ORDER BY expires_at',[`%${jid}%`,Math.floor(Date.now()/1000)]),
    db.query('SELECT * FROM player_sleep WHERE jid=$1',[jid]),
    db.query('SELECT * FROM player_carpinar WHERE jid=$1',[jid]),
    db.query(`SELECT t.id,t.amount,t.type,t.note,t.created_at,
                     CASE WHEN t.from_jid=$1 AND t.to_jid<>$1 THEN 'out'
                          WHEN t.to_jid=$1 AND t.from_jid<>$1 THEN 'in'
                          ELSE 'self' END AS direction,
                     CASE WHEN t.from_jid=$1
                          THEN COALESCE(tu.push_name,CASE WHEN t.to_jid IN ('system','shop','raid_shop','upgrade') THEN 'Sistema' ELSE 'Jogador' END)
                          ELSE COALESCE(fu.push_name,CASE WHEN t.from_jid IN ('system','shop','raid_shop','upgrade') THEN 'Sistema' ELSE 'Jogador' END)
                     END AS counterparty
              FROM transactions t
              LEFT JOIN users fu ON fu.jid=t.from_jid
              LEFT JOIN users tu ON tu.jid=t.to_jid
              WHERE t.from_jid=$1 OR t.to_jid=$1
              ORDER BY t.created_at DESC,t.id DESC
              LIMIT 20`,[jid])
  ])
  return {
    syncedAt:now(),
    identity:{jid,groupLinked:Boolean(session.chatJid),sessionExpiresAt:session.expiresAt},
    profile,combatProfile,inventory,pets,petTeam,petTeamSynergy:petTeamSynergy(petTeam),petExpeditions,dailyMissions,streak,career,
    home,cars,motorcycles,businesses,patrimony,cltUber,loans,market,achievements,relationship,group,
    events:{doubleReward:doubleRewardEvent,luckyBox:luckyBoxEvent},
    cooldowns:cooldowns.rows||[],
    recentTransactions:recentTransactions.rows||[],
    activities:{sleep:sleep.rows?.[0]||null,carpinar:carpinar.rows?.[0]||null}
  }
}async function playerExtras(session){
  const jid=session.jid
  const chatJid=session.chatJid||null
  const [
    market,clan,clans,ranks,economyRank,combatRank,petRank,patrimonyRank,
    loanCredit,carpinarPlans,groupMission,groupMissionLeaderboard,groupEvent
  ]=await Promise.all([
    listMarket(30),
    getClanForUser(jid),
    listClans(20),
    getPlayerRanks(jid),
    leaderboard(10),
    combatLeaderboard(10),
    petLeaderboard(10),
    patrimonyLeaderboard(10),
    getLoanCredit(jid),
    Promise.resolve(getCarpinarPlans()),
    chatJid?getGroupMission(chatJid):Promise.resolve(null),
    chatJid?getGroupMissionLeaderboard(chatJid):Promise.resolve([]),
    chatJid?db.query(`SELECT ge.event_type,ge.reward_cash,ge.spawned_at,ge.expires_at,
                              (ge.claimed_by IS NOT NULL) AS claimed,
                              u.push_name AS claimed_by_name
                       FROM group_events ge
                       LEFT JOIN users u ON u.jid=ge.claimed_by
                       WHERE ge.chat_jid=$1`,[chatJid]).then(r=>r.rows?.[0]||null):Promise.resolve(null)
  ])
  return {
    syncedAt:now(),
    market,clan,clans,ranks,loanCredit,carpinarPlans,
    leaderboards:{
      economy:economyRank,
      combat:combatRank,
      pets:petRank,
      patrimony:patrimonyRank,
      activity:chatJid?await weeklyActivityLeaderboard(chatJid,10):[]
    },
    groupMission,
    groupMissionLeaderboard,
    groupEvent,
    levelRewards:[5,10,15,20,25,30,35,40,45,50].map(getLevelRewardPreview).filter(Boolean)
  }
}

async function publicCatalog(){
  const [shopRows,allItemRows]=await Promise.all([
    getShop(),
    db.query('SELECT id,name,description,category,price,sellable,stackable,rarity,data FROM items ORDER BY category,price,name')
  ])
  // Catálogo antigo deixou armas/armaduras duplicadas em inglês sem suporte ao sistema atual de equipamento.
  // Mantemos somente os itens canônicos quando existe versão real equipada no Alpha RPG.
  const shop=(shopRows||[]).filter(item=>{
    if(!['weapon','armor','boots'].includes(item.category)) return true
    return Boolean(getEquipmentInfo(item.id))
  })
  const allItems=(allItemRows.rows||[]).map(item=>({
    ...item,
    equipment:['weapon','armor','boots'].includes(item.category)?getEquipmentInfo(item.id):null
  }))
  return {
    generatedAt:now(),
    pets:petCatalog(),
    raids:getRaidCatalog(),
    shop,
    allItems,
    houses:HOUSES,
    cars:CARS,
    motorcycles:MOTORCYCLES,
    businesses:BUSINESSES,
    classes:Object.values(PLAYER_CLASSES),
    cltUberTypes:CLT_UBER_TYPES,
    loanRules:LOAN_RULES
  }
}
function requireGroup(session){
  if(!session?.chatJid) throw new Error('Esta ação exige vínculo com um grupo. Use !web dentro do grupo do Alpha Bot e conecte novamente.')
  return session.chatJid
}

function positiveInt(value,label='Valor',max=999999999){
  const n=Number(value)
  if(!Number.isInteger(n)||n<1||n>max) throw new Error(label+' inválido.')
  return n
}

async function groupTarget(session,targetJid){
  const chatJid=requireGroup(session)
  const target=String(targetJid||'')
  if(!target || target===session.jid) throw new Error('Escolha outro membro do grupo.')
  const roster=await weeklyActivityLeaderboard(chatJid,20)
  const member=roster.find(x=>x.jid===target || memberRef(chatJid,x.jid)===target)
  if(!member || member.jid===session.jid) throw new Error('Esse jogador não está entre os membros recentes do grupo vinculado.')
  return member
}

async function runAllActivities(session){
  const jid=session.jid
  const results=[]
  let grossTotal=0,taxTotal=0,netTotal=0
  const add=async(label,fn)=>{
    try{
      const r=await fn()
      if(!r?.ok){
        results.push({label,ok:false,cooldown:true,remaining:Number(r?.remaining||0)})
        return
      }
      grossTotal+=Number(r.gross||0)
      taxTotal+=Number(r.tax||0)
      netTotal+=Number(r.amount??r.total??0)
      await progressDailyMission(jid,'work').catch(()=>{})
      if(session.chatJid) await progressGroupMission(session.chatJid,jid,'work').catch(()=>{})
      results.push({label,ok:true,...r})
    }catch(err){
      results.push({label,ok:false,error:String(err?.message||'indisponível')})
    }
  }
  await add('Trabalho',()=>work(jid,3))
  await add('Uber',()=>driveUber(jid,3))
  await add('iFood',()=>deliverIfood(jid,3))
  return {results,grossTotal,taxTotal,netTotal}
}

const WEB_SLEEP_ALLOWED_ACTIONS=new Set([
  'sleep.start','sleep.wake','loan.accept','loan.reject','loan.pay'
])

function webActionModule(name){
  const action=String(name||'')
  if(action.startsWith('game.')||action.startsWith('boss.')) return 'games_enabled'
  if(action.startsWith('clan.')||action.startsWith('groupMission.')||action.startsWith('groupEvent.')||
     action.startsWith('house.')||action.startsWith('car.')||action.startsWith('motorcycle.')||
     action.startsWith('business.')||action.startsWith('cltUber.')||action.startsWith('sleep.')||
     action.startsWith('carpinar.')||action.startsWith('missions.')||action.startsWith('level.')) return 'progression_enabled'
  if(action==='daily'||action==='work'||action==='all'||action==='deposit'||action==='withdraw'||
     action==='transfer'||action==='uber'||action==='ifood'||action.startsWith('market.')||
     action.startsWith('loan.')||action.startsWith('item.buy')||action.startsWith('item.sell')) return 'economy_enabled'
  return 'rpg_enabled'
}

async function enforceWebActionPolicy(session,name){
  const jid=session.jid
  const sleep=await resolvePlayerSleep(jid)
  if(sleep?.active && !WEB_SLEEP_ALLOWED_ACTIONS.has(name)){
    throw new Error('Você está dormindo. Acorde antes de executar esta ação.')
  }
  if(session.chatJid){
    const settings=await getGroupSettings(session.chatJid)
    const key=webActionModule(name)
    if(settings?.[key]===false){
      const labels={economy_enabled:'Economia',rpg_enabled:'RPG',games_enabled:'Minigames',progression_enabled:'Progressão'}
      throw new Error((labels[key]||'Módulo')+' está desativado neste grupo.')
    }
  }
}

async function playerDisplayName(jid){
  if(!jid) return 'Jogador'
  const row=(await db.query('SELECT push_name FROM users WHERE jid=$1',[jid])).rows[0]
  return String(row?.push_name||'Jogador').trim()||'Jogador'
}
const brl=n=>'R$ '+Math.abs(Math.round(Number(n)||0)).toLocaleString('pt-BR')

async function sendWebGroupActivity(session,actionName,body,result){
  if(!session?.chatJid || !result) return
  const send=globalThis.__alphaWebGroupLog
  if(typeof send!=='function') return

  const me=session.jid
  const meName=await playerDisplayName(me)
  let text='',mentions=[]

  if(actionName==='battle' && result.ok!==false && result.winner && result.loser){
    const won=String(result.winner.jid)===String(me)
    const opponent=won?result.loser:result.winner
    text='⚔️ *RIVALIDADE ALPHA*\n'+meName+' duelou com '+String(opponent.name||'Jogador')+' e *'+(won?'VENCEU':'PERDEU')+'*.'+
      (won?'\n💰 Prêmio: *'+brl(result.reward)+'*':'')
    mentions=[me,opponent.jid].filter(Boolean)
  }else if(actionName==='petduel' && result.winner && result.loser){
    const won=String(result.winnerJid||result.winner.jid)===String(me)
    const opponent=won?result.loser:result.winner
    text='🐾⚔️ *DUELO DE PETS*\n'+meName+' entrou em duelo e *'+(won?'VENCEU':'PERDEU')+'* para '+String(opponent.name||'outro pet')+'.\n⏱️ '+Number(result.rounds||0)+' rodada(s).'
    mentions=[me,result.winnerJid,result.loserJid].filter(Boolean)
  }else if(actionName==='game.roulette'){
    const amount=Number(result.amount||body.amount||0),profit=Number(result.profit||0)
    text='🎰 *ROULETA — '+meName+'*\nApostou *'+brl(amount)+'* em *'+String(result.choice||body.choice||'')+'* e '+
      (profit>0?'ganhou *'+brl(profit)+' de lucro* 🎉':'perdeu *'+brl(amount)+'* 💸')+
      '.\n🎯 Saiu '+String(result.number??'?')+' • '+String(result.color||'')
    mentions=[me]
  }else if(actionName==='game.coinflip'){
    const amount=Number(result.amount||body.amount||0),profit=Number(result.profit||0)
    text='🪙 *CARA OU COROA — '+meName+'*\nApostou *'+brl(amount)+'* em *'+String(result.choice||body.choice||'')+'* e '+
      (profit>0?'ganhou *'+brl(profit)+' de lucro* 🎉':'perdeu *'+brl(amount)+'* 💸')+'.'
    mentions=[me]
  }else if(actionName==='game.coinDuel.accept' && result.winner){
    const winnerName=await playerDisplayName(result.winner)
    const loserJid=String(result.winner)===String(result.challenger)?result.target:result.challenger
    const loserName=await playerDisplayName(loserJid)
    text='🪙⚔️ *DUELO CARA OU COROA*\n*'+winnerName+'* venceu *'+loserName+'* e levou o pote de *'+brl(result.pot)+'*.'
    mentions=[result.winner,loserJid].filter(Boolean)
  }else if(actionName==='game.rpsDuel.accept'){
    if(result.winner){
      const winnerName=await playerDisplayName(result.winner)
      const loserJid=String(result.winner)===String(result.challenger)?result.target:result.challenger
      const loserName=await playerDisplayName(loserJid)
      text='✊✋✌️ *DUELO PPT*\n*'+winnerName+'* venceu *'+loserName+'* valendo *'+brl(result.pot)+'*.'
      mentions=[result.winner,loserJid].filter(Boolean)
    }else{
      text='✊✋✌️ *DUELO PPT*\n'+meName+' terminou um duelo em *EMPATE*. O valor foi devolvido.'
      mentions=[me,result.challenger].filter(Boolean)
    }
  }else if(actionName==='pet.adopt'){
    text='🐾 *NOVA ADOÇÃO*\n'+meName+' adotou *'+String(result.name||body.name||'um novo pet')+'* — '+String(result.species||body.species||'pet')+'.'
    mentions=[me]
  }else if(actionName==='daily'){
    const gained=Number(result.totalCash||result.amount||result.cash||0)
    text='🔥 *DAILY ALPHA*\n'+meName+' resgatou o Daily'+(gained>0?' e recebeu *'+brl(gained)+'*':'')+'.'
    mentions=[me]
  }else if(actionName==='work'){
    const gained=Number(result.amount||result.net||result.cash||0)
    text='💼 *TRABALHO*\n'+meName+' trabalhou'+(gained>0?' e lucrou *'+brl(gained)+'*':'')+'.'
    mentions=[me]
  }else if(actionName==='all'){
    text='⚡ *ROTINA COMPLETA*\n'+meName+' executou as atividades disponíveis pelo *!all* no Alpha RPG.'
    mentions=[me]
  }else if(actionName==='deposit'){
    text='🏦 *BANCO*\n'+meName+' depositou *'+brl(body.amount||0)+'*.'
    mentions=[me]
  }else if(actionName==='withdraw'){
    text='💵 *BANCO*\n'+meName+' sacou *'+brl(body.amount||0)+'*.'
    mentions=[me]
  }else if(actionName==='transfer'){
    text='💸 *TRANSFERÊNCIA*\n'+meName+' transferiu *'+brl(body.amount||0)+'* para outro jogador.'
    mentions=[me]
  }else if(actionName==='rob'){
    const success=Boolean(result.success||result.ok)
    const amount=Number(result.amount||result.stolen||0)
    text='🥷 *ROUBO*\n'+meName+' tentou roubar outro jogador e '+(success?'*CONSEGUIU*'+(amount>0?' levar *'+brl(amount)+'*':''):'*FALHOU*')+'.'
    mentions=[me]
  }else if(actionName==='dungeon'){
    text='🏰 *DUNGEON*\n'+meName+' enfrentou uma Dungeon pelo Alpha RPG.'
    mentions=[me]
  }else if(actionName==='missions.claim'){
    text='📋 *MISSÕES DIÁRIAS*\n'+meName+' resgatou recompensas de missão.'
    mentions=[me]
  }else if(actionName==='level.claim'){
    text='⭐ *RECOMPENSA DE NÍVEL*\n'+meName+' resgatou uma recompensa de progressão.'
    mentions=[me]
  }else if(actionName==='character.select'){
    text='🧙 *CLASSE*\n'+meName+' escolheu/trocou sua classe para *'+String(result.name||result.className||body.classId||'nova classe')+'*.'
    mentions=[me]
  }else if(actionName==='item.buy'){
    text='🏪 *LOJA*\n'+meName+' comprou *'+Number(body.qty||1)+'x* '+String(body.itemId||'item')+'.'
    mentions=[me]
  }else if(actionName==='item.sell'){
    text='💰 *VENDA*\n'+meName+' vendeu *'+Number(body.qty||1)+'x* '+String(body.itemId||'item')+'.'
    mentions=[me]
  }else if(actionName==='item.equip'){
    text='🗡️ *EQUIPAMENTO*\n'+meName+' equipou *'+String(body.itemId||'um item')+'*.'
    mentions=[me]
  }else if(actionName==='item.upgrade'){
    text='⬆️ *UPGRADE*\n'+meName+' melhorou *'+String(body.itemId||'um equipamento')+'*.'
    mentions=[me]
  }else if(actionName==='item.box.open'||actionName==='item.lucky.open'){
    text='🎁 *CAIXA ABERTA*\n'+meName+' abriu '+Number(body.qty||1)+' caixa(s) no Alpha RPG.'
    mentions=[me]
  }else if(actionName.startsWith('market.')){
    const label=actionName==='market.create'?'anunciou um item':actionName==='market.buy'?'comprou no mercado':'cancelou um anúncio'
    text='📣 *MERCADO*\n'+meName+' '+label+'.'
    mentions=[me]
  }else if(actionName==='sleep.start'){
    text='😴 *DESCANSO*\n'+meName+' foi dormir e está protegido durante o descanso.'
    mentions=[me]
  }else if(actionName==='sleep.wake'){
    text='🌅 *ACORDOU*\n'+meName+' encerrou o descanso e voltou para o jogo.'
    mentions=[me]
  }else if(actionName==='carpinar.start'){
    text='🌿 *CARPINAR*\n'+meName+' começou a carpinar por *'+Number(body.hours||0)+'h*.'
    mentions=[me]
  }else if(actionName==='carpinar.leave'){
    text='🌿 *CARPINAR*\n'+meName+' encerrou o Carpinar antes do fim.'
    mentions=[me]
  }else if(actionName==='pet.select'){
    text='🐾 *PET ATIVO*\n'+meName+' trocou o pet principal.'
    mentions=[me]
  }else if(actionName==='pet.rename'){
    text='✏️🐾 *PET RENOMEADO*\n'+meName+' renomeou seu pet para *'+String(body.name||'novo nome')+'*.'
    mentions=[me]
  }else if(actionName==='pet.heal'){
    text='🧪🐾 *CURA DE PET*\n'+meName+' curou um pet.'
    mentions=[me]
  }else if(actionName==='pet.action'){
    text='🐾 *AÇÃO DE PET*\n'+meName+' usou *'+String(body.action||'uma ação')+'* com seu pet.'
    mentions=[me]
  }else if(actionName==='pet.team'){
    text='🧬 *TIME PET*\n'+meName+' atualizou a formação do Time Pet.'
    mentions=[me]
  }else if(actionName==='pet.summon'){
    text='✨🐾 *INVOCAÇÃO*\n'+meName+' realizou uma invocação de pet de Raid.'
    mentions=[me]
  }else if(actionName.startsWith('raid.')){
    if(actionName==='raid.round'){
      const round=Number(result?.round||0)
      if(round>0 && round%10===0){
        const hp=Number(result?.hp||0), maxHp=Number(result?.maxHp||0)
        text='⚔️ *RAID — RODADA '+round+'*\n👤 '+meName+' avançou a Raid Lv.*'+Number(body.level||result?.level||0)+'*.'+(maxHp>0?'\n❤️ Boss: *'+hp.toLocaleString('pt-BR')+'/'+maxHp.toLocaleString('pt-BR')+'*':'')
        mentions=[me]
      }else{
        text=null
      }
    }else{
      const labels={'raid.create':'abriu uma Raid','raid.join':'entrou em uma Raid','raid.start':'iniciou uma Raid','raid.cancel':'cancelou uma Raid'}
      text='⚔️ *RAID*\n'+meName+' '+(labels[actionName]||'agiu em uma Raid')+(body.level?' Lv.*'+Number(body.level)+'*':'')+'.'
      mentions=[me]
    }
  }else if(actionName.startsWith('boss.')){
    text='👹 *BOSS*\n'+meName+' '+(actionName==='boss.start'?'iniciou um Boss':'atacou o Boss')+'.'
    mentions=[me]
  }else if(['uber','ifood'].includes(actionName)){
    const amount=Number(result.amount||result.net||result.cash||0)
    text=(actionName==='uber'?'🚕 *UBER*':'🍔 *IFOOD*')+'\n'+meName+' fez uma corrida/entrega'+(amount>0?' e recebeu *'+brl(amount)+'*':'')+'.'
    mentions=[me]
  }else if(actionName.startsWith('business.')){
    text='🏢 *NEGÓCIOS*\n'+meName+' '+(actionName==='business.buy'?'comprou um negócio':actionName==='business.collect'?'coletou os ganhos dos negócios':'melhorou um negócio')+'.'
    mentions=[me]
  }else if(actionName.startsWith('car.')||actionName.startsWith('motorcycle.')||actionName==='house.buy'){
    const labels={'car.buy':'comprou um carro','car.sell':'vendeu um carro','motorcycle.buy':'comprou uma moto/bike','motorcycle.sell':'vendeu uma moto/bike','house.buy':'comprou uma casa'}
    text='🏠🚗 *PATRIMÔNIO*\n'+meName+' '+(labels[actionName]||'alterou seu patrimônio')+'.'
    mentions=[me]
  }else if(actionName.startsWith('clan.')){
    text='🛡️ *CLÃ*\n'+meName+' realizou uma ação no clã: *'+actionName.replace('clan.','')+'*.'
    mentions=[me]
  }else if(actionName.startsWith('loan.')){
    text='💳 *EMPRÉSTIMO*\n'+meName+' realizou uma ação de empréstimo: *'+actionName.replace('loan.','')+'*.'
    mentions=[me]
  }else if(actionName.startsWith('relationship.')){
    text='💞 *RELACIONAMENTO*\n'+meName+' realizou uma ação social: *'+actionName.replace('relationship.','')+'*.'
    mentions=[me]
  }else{
    const actionLabels={
      'game.rps':'Pedra, Papel e Tesoura','game.quiz.start':'Quiz','game.quiz.answer':'Resposta do Quiz',
      'game.number.start':'Jogo do Número','game.number.guess':'Palpite do Número',
      'game.hangman.start':'Forca','game.hangman.letter':'Letra na Forca','game.hangman.word':'Palpite na Forca',
      'game.coinDuel.create':'Desafio Cara ou Coroa','game.rpsDuel.create':'Desafio PPT',
      'game.groupRoulette.create':'Roleta coletiva','game.groupRoulette.join':'Entrada na roleta coletiva',
      'game.groupRoulette.spin':'Giro da roleta coletiva','game.tournament.create':'Torneio criado',
      'game.tournament.join':'Entrada no torneio','game.tournament.start':'Torneio iniciado',
      'pet.adventure':'Aventura de Pet','pet.expedition.start':'Expedição de Pet','pet.expedition.resolve':'Retorno de Expedição',
      'pet.energy':'Energia de Pet','player.heal':'Cura do personagem','item.use':'Uso de item',
      'item.sellDuplicates':'Venda de repetidos','groupMission.claim':'Missão coletiva',
      'groupEvent.claim':'Evento coletivo','cltUber.start':'Turno CLT Uber','cltUber.collect':'Coleta CLT Uber',
      'cltUber.hire':'Contratação CLT Uber'
    }
    text='🎮 *ATIVIDADE ALPHA*\n'+meName+' executou *'+String(actionLabels[actionName]||actionName)+'* pelo RPG.'
    mentions=[me]
  }

  if(text) await send(session.chatJid,text,[...new Set(mentions)])
}

async function runAction(session,name,body={}){
  const jid=session.jid
  await enforceWebActionPolicy(session,name)
  switch(name){
    case 'daily': return claimDaily(jid)
    case 'missions.claim': return claimDailyMissions(jid)
    case 'level.claim': return claimLevelRewards(jid)
    case 'work': return work(jid)
    case 'all': return runAllActivities(session)
    case 'deposit': return deposit(jid,body.amount)
    case 'withdraw': return withdraw(jid,positiveInt(body.amount,'Valor'))
    case 'transfer': {
      const member=await groupTarget(session,body.targetJid)
      return transfer(jid,member.jid,positiveInt(body.amount,'Valor'))
    }
    case 'battle': {
      const member=await groupTarget(session,body.targetJid)
      return battle(jid,member.jid)
    }
    case 'petduel': {
      const member=await groupTarget(session,body.targetJid)
      return petDuel(jid,member.jid)
    }
    case 'rob': {
      const member=await groupTarget(session,body.targetJid)
      return robPlayer(jid,member.jid)
    }
    case 'dungeon': return dungeon(jid)
    case 'relationship.propose': {
      const member=await groupTarget(session,body.targetJid)
      return proposeRelationship(jid,member.jid)
    }
    case 'relationship.accept': {
      const member=await groupTarget(session,body.targetJid)
      return acceptRelationship(jid,member.jid)
    }
    case 'relationship.divorce': return divorceRelationship(jid)
    case 'loan.offer': {
      const member=await groupTarget(session,body.targetJid)
      return createLoanOffer(jid,member.jid,positiveInt(body.amount,'Valor'))
    }
    case 'character.select': return setPlayerClass(jid,String(body.classId||''))
    case 'item.buy': return buyItem(jid,String(body.itemId||''),positiveInt(body.qty||1,'Quantidade',99))
    case 'item.sell': return sellItem(jid,String(body.itemId||''),positiveInt(body.qty||1,'Quantidade',9999))
    case 'item.equip': return equipItem(jid,String(body.itemId||''))
    case 'item.upgrade': return upgradeEquipment(jid,String(body.itemId||''),body.targetLevel==null?null:positiveInt(body.targetLevel,'Nível',10))
    case 'player.heal': return usePotion(jid,body.itemId?String(body.itemId):null)
    case 'item.use': return usePotion(jid,String(body.itemId||''))

    case 'item.box.open': return openLootBoxes(jid,String(body.boxId||'caixa_sorte'),positiveInt(body.qty||1,'Quantidade',50))
    case 'item.lucky.open': return openLuckyBoxes(jid,positiveInt(body.qty||1,'Quantidade',50))
    case 'item.sellDuplicates': return sellDuplicateEquipment(jid)
    case 'market.create': return createMarketListing(jid,String(body.itemId||''),positiveInt(body.qty||1,'Quantidade',9999),positiveInt(body.price,'Preço'))
    case 'market.buy': return buyMarketListing(jid,positiveInt(body.listingId,'Anúncio'))
    case 'market.cancel': return cancelMarketListing(jid,positiveInt(body.listingId,'Anúncio'))
    case 'sleep.start': return startPlayerSleep(jid)
    case 'sleep.wake': return wakePlayerEarly(jid)
    case 'carpinar.start': return startPlayerCarpinar(jid,positiveInt(body.hours,'Horas',24))
    case 'carpinar.leave': return leavePlayerCarpinarEarly(jid)
    case 'pet.adventure': return petAdventure(jid)
    case 'pet.expedition.start': return startPetExpedition(jid,positiveInt(body.petId,'Pet'),positiveInt(body.hours||4,'Horas',24))
    case 'pet.expedition.resolve': return resolvePetExpeditions(jid)

    case 'pet.heal': return usePetPotion(jid,body.itemId?String(body.itemId):null,body.petId==null?null:positiveInt(body.petId,'Pet'))
    case 'pet.energy': return usePetEnergyItem(jid,String(body.itemId||'energetico_pet'))
    case 'pet.adopt': return adoptPet(jid,String(body.species||''),String(body.name||'Alpha'))
    case 'pet.select': return selectPet(jid,positiveInt(body.petId,'Pet'))
    case 'pet.rename': return renamePet(jid,String(body.name||''))
    case 'pet.action': return petAction(jid,String(body.action||''))
    case 'pet.team': return setPetTeam(jid,Array.isArray(body.petIds)?body.petIds:[],body.replaceAll!==false)
    case 'pet.summon': return summonLegendaryPet(jid,String(body.materialId||''))

    case 'raid.create': return createRaid(requireGroup(session),jid,String(body.name||'Jogador'),positiveInt(body.level,'Nível',50))
    case 'raid.join': return joinRaid(requireGroup(session),jid,String(body.name||'Jogador'),body.level==null?null:positiveInt(body.level,'Nível',50))
    case 'raid.cancel': return cancelRaid(requireGroup(session),jid,body.level==null?null:positiveInt(body.level,'Nível',50))
    case 'raid.start': return startRaid(requireGroup(session),jid,body.level==null?null:positiveInt(body.level,'Nível',50))
    case 'raid.round': return raidRound(requireGroup(session),body.level==null?null:positiveInt(body.level,'Nível',50))
    case 'boss.start': return startBoss(requireGroup(session))
    case 'boss.attack': return attackBoss(requireGroup(session),jid,String(body.name||'Jogador'),body.usePet!==false)

    case 'house.buy': return buyHouse(jid,String(body.id||body.input||''))
    case 'car.buy': return buyCar(jid,String(body.id||body.input||''))
    case 'car.sell': return sellCar(jid,String(body.id||body.input||''))
    case 'uber': return driveUber(jid)
    case 'motorcycle.buy': return buyMotorcycle(jid,String(body.id||body.input||''))
    case 'motorcycle.sell': return sellMotorcycle(jid,String(body.id||body.input||''))
    case 'ifood': return deliverIfood(jid)
    case 'business.buy': return buyBusiness(jid,String(body.id||body.input||''))
    case 'business.collect': return collectBusinesses(jid)
    case 'business.upgrade': return upgradeBusiness(jid,String(body.id||body.input||''))
    case 'cltUber.start': return startCltUberShift(jid,positiveInt(body.driverSlot,'Motorista',100),positiveInt(body.carSlot,'Carro',100))
    case 'cltUber.collect': return collectCltUber(jid)

    case 'cltUber.hire': return hireCltUberDriver(jid,String(body.input||body.id||''))
    case 'clan.create': return createClan(jid,String(body.name||''))
    case 'clan.accept': return acceptClanInvite(jid)
    case 'clan.leave': return leaveClan(jid)
    case 'clan.donate': return donateClan(jid,positiveInt(body.amount,'Valor'))
    case 'clan.invite': {
      const member=await groupTarget(session,body.targetJid)
      return inviteToClan(jid,member.jid)
    }
    case 'clan.kick': {
      const member=await groupTarget(session,body.targetJid)
      return kickClanMember(jid,member.jid)
    }
    case 'clan.transfer': {
      const member=await groupTarget(session,body.targetJid)
      return transferClanLeadership(jid,member.jid)
    }
    case 'groupMission.claim': return claimGroupMission(requireGroup(session),jid)
    case 'groupEvent.claim': return claimGroupEvent(requireGroup(session),jid)

    case 'game.coinflip': return coinFlip(jid,positiveInt(body.amount,'Aposta'),String(body.choice||''))
    case 'game.roulette': return roulette(jid,positiveInt(body.amount,'Aposta'),String(body.choice||''))
    case 'game.rps': return rps(String(body.choice||''))
    case 'game.quiz.start': return startQuiz(requireGroup(session))
    case 'game.quiz.answer': return answerQuiz(requireGroup(session),jid,String(body.answer||''))
    case 'game.number.start': return startNumberGame(requireGroup(session))
    case 'game.number.guess': return guessNumber(requireGroup(session),jid,positiveInt(body.guess,'Número',999999))
    case 'game.hangman.start': return startHangman(requireGroup(session))
    case 'game.hangman.letter': return hangmanLetter(requireGroup(session),String(body.letter||''))
    case 'game.hangman.word': return hangmanWord(requireGroup(session),String(body.word||''))
    case 'game.coinDuel.create': {
      const member=await groupTarget(session,body.targetJid)
      return createCoinDuel(requireGroup(session),jid,member.jid,positiveInt(body.amount,'Aposta'),String(body.choice||''))
    }
    case 'game.coinDuel.accept': return acceptCoinDuel(requireGroup(session),jid)
    case 'game.rpsDuel.create': {
      const member=await groupTarget(session,body.targetJid)
      return createRpsDuel(requireGroup(session),jid,member.jid,positiveInt(body.amount,'Aposta'),String(body.choice||''))
    }
    case 'game.rpsDuel.accept': return acceptRpsDuel(requireGroup(session),jid,String(body.choice||''))
    case 'game.groupRoulette.create': return createGroupRoulette(requireGroup(session),jid,positiveInt(body.amount,'Aposta'),String(body.choice||''))
    case 'game.groupRoulette.join': return joinGroupRoulette(requireGroup(session),jid,positiveInt(body.amount,'Aposta'),String(body.choice||''))
    case 'game.groupRoulette.spin': return spinGroupRoulette(requireGroup(session),jid)
    case 'game.tournament.create': return createTournament(requireGroup(session),jid,positiveInt(body.amount,'Entrada'))
    case 'game.tournament.join': return joinTournament(requireGroup(session),jid)
    case 'game.tournament.start': return startTournament(requireGroup(session),jid)

    case 'loan.accept': return acceptLoan(jid,body.id==null?null:positiveInt(body.id,'Empréstimo'))
    case 'loan.reject': return rejectLoan(jid,body.id==null?null:positiveInt(body.id,'Empréstimo'))
    case 'loan.pay': return payLoan(jid,body.amount==null?'total':body.amount)
    default: throw new Error('Ação Web não suportada.')
  }
}
export async function handleWebApi(req,res){
  const url=new URL(req.url||'/', 'http://localhost')
  if(!url.pathname.startsWith('/api/v1/')) return false

  if(!setCors(req,res)){
    json(res,403,{ok:false,error:'Origem não autorizada.'})
    return true
  }
  if(req.method==='OPTIONS'){
    res.writeHead(204)
    res.end()
    return true
  }

  try{
    if(req.method==='GET' && url.pathname==='/api/v1/health'){
      json(res,200,{ok:true,service:'alpha-web-api',version:2})
      return true
    }

    if(req.method==='GET' && url.pathname==='/api/v1/health/auth'){
      try{
        const check=await webAuthSelfTest()
        json(res,200,{ok:true,...check})
      }catch(err){
        console.error('[Web Auth] self-test failed',err)
        json(res,503,{ok:false,error:'Falha no fluxo de autenticação Web.'})
      }
      return true
    }

    if(req.method==='GET' && url.pathname==='/api/v1/catalog'){
      json(res,200,{ok:true,data:await publicCatalog()})
      return true
    }

    if(req.method==='GET' && url.pathname==='/api/v1/auth/link'){
      const code=String(url.searchParams.get('code')||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')
      // GET nunca consome código: crawlers/preview do WhatsApp podem abrir links automaticamente.
      // O código vai no fragmento, que só o navegador entrega ao app; a troca real continua sendo POST.
      res.writeHead(302,{
        location:'/rpg#code='+encodeURIComponent(code),
        'cache-control':'no-store, no-cache, must-revalidate',
        'referrer-policy':'no-referrer'
      })
      res.end()
      return true
    }

    if(req.method==='POST' && url.pathname==='/api/v1/auth/exchange'){
      const body=await readJson(req)
      const session=await exchangeWebLinkCode(body.code)
      console.info('[Web Auth] code exchange success',session.groupLinked?'group':'private')
      json(res,200,{ok:true,...session})
      return true
    }

    const session=await authSession(req)
    if(!session){
      json(res,401,{ok:false,error:'Sessão Web inválida ou expirada.'})
      return true
    }

    if(req.method==='POST' && url.pathname==='/api/v1/auth/logout'){
      await logoutSession(session)
      json(res,200,{ok:true})
      return true
    }

    if(req.method==='GET' && url.pathname==='/api/v1/me/avatar'){
      const avatar=await getProfileAvatar(session.jid)
      if(!avatar){
        res.writeHead(404,{'cache-control':'no-store'})
        res.end()
        return true
      }
      res.writeHead(200,{
        'content-type':avatar.mimeType||'image/jpeg',
        'cache-control':'private, no-store',
        'content-length':String(avatar.buffer.length)
      })
      res.end(avatar.buffer)
      return true
    }

    if(req.method==='GET' && url.pathname==='/api/v1/me/bootstrap'){
      const data=await playerBootstrap(session)
      json(res,200,{ok:true,data:sanitizePrivateRefs(data,session)})
      return true
    }

    if(req.method==='GET' && url.pathname==='/api/v1/me/extras'){
      const data=await playerExtras(session)
      json(res,200,{ok:true,data:sanitizePrivateRefs(data,session)})
      return true
    }

    if(req.method==='POST' && url.pathname.startsWith('/api/v1/action/')){
      const actionName=decodeURIComponent(url.pathname.slice('/api/v1/action/'.length))
      const body=await readJson(req)
      const rawResult=await runAction(session,actionName,body)
      await sendWebGroupActivity(session,actionName,body,rawResult).catch(err=>console.error('[Web Activity]',err?.message||err))
      const result=sanitizePrivateRefs(sanitizeActionResult(actionName,rawResult),session)
      json(res,200,{ok:true,result})
      return true
    }

    json(res,404,{ok:false,error:'Endpoint não encontrado.'})
    return true
  }catch(err){
    const message=String(err?.message||'Erro interno.')
    const status=/inválid|expirad|não autorizad/i.test(message)?400:500
    console.error('[Web API]',req.method,url.pathname,err)
    json(res,status,{ok:false,error:message})
    return true
  }
}
