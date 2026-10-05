import 'dotenv/config'
import crypto from 'node:crypto'
import {
  db, ensureUser, getProfile, getShop, getInventory, getDailyStreak, getCareer,
  listPets, getPetTeam, getPetExpeditions, getAchievements, getRelationship,
  listMyMarketListings, getGroupLicense, LEGENDARY_PET_SUMMONS, PET_HP_PROFILES,
  petStyleLabel, getEquipmentInfo, getDoubleRewardEvent, getLuckyBoxEvent,
  claimDaily, work, deposit, withdraw, buyItem, sellItem, equipItem, upgradeEquipment,
  usePotion, usePetPotion, usePetEnergyItem, adoptPet, selectPet, renamePet, petAction,
  setPetTeam, summonLegendaryPet, getCombatProfile, getGroupSettings, resolvePlayerSleep, petTeamSynergy,
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
import { ADOPTABLE_PETS, PET_STATUS_SPECIALTIES } from './game-catalog.js'

const CODE_TTL_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
let webTablesReady = false
let webTablesPromise = null

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex')
const now = () => Date.now()

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
  await db.query('DELETE FROM web_link_codes WHERE expires_at<$1 OR (jid=$2 AND used_at IS NULL)',[now(),jid])

  for(let attempt=0;attempt<5;attempt++){
    const code=makeLinkCode()
    const codeHash=sha256(code)
    try{
      const expiresAt=now()+CODE_TTL_MS
      await db.query(
        'INSERT INTO web_link_codes(code_hash,jid,chat_jid,expires_at,created_at) VALUES($1,$2,$3,$4,$5)',
        [codeHash,jid,group,expiresAt,now()]
      )
      const renderBase=String(process.env.RENDER_EXTERNAL_URL||'').trim().replace(/\/$/,'')
      const base=String(process.env.WEB_APP_URL||(renderBase?renderBase+'/rpg':'')).trim().replace(/\/$/,'')
      return {
        code,
        expiresAt,
        chatJid:group,
        url:base ? `${base}?link=${encodeURIComponent(code)}` : null
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
    await client.query('COMMIT')
    return {token,expiresAt,groupLinked:Boolean(row.chat_jid)}
  }catch(err){
    await client.query('ROLLBACK')
    throw err
  }finally{
    client.release()
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
  if(configured==='*') return '*'
  const origin=String(req.headers.origin||'')
  const allowed=configured.split(',').map(x=>x.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : (allowed.includes('null')&&origin==='null'?'null':'')
}

function setCors(req,res){
  const origin=allowedOrigin(req)
  if(origin){
    res.setHeader('Access-Control-Allow-Origin',origin)
    res.setHeader('Vary','Origin')
  }
  res.setHeader('Access-Control-Allow-Headers','authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
  res.setHeader('Access-Control-Max-Age','600')
  return Boolean(origin)
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
    doubleRewardEvent,luckyBoxEvent,cooldowns,sleep,carpinar
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
    db.query('SELECT * FROM player_carpinar WHERE jid=$1',[jid])
  ])
  return {
    syncedAt:now(),
    identity:{jid,groupLinked:Boolean(session.chatJid),sessionExpiresAt:session.expiresAt},
    profile,combatProfile,inventory,pets,petTeam,petTeamSynergy:petTeamSynergy(petTeam),petExpeditions,dailyMissions,streak,career,
    home,cars,motorcycles,businesses,patrimony,cltUber,loans,market,achievements,relationship,group,
    events:{doubleReward:doubleRewardEvent,luckyBox:luckyBoxEvent},
    cooldowns:cooldowns.rows||[],
    activities:{sleep:sleep.rows?.[0]||null,carpinar:carpinar.rows?.[0]||null}
  }
}async function playerExtras(session){
  const jid=session.jid
  const chatJid=session.chatJid||null
  const [
    market,clan,clans,ranks,economyRank,combatRank,petRank,patrimonyRank,
    loanCredit,carpinarPlans,groupMission,groupMissionLeaderboard
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
    chatJid?getGroupMissionLeaderboard(chatJid):Promise.resolve([])
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
    levelRewards:[5,10,15,20,25,30,35,40,45,50].map(getLevelRewardPreview).filter(Boolean)
  }
}

async function publicCatalog(){
  const [shop,allItemRows]=await Promise.all([
    getShop(),
    db.query('SELECT id,name,description,category,price,sellable,stackable,rarity,data FROM items ORDER BY category,price,name')
  ])
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
  const member=roster.find(x=>x.jid===target)
  if(!member) throw new Error('Esse jogador não está entre os membros recentes do grupo vinculado.')
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
  if(action.startsWith('game.')) return 'games_enabled'
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
    case 'item.buy': return buyItem(jid,String(body.itemId||''),positiveInt(body.qty||1,'Quantidade',99))
    case 'item.sell': return sellItem(jid,String(body.itemId||''),positiveInt(body.qty||1,'Quantidade',9999))
    case 'item.equip': return equipItem(jid,String(body.itemId||''))
    case 'item.upgrade': return upgradeEquipment(jid,String(body.itemId||''),body.targetLevel==null?null:positiveInt(body.targetLevel,'Nível',10))
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

    case 'pet.heal': return usePetPotion(jid,body.itemId?String(body.itemId):null)
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
      json(res,200,{ok:true,service:'alpha-web-api',version:1})
      return true
    }

    if(req.method==='GET' && url.pathname==='/api/v1/catalog'){
      json(res,200,{ok:true,data:await publicCatalog()})
      return true
    }

    if(req.method==='POST' && url.pathname==='/api/v1/auth/exchange'){
      const body=await readJson(req)
      const session=await exchangeWebLinkCode(body.code)
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

    if(req.method==='GET' && url.pathname==='/api/v1/me/bootstrap'){
      json(res,200,{ok:true,data:await playerBootstrap(session)})
      return true
    }

    if(req.method==='GET' && url.pathname==='/api/v1/me/extras'){
      json(res,200,{ok:true,data:await playerExtras(session)})
      return true
    }

    if(req.method==='POST' && url.pathname.startsWith('/api/v1/action/')){
      const actionName=decodeURIComponent(url.pathname.slice('/api/v1/action/'.length))
      const body=await readJson(req)
      const rawResult=await runAction(session,actionName,body)
      const result=sanitizeActionResult(actionName,rawResult)
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
