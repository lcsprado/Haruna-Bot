import 'dotenv/config'
import crypto from 'node:crypto'
import {
  db, ensureUser, getProfile, getShop, getInventory, getDailyStreak, getCareer,
  listPets, getPetTeam, getPetExpeditions, getAchievements, getRelationship,
  listMyMarketListings, getGroupLicense, LEGENDARY_PET_SUMMONS, PET_HP_PROFILES,
  petStyleLabel, getEquipmentInfo, getDoubleRewardEvent, getLuckyBoxEvent,
  claimDaily, work, deposit, withdraw, buyItem, sellItem, equipItem, upgradeEquipment,
  usePotion, usePetPotion, usePetEnergyItem, adoptPet, selectPet, renamePet, petAction,
  setPetTeam, summonLegendaryPet
} from './db.js'
import {
  getRaidCatalog, getRaidStatuses, createRaid, joinRaid, cancelRaid, startRaid, raidRound,
  startBoss, attackBoss
} from './games.js'
import {
  HOUSES, CARS, MOTORCYCLES, BUSINESSES, CLT_UBER_TYPES,
  getDailyMissions, getHome, getGarage, getMotorcycleGarage,
  getBusinesses, getPatrimony, getCltUberStatus,
  buyHouse, buyCar, sellCar, driveUber, buyMotorcycle, sellMotorcycle, deliverIfood,
  buyBusiness, collectBusinesses, upgradeBusiness, startCltUberShift, collectCltUber
} from './progression.js'
import { getLoanOverview, LOAN_RULES, acceptLoan, rejectLoan, payLoan } from './loans.js'
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
      const base=String(process.env.WEB_APP_URL||'').trim().replace(/\/$/,'')
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

async function groupSnapshot(chatJid){
  if(!chatJid) return null
  const [raids,license,bossRows]=await Promise.all([
    getRaidStatuses(chatJid),
    getGroupLicense(chatJid),
    db.query(
      "SELECT game_type,state,updated_at FROM trevo_games WHERE chat_jid=$1 AND game_type=ANY($2::text[])",
      [chatJid,['boss','boss_event']]
    )
  ])
  const games=Object.fromEntries(bossRows.rows.map(r=>[r.game_type,{...(r.state||{}),updatedAt:Number(r.updated_at||0)}]))
  return {chatJid,license,raids,boss:games.boss||null,bossEvent:games.boss_event||null}
}

async function playerBootstrap(session){
  const jid=session.jid
  const [
    profile,inventory,pets,petTeam,petExpeditions,dailyMissions,streak,career,
    home,cars,motorcycles,businesses,patrimony,cltUber,loans,market,achievements,relationship,group,
    doubleRewardEvent,luckyBoxEvent,cooldowns,sleep,carpinar
  ]=await Promise.all([
    getProfile(jid),
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
    profile,inventory,pets,petTeam,petExpeditions,dailyMissions,streak,career,
    home,cars,motorcycles,businesses,patrimony,cltUber,loans,market,achievements,relationship,group,
    events:{doubleReward:doubleRewardEvent,luckyBox:luckyBoxEvent},
    cooldowns:cooldowns.rows||[],
    activities:{sleep:sleep.rows?.[0]||null,carpinar:carpinar.rows?.[0]||null}
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
