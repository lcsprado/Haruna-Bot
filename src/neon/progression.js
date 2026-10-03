import crypto from 'node:crypto'
import { db, ensureUser, claimCooldown, getDoubleEventMultiplier } from './db.js'

const nowSql='(EXTRACT(EPOCH FROM NOW())::BIGINT)'

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

export const HOUSES=[
  {id:'kitnet',name:'Kitnet',price:25000},
  {id:'casa',name:'Casa',price:80000},
  {id:'sobrado',name:'Sobrado',price:200000},
  {id:'mansao',name:'Mansão',price:600000},
  {id:'cobertura',name:'Cobertura',price:1500000},
]

export const CARS=[
  {id:'popular',name:'Chevrolet Corsa',price:35000},
  {id:'sedan_esportivo',name:'Hyundai HB20',price:85000},
  {id:'suv_premium',name:'Honda Civic Type R',price:220000},
  {id:'superesportivo',name:'Ferrari 296 GTB',price:1500000},
  {id:'hipercarro',name:'Bugatti Chiron Super Sport',price:6000000},
  {id:'porsche_911',name:'Porsche 911 GT3 RS',price:750000},
  {id:'lamborghini_revuelto',name:'Lamborghini Revuelto',price:3000000},
  {id:'mclaren_p1',name:'McLaren P1',price:4500000},
]

export const MOTORCYCLES=[
  {id:'bicicleta',name:'Bicicleta',price:1500},
  {id:'moto_125',name:'Moto 125cc',price:9000},
  {id:'moto_160',name:'Moto 160cc',price:16000},
  {id:'moto_300',name:'Moto 300cc',price:35000},
  {id:'moto_600',name:'Moto 600cc',price:90000},
  {id:'moto_1000',name:'Superbike 1000cc',price:220000},
]

export const BUSINESSES=[
  {id:'carrinho_lanche',name:'Carrinho de Lanche',price:15000,profitHour:1000,capacityHours:8},
  {id:'barbearia',name:'Barbearia',price:45000,profitHour:2800,capacityHours:8},
  {id:'loja_roupas',name:'Loja de Roupas',price:120000,profitHour:7000,capacityHours:10},
  {id:'restaurante',name:'Restaurante',price:300000,profitHour:16000,capacityHours:10},
  {id:'posto',name:'Posto de Combustível',price:750000,profitHour:38000,capacityHours:12},
  {id:'mercado',name:'Supermercado',price:1800000,profitHour:85000,capacityHours:12},
  {id:'hotel',name:'Hotel',price:4500000,profitHour:200000,capacityHours:16},
  {id:'shopping',name:'Shopping Center',price:12000000,profitHour:500000,capacityHours:18},
  {id:'tech',name:'Empresa de Tecnologia',price:30000000,profitHour:1200000,capacityHours:24},
]

const MISSION_POOL=[
  {type:'daily',title:'Resgate o prêmio diário',target:1,rewardCash:1000,rewardBox:0},
  {type:'work',title:'Trabalhe 3 vezes',target:3,rewardCash:2000,rewardBox:0},
  {type:'dungeon',title:'Entre em 1 dungeon',target:1,rewardCash:2500,rewardBox:0},
  {type:'battle',title:'Complete 1 batalha',target:1,rewardCash:2000,rewardBox:0},
  {type:'shop',title:'Compre 1 item na loja',target:1,rewardCash:1500,rewardBox:0},
  {type:'game',title:'Jogue 3 minigames',target:3,rewardCash:1500,rewardBox:1},
]

function dayKey(){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date())
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]))
  return `${map.year}-${map.month}-${map.day}`
}

function dailySelection(jid,key){
  const digest=crypto.createHash('sha256').update(`${jid}:${key}:trevo`).digest()
  return MISSION_POOL
    .map((mission,index)=>({mission,score:digest[index]}))
    .sort((a,b)=>a.score-b.score)
    .slice(0,3)
    .map(x=>x.mission)
}

export async function initProgression(){
  await db.query(`
    CREATE TABLE IF NOT EXISTS daily_missions(
      jid TEXT NOT NULL,
      day_key TEXT NOT NULL,
      mission_type TEXT NOT NULL,
      title TEXT NOT NULL,
      target INTEGER NOT NULL,
      reward_cash BIGINT NOT NULL DEFAULT 0,
      reward_box INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      claimed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      PRIMARY KEY(jid,day_key,mission_type)
    );

    CREATE TABLE IF NOT EXISTS clans(
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      owner_jid TEXT NOT NULL,
      treasury BIGINT NOT NULL DEFAULT 0,
      xp BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE UNIQUE INDEX IF NOT EXISTS clans_name_lower_uq
      ON clans(LOWER(name));

    CREATE TABLE IF NOT EXISTS clan_members(
      jid TEXT PRIMARY KEY,
      clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE INDEX IF NOT EXISTS clan_members_clan_idx
      ON clan_members(clan_id);

    CREATE TABLE IF NOT EXISTS clan_invites(
      clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      invitee_jid TEXT NOT NULL,
      inviter_jid TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      PRIMARY KEY(clan_id,invitee_jid)
    );

    CREATE TABLE IF NOT EXISTS user_homes(
      jid TEXT PRIMARY KEY,
      house_id TEXT NOT NULL,
      price_paid BIGINT NOT NULL,
      acquired_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS user_cars(
      id BIGSERIAL PRIMARY KEY,
      jid TEXT NOT NULL,
      car_id TEXT NOT NULL,
      price_paid BIGINT NOT NULL,
      acquired_at BIGINT NOT NULL DEFAULT ${nowSql},
      UNIQUE(jid,car_id)
    );

    CREATE INDEX IF NOT EXISTS user_cars_jid_idx
      ON user_cars(jid);

    CREATE TABLE IF NOT EXISTS user_motorcycles(
      id BIGSERIAL PRIMARY KEY,
      jid TEXT NOT NULL,
      motorcycle_id TEXT NOT NULL,
      price_paid BIGINT NOT NULL,
      acquired_at BIGINT NOT NULL DEFAULT ${nowSql},
      UNIQUE(jid,motorcycle_id)
    );

    CREATE INDEX IF NOT EXISTS user_motorcycles_jid_idx
      ON user_motorcycles(jid);

    CREATE TABLE IF NOT EXISTS user_businesses(
      id BIGSERIAL PRIMARY KEY,
      jid TEXT NOT NULL,
      business_id TEXT NOT NULL,
      price_paid BIGINT NOT NULL,
      acquired_at BIGINT NOT NULL DEFAULT ${nowSql},
      last_collected_at BIGINT NOT NULL DEFAULT ${nowSql},
      UNIQUE(jid,business_id)
    );
    ALTER TABLE user_businesses ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

    CREATE INDEX IF NOT EXISTS user_businesses_jid_idx
      ON user_businesses(jid);

    CREATE TABLE IF NOT EXISTS group_missions(
      chat_jid TEXT NOT NULL,
      week_key TEXT NOT NULL,
      mission_type TEXT NOT NULL,
      title TEXT NOT NULL,
      target INTEGER NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      reward_cash BIGINT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY(chat_jid,week_key)
    );

    CREATE TABLE IF NOT EXISTS group_mission_members(
      chat_jid TEXT NOT NULL,
      week_key TEXT NOT NULL,
      jid TEXT NOT NULL,
      contribution INTEGER NOT NULL DEFAULT 0,
      claimed BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY(chat_jid,week_key,jid)
    );

    CREATE TABLE IF NOT EXISTS group_events(
      chat_jid TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      reward_cash BIGINT NOT NULL,
      spawned_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      claimed_by TEXT
    );
  `)
}

async function ensureMissions(jid){
  await ensureUser(jid)
  const key=dayKey()
  const selected=dailySelection(jid,key)
  for(const m of selected){
    await db.query(`
      INSERT INTO daily_missions(
        jid,day_key,mission_type,title,target,reward_cash,reward_box
      )
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(jid,day_key,mission_type) DO NOTHING
    `,[jid,key,m.type,m.title,m.target,m.rewardCash,m.rewardBox])
  }
  return key
}

export async function getDailyMissions(jid){
  const key=await ensureMissions(jid)
  const {rows}=await db.query(`
    SELECT mission_type,title,target,reward_cash,reward_box,progress,claimed
    FROM daily_missions
    WHERE jid=$1 AND day_key=$2
    ORDER BY created_at,mission_type
  `,[jid,key])
  return {day:key,missions:rows}
}

export async function progressDailyMission(jid,type,amount=1){
  amount=Math.max(1,Number(amount)||1)
  const key=await ensureMissions(jid)
  const {rows}=await db.query(`
    UPDATE daily_missions
    SET progress=LEAST(target,progress+$1)
    WHERE jid=$2 AND day_key=$3 AND mission_type=$4
    RETURNING mission_type,title,target,progress,claimed
  `,[amount,jid,key,type])
  return rows[0]||null
}

export async function claimDailyMissions(jid){
  await ensureUser(jid)
  const key=await ensureMissions(jid)
  return tx(async c=>{
    const r=await c.query(`
      SELECT *
      FROM daily_missions
      WHERE jid=$1 AND day_key=$2
        AND progress>=target AND claimed=FALSE
      FOR UPDATE
    `,[jid,key])

    if(!r.rows.length) return {claimed:0,cash:0,boxes:0}

    const moneyMultiplier=await getDoubleEventMultiplier(c,'money')
    const cash=r.rows.reduce((a,m)=>a+Number(m.reward_cash||0),0)*moneyMultiplier
    const boxes=r.rows.reduce((a,m)=>a+Number(m.reward_box||0),0)

    if(cash>0){
      await c.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[cash,jid])
      await c.query(`
        INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES('system',$1,$2,'mission_reward','daily missions')
      `,[jid,cash])
    }

    if(boxes>0){
      await c.query(`
        INSERT INTO inventories(jid,item_id,quantity)
        VALUES($1,'caixa_sorte',$2)
        ON CONFLICT(jid,item_id)
        DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity
      `,[jid,boxes])
    }

    await c.query(`
      UPDATE daily_missions
      SET claimed=TRUE
      WHERE jid=$1 AND day_key=$2
        AND progress>=target AND claimed=FALSE
    `,[jid,key])

    return {claimed:r.rows.length,cash,boxes,eventMultiplier:moneyMultiplier}
  })
}

export async function getClanForUser(jid){
  const {rows}=await db.query(`
    SELECT c.id,c.name,c.owner_jid,c.treasury,c.xp,
           cm.role,
           (SELECT COUNT(*)::int FROM clan_members x WHERE x.clan_id=c.id) AS members
    FROM clan_members cm
    JOIN clans c ON c.id=cm.clan_id
    WHERE cm.jid=$1
  `,[jid])
  if(!rows[0]) return null
  const c=rows[0]
  return {...c,level:1+Math.floor(Number(c.xp||0)/25000)}
}

export async function createClan(jid,name){
  await ensureUser(jid)
  name=String(name||'').trim().replace(/\s+/g,' ')
  if(name.length<3||name.length>24) throw new Error('O nome do clã deve ter entre 3 e 24 caracteres.')
  if(await getClanForUser(jid)) throw new Error('Você já pertence a um clã.')

  return tx(async c=>{
    const w=await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    if(Number(w.rows[0]?.cash||0)<10000) throw new Error('Criar um clã custa R$ 10.000.')

    let clan
    try{
      const cr=await c.query(
        'INSERT INTO clans(name,owner_jid) VALUES($1,$2) RETURNING *',
        [name,jid]
      )
      clan=cr.rows[0]
    }catch(err){
      if(err?.code==='23505') throw new Error('Já existe um clã com esse nome.')
      throw err
    }

    await c.query('UPDATE wallets SET cash=cash-10000 WHERE jid=$1',[jid])
    await c.query(
      "INSERT INTO clan_members(jid,clan_id,role) VALUES($1,$2,'leader')",
      [jid,clan.id]
    )
    return {...clan,role:'leader',members:1,level:1}
  })
}

export async function inviteToClan(jid,targetJid){
  if(!targetJid||jid===targetJid) throw new Error('Marque outra pessoa para convidar.')
  await ensureUser(targetJid)
  const clan=await getClanForUser(jid)
  if(!clan) throw new Error('Você não pertence a um clã.')
  if(clan.role!=='leader') throw new Error('Somente o líder pode convidar.')
  if(await getClanForUser(targetJid)) throw new Error('Essa pessoa já pertence a um clã.')

  const expires=Math.floor(Date.now()/1000)+(24*60*60)
  await db.query(`
    INSERT INTO clan_invites(clan_id,invitee_jid,inviter_jid,expires_at)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(clan_id,invitee_jid)
    DO UPDATE SET inviter_jid=EXCLUDED.inviter_jid,
                  expires_at=EXCLUDED.expires_at,
                  created_at=${nowSql}
  `,[clan.id,targetJid,jid,expires])
  return {clan,expires}
}

export async function acceptClanInvite(jid){
  if(await getClanForUser(jid)) throw new Error('Você já pertence a um clã.')
  const now=Math.floor(Date.now()/1000)
  return tx(async c=>{
    const r=await c.query(`
      SELECT ci.*,c.name
      FROM clan_invites ci
      JOIN clans c ON c.id=ci.clan_id
      WHERE ci.invitee_jid=$1 AND ci.expires_at>$2
      ORDER BY ci.created_at DESC
      LIMIT 1
      FOR UPDATE OF ci
    `,[jid,now])
    const inv=r.rows[0]
    if(!inv) throw new Error('Você não tem convite de clã válido.')

    await c.query(
      "INSERT INTO clan_members(jid,clan_id,role) VALUES($1,$2,'member')",
      [jid,inv.clan_id]
    )
    await c.query('DELETE FROM clan_invites WHERE invitee_jid=$1',[jid])
    return {clanId:inv.clan_id,name:inv.name}
  })
}

export async function transferClanLeadership(jid,targetJid){
  if(!targetJid||targetJid===jid) throw new Error('Marque outro membro do clã.')
  const clan=await getClanForUser(jid)
  if(!clan) throw new Error('Você não pertence a um clã.')
  if(clan.role!=='leader') throw new Error('Somente o líder pode transferir a liderança.')

  return tx(async c=>{
    const target=await c.query(
      'SELECT role FROM clan_members WHERE jid=$1 AND clan_id=$2 FOR UPDATE',
      [targetJid,clan.id]
    )
    if(!target.rows[0]) throw new Error('Essa pessoa não pertence ao seu clã.')

    await c.query("UPDATE clan_members SET role='member' WHERE jid=$1",[jid])
    await c.query("UPDATE clan_members SET role='leader' WHERE jid=$1",[targetJid])
    await c.query('UPDATE clans SET owner_jid=$1 WHERE id=$2',[targetJid,clan.id])
    return {name:clan.name,targetJid}
  })
}

export async function kickClanMember(jid,targetJid){
  if(!targetJid||targetJid===jid) throw new Error('Marque outro membro do clã.')
  const clan=await getClanForUser(jid)
  if(!clan) throw new Error('Você não pertence a um clã.')
  if(clan.role!=='leader') throw new Error('Somente o líder pode expulsar membros.')

  const {rows}=await db.query(
    'DELETE FROM clan_members WHERE jid=$1 AND clan_id=$2 RETURNING jid',
    [targetJid,clan.id]
  )
  if(!rows[0]) throw new Error('Essa pessoa não pertence ao seu clã.')
  return {name:clan.name,targetJid}
}

export async function leaveClan(jid){
  const clan=await getClanForUser(jid)
  if(!clan) throw new Error('Você não pertence a um clã.')

  return tx(async c=>{
    const countR=await c.query('SELECT COUNT(*)::int AS n FROM clan_members WHERE clan_id=$1',[clan.id])
    const count=Number(countR.rows[0]?.n||0)
    if(clan.role==='leader' && count>1){
      throw new Error('O líder não pode sair enquanto houver outros membros no clã.')
    }
    if(clan.role==='leader'){
      await c.query('DELETE FROM clans WHERE id=$1',[clan.id])
      return {dissolved:true,name:clan.name}
    }
    await c.query('DELETE FROM clan_members WHERE jid=$1',[jid])
    return {dissolved:false,name:clan.name}
  })
}

export async function donateClan(jid,amount){
  amount=Number(amount)
  if(!Number.isInteger(amount)||amount<100) throw new Error('Doação mínima: R$ 100.')
  const clan=await getClanForUser(jid)
  if(!clan) throw new Error('Você não pertence a um clã.')

  return tx(async c=>{
    const w=await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    if(Number(w.rows[0]?.cash||0)<amount) throw new Error('Saldo insuficiente na carteira.')

    await c.query('UPDATE wallets SET cash=cash-$1 WHERE jid=$2',[amount,jid])
    const r=await c.query(`
      UPDATE clans
      SET treasury=treasury+$1,xp=xp+$1
      WHERE id=$2
      RETURNING treasury,xp
    `,[amount,clan.id])
    const row=r.rows[0]
    return {
      amount,
      treasury:Number(row.treasury),
      xp:Number(row.xp),
      level:1+Math.floor(Number(row.xp)/25000)
    }
  })
}

export async function listClans(limit=10){
  const {rows}=await db.query(`
    SELECT c.id,c.name,c.treasury,c.xp,
           COUNT(cm.jid)::int AS members
    FROM clans c
    LEFT JOIN clan_members cm ON cm.clan_id=c.id
    GROUP BY c.id
    ORDER BY c.xp DESC,c.treasury DESC,c.created_at ASC
    LIMIT $1
  `,[limit])
  return rows.map(r=>({...r,level:1+Math.floor(Number(r.xp||0)/25000)}))
}

function resolveCatalog(input,catalog){
  const raw=String(input||'').toLowerCase().trim()
  if(/^\d+$/.test(raw)) return catalog[Number(raw)-1]||null
  return catalog.find(x=>x.id===raw)||null
}

export async function getHome(jid){
  const {rows}=await db.query('SELECT * FROM user_homes WHERE jid=$1',[jid])
  const row=rows[0]
  if(!row) return null
  const item=HOUSES.find(x=>x.id===row.house_id)
  return item?{...row,...item}:null
}

export async function buyHouse(jid,input){
  await ensureUser(jid)
  const house=resolveCatalog(input,HOUSES)
  if(!house) throw new Error('Casa inválida.')

  return tx(async c=>{
    const h=await c.query('SELECT * FROM user_homes WHERE jid=$1 FOR UPDATE',[jid])
    const currentId=h.rows[0]?.house_id
    const current=HOUSES.find(x=>x.id===currentId)||null
    if(current && house.price<=current.price) throw new Error('Você só pode trocar por uma casa de valor maior.')

    const tradeIn=current?Math.floor(current.price*.60):0
    const cost=Math.max(0,house.price-tradeIn)
    const w=await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    if(Number(w.rows[0]?.cash||0)<cost) throw new Error(`Você precisa de R$ ${cost.toLocaleString('pt-BR')} na carteira.`)

    await c.query('UPDATE wallets SET cash=cash-$1 WHERE jid=$2',[cost,jid])
    await c.query(`
      INSERT INTO user_homes(jid,house_id,price_paid)
      VALUES($1,$2,$3)
      ON CONFLICT(jid)
      DO UPDATE SET house_id=EXCLUDED.house_id,
                    price_paid=EXCLUDED.price_paid,
                    acquired_at=${nowSql}
    `,[jid,house.id,cost])
    return {house,cost,tradeIn,previous:current}
  })
}

export async function getGarage(jid){
  const {rows}=await db.query(
    'SELECT car_id,price_paid,acquired_at FROM user_cars WHERE jid=$1 ORDER BY acquired_at',
    [jid]
  )
  return rows.map(r=>{
    const car=CARS.find(x=>x.id===r.car_id)
    return car?{...r,...car}:r
  })
}

export async function getMotorcycleGarage(jid){
  const {rows}=await db.query(
    'SELECT motorcycle_id,price_paid,acquired_at FROM user_motorcycles WHERE jid=$1 ORDER BY acquired_at',
    [jid]
  )
  return rows.map(r=>{
    const motorcycle=MOTORCYCLES.find(x=>x.id===r.motorcycle_id)
    return motorcycle?{...r,...motorcycle}:r
  })
}

export async function buyMotorcycle(jid,input){
  await ensureUser(jid)
  // Aceita número da lista (!comprarmoto 1), id ou nome exibido.
  const raw=String(input||'').trim()
  let motorcycle=resolveCatalog(raw,MOTORCYCLES)
  if(!motorcycle && raw){
    const normalized=raw.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ').trim()
    motorcycle=MOTORCYCLES.find(m=>{
      const name=m.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,' ').trim()
      return name===normalized
    })||null
  }
  if(!motorcycle) throw new Error('Moto inválida.')

  return tx(async c=>{
    const owned=await c.query('SELECT motorcycle_id FROM user_motorcycles WHERE jid=$1 FOR UPDATE',[jid])
    if(owned.rows.some(r=>r.motorcycle_id===motorcycle.id)) throw new Error('Você já possui essa moto.')
    if(owned.rows.length>=6) throw new Error('Sua garagem de delivery está cheia: limite atual de 6 veículos.')

    const w=await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    if(Number(w.rows[0]?.cash||0)<motorcycle.price) throw new Error('Saldo insuficiente na carteira.')

    await c.query('UPDATE wallets SET cash=cash-$1 WHERE jid=$2',[motorcycle.price,jid])
    await c.query(
      'INSERT INTO user_motorcycles(jid,motorcycle_id,price_paid) VALUES($1,$2,$3)',
      [jid,motorcycle.id,motorcycle.price]
    )
    return motorcycle
  })
}

export async function sellCar(jid,input){
  await ensureUser(jid)
  const car=resolveCatalog(input,CARS)
  if(!car) throw new Error('Carro inválido. Veja !garagem.')
  return tx(async client=>{
    const r=await client.query('SELECT price_paid FROM user_cars WHERE jid=$1 AND car_id=$2 FOR UPDATE',[jid,car.id])
    if(!r.rows.length) throw new Error('Você não possui esse carro.')
    const paid=Number(r.rows[0].price_paid||car.price)
    const resale=Math.floor(paid*0.70)
    await client.query('DELETE FROM user_cars WHERE jid=$1 AND car_id=$2',[jid,car.id])
    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[resale,jid])
    await client.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'vehicle_sale',$3)",[jid,resale,car.name])
    return {...car,paid,resale,depreciation:paid-resale}
  })
}

export async function sellMotorcycle(jid,input){
  await ensureUser(jid)
  const vehicle=resolveCatalog(input,MOTORCYCLES)
  if(!vehicle) throw new Error('Veículo inválido. Veja !minhasmotos.')
  return tx(async client=>{
    const r=await client.query('SELECT price_paid FROM user_motorcycles WHERE jid=$1 AND motorcycle_id=$2 FOR UPDATE',[jid,vehicle.id])
    if(!r.rows.length) throw new Error('Você não possui esse veículo.')
    const paid=Number(r.rows[0].price_paid||vehicle.price)
    const resale=Math.floor(paid*0.70)
    await client.query('DELETE FROM user_motorcycles WHERE jid=$1 AND motorcycle_id=$2',[jid,vehicle.id])
    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[resale,jid])
    await client.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'vehicle_sale',$3)",[jid,resale,vehicle.name])
    return {...vehicle,paid,resale,depreciation:paid-resale}
  })
}

export async function deliverIfood(jid,taxMultiplier=1){
  await ensureUser(jid)
  const garage=await getMotorcycleGarage(jid)
  if(!garage.length) throw new Error('Você precisa ter bicicleta ou moto para fazer entregas. Use !motos para comprar uma.')
  const tiers={
    bicicleta:{category:'Bike',min:45,max:95}, moto_125:{category:'Básica',min:130,max:230},
    moto_160:{category:'Rápida',min:240,max:380}, moto_300:{category:'Turbo',min:430,max:650},
    moto_600:{category:'Premium',min:780,max:1100}, moto_1000:{category:'Elite',min:1350,max:1900},
  }
  return tx(async client=>{
    const cooldown=6*60
    const cd=await claimCooldown(client,`ifood:frota:${jid}`,cooldown)
    if(!cd.ok) return cd
    const types=[{name:'curta',factor:.85},{name:'média',factor:1},{name:'longa',factor:1.25},{name:'especial',factor:1.5}]
    const details=garage.map(v=>{
      const tier=tiers[v.id]||tiers.bicicleta
      const delivery=types[Math.floor(Math.random()*types.length)]
      const base=Math.floor(tier.min+Math.random()*(tier.max-tier.min+1))
      const fare=Math.max(1,Math.round(base*delivery.factor))
      const tip=Math.random()<.18?Math.max(10,Math.round(fare*(.05+Math.random()*.15))):0
      return {vehicle:v,category:tier.category,delivery:delivery.name,fare,tip,total:fare+tip}
    })
    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const gross=details.reduce((n,x)=>n+x.total,0)*moneyMultiplier
    const taxRate=Math.min(100,10*Math.max(1,Number(taxMultiplier)||1))
    const tax=Math.floor(gross*(taxRate/100)),total=gross-tax
    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[total,jid])
    await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'ifood',$3)`,[jid,gross,`Frota iFood | ${details.length} veículo(s)`])
    if(tax>0) await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'system',$2,'income_tax',$3)`,[jid,tax,`TAXADE te pegou ${taxRate}% | iFood`])
    return {ok:true,details,gross,tax,taxRate,total,cooldown,eventMultiplier:moneyMultiplier}
  })
}

export async function driveUber(jid,taxMultiplier=1){
  await ensureUser(jid)
  const garage=await getGarage(jid)
  if(!garage.length) throw new Error('Você precisa ter pelo menos um carro para trabalhar de Uber. Use !carros para comprar um.')
  const tiers={
    popular:{category:'UberX — Corsa',min:320,max:620},
    sedan_esportivo:{category:'Uber Comfort — HB20',min:650,max:1100},
    suv_premium:{category:'Uber Black — Civic Type R',min:1200,max:1900},
    porsche_911:{category:'Uber Black — Porsche',min:2200,max:3400},
    superesportivo:{category:'Uber Elite — Ferrari',min:4200,max:6200},
    lamborghini_revuelto:{category:'Uber Hyper — Lamborghini',min:6000,max:8500},
    mclaren_p1:{category:'Uber Hyper — McLaren',min:7200,max:10000},
    hipercarro:{category:'Uber Hyper — Bugatti',min:9000,max:13500},
  }
  return tx(async client=>{
    const cooldown=9*60
    const cd=await claimCooldown(client,`uber:${jid}`,cooldown)
    if(!cd.ok) return cd
    const types=[{name:'curta',factor:.85},{name:'média',factor:1},{name:'longa',factor:1.25},{name:'premium',factor:1.6}]
    const details=garage.map(v=>{
      const tier=tiers[v.id]||tiers.popular
      const ride=types[Math.floor(Math.random()*types.length)]
      const base=Math.floor(tier.min+Math.random()*(tier.max-tier.min+1))
      const fare=Math.max(1,Math.round(base*ride.factor))
      const tip=Math.random()<.22?Math.max(20,Math.round(fare*(.08+Math.random()*.17))):0
      return {car:v,category:tier.category,ride:ride.name,fare,tip,total:fare+tip}
    })
    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const gross=details.reduce((n,x)=>n+x.total,0)*moneyMultiplier
    const taxRate=Math.min(100,10*Math.max(1,Number(taxMultiplier)||1))
    const tax=Math.floor(gross*(taxRate/100)),total=gross-tax
    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[total,jid])
    await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'uber',$3)`,[jid,gross,`Frota Uber | ${details.length} carro(s)`])
    if(tax>0) await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'system',$2,'income_tax',$3)`,[jid,tax,`TAXADE te pegou ${taxRate}% | Uber`])
    return {ok:true,details,gross,tax,taxRate,total,cooldown,eventMultiplier:moneyMultiplier}
  })
}

export async function buyCar(jid,input){
  await ensureUser(jid)
  const car=resolveCatalog(input,CARS)
  if(!car) throw new Error('Carro inválido.')

  return tx(async c=>{
    const owned=await c.query('SELECT car_id FROM user_cars WHERE jid=$1 FOR UPDATE',[jid])
    if(owned.rows.some(r=>r.car_id===car.id)) throw new Error('Você já possui esse carro.')
    if(owned.rows.length>=5) throw new Error('Sua garagem está cheia: limite atual de 5 carros.')

    const w=await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    if(Number(w.rows[0]?.cash||0)<car.price) throw new Error('Saldo insuficiente na carteira.')

    await c.query('UPDATE wallets SET cash=cash-$1 WHERE jid=$2',[car.price,jid])
    await c.query(
      'INSERT INTO user_cars(jid,car_id,price_paid) VALUES($1,$2,$3)',
      [jid,car.id,car.price]
    )
    return car
  })
}

function sqlCase(column,catalog){
  return 'CASE '+catalog.map(x=>`WHEN ${column}='${x.id}' THEN ${x.price}`).join(' ')+' ELSE 0 END'
}
const houseCase=sqlCase('h.house_id',HOUSES)
const carCase=sqlCase('uc.car_id',CARS)
const motorcycleCase=sqlCase('um.motorcycle_id',MOTORCYCLES)

export async function getPatrimony(jid){
  await ensureUser(jid)
  const {rows}=await db.query(`
    WITH inv AS (
      SELECT i.jid,COALESCE(SUM(i.quantity*CASE
        WHEN it.price>0 THEN it.price WHEN it.rarity='legendary' THEN 100000
        WHEN it.rarity='epic' THEN 25000 WHEN it.rarity='rare' THEN 8000 ELSE 1000 END),0)::bigint AS value
      FROM inventories i JOIN items it ON it.id=i.item_id
      WHERE i.jid=$1
      GROUP BY i.jid
    ),
    cars AS (
      SELECT uc.jid,COALESCE(SUM(${carCase}),0)::bigint AS value
      FROM user_cars uc
      WHERE uc.jid=$1
      GROUP BY uc.jid
    ),
    motorcycles AS (
      SELECT um.jid,COALESCE(SUM(${motorcycleCase}),0)::bigint AS value
      FROM user_motorcycles um
      WHERE um.jid=$1
      GROUP BY um.jid
    ),
    businesses AS (
      SELECT ub.jid,COALESCE(SUM(ub.price_paid + CASE GREATEST(1,COALESCE(ub.level,1))
        WHEN 1 THEN 0
        WHEN 2 THEN FLOOR(ub.price_paid*0.75)
        WHEN 3 THEN FLOOR(ub.price_paid*0.75)+FLOOR(ub.price_paid*1.00)
        WHEN 4 THEN FLOOR(ub.price_paid*0.75)+FLOOR(ub.price_paid*1.00)+FLOOR(ub.price_paid*1.25)
        ELSE FLOOR(ub.price_paid*0.75)+FLOOR(ub.price_paid*1.00)+FLOOR(ub.price_paid*1.25)+FLOOR(ub.price_paid*1.50)
      END),0)::bigint AS value
      FROM user_businesses ub WHERE ub.jid=$1 GROUP BY ub.jid
    ),
    home AS (
      SELECT h.jid,(${houseCase})::bigint AS value
      FROM user_homes h
      WHERE h.jid=$1
    )
    SELECT u.jid,u.push_name,w.cash,w.bank,
           COALESCE(inv.value,0)::bigint AS inventory_value,
           COALESCE(cars.value,0)::bigint AS cars_value,
           COALESCE(motorcycles.value,0)::bigint AS motorcycles_value,
           COALESCE(businesses.value,0)::bigint AS businesses_value,
           COALESCE(home.value,0)::bigint AS home_value
    FROM users u
    JOIN wallets w ON w.jid=u.jid
    LEFT JOIN inv ON inv.jid=u.jid
    LEFT JOIN cars ON cars.jid=u.jid
    LEFT JOIN motorcycles ON motorcycles.jid=u.jid
    LEFT JOIN businesses ON businesses.jid=u.jid
    LEFT JOIN home ON home.jid=u.jid
    WHERE u.jid=$1
  `,[jid])
  const r=rows[0]
  const total=['cash','bank','inventory_value','cars_value','motorcycles_value','businesses_value','home_value']
    .reduce((a,k)=>a+Number(r?.[k]||0),0)
  return {...r,total}
}

export async function patrimonyLeaderboard(limit=10){
  const {rows}=await db.query(`
    WITH inv AS (
      SELECT i.jid,COALESCE(SUM(i.quantity*CASE
        WHEN it.price>0 THEN it.price WHEN it.rarity='legendary' THEN 100000
        WHEN it.rarity='epic' THEN 25000 WHEN it.rarity='rare' THEN 8000 ELSE 1000 END),0)::bigint AS value
      FROM inventories i JOIN items it ON it.id=i.item_id GROUP BY i.jid
    ),
    cars AS (
      SELECT uc.jid,COALESCE(SUM(${carCase}),0)::bigint AS value FROM user_cars uc GROUP BY uc.jid
    ),
    motorcycles AS (
      SELECT um.jid,COALESCE(SUM(${motorcycleCase}),0)::bigint AS value FROM user_motorcycles um GROUP BY um.jid
    ),
    businesses AS (
      SELECT ub.jid,COALESCE(SUM(ub.price_paid + CASE GREATEST(1,COALESCE(ub.level,1))
        WHEN 1 THEN 0
        WHEN 2 THEN FLOOR(ub.price_paid*0.75)
        WHEN 3 THEN FLOOR(ub.price_paid*0.75)+FLOOR(ub.price_paid*1.00)
        WHEN 4 THEN FLOOR(ub.price_paid*0.75)+FLOOR(ub.price_paid*1.00)+FLOOR(ub.price_paid*1.25)
        ELSE FLOOR(ub.price_paid*0.75)+FLOOR(ub.price_paid*1.00)+FLOOR(ub.price_paid*1.25)+FLOOR(ub.price_paid*1.50)
      END),0)::bigint AS value FROM user_businesses ub GROUP BY ub.jid
    ),
    home AS (
      SELECT h.jid,(${houseCase})::bigint AS value FROM user_homes h
    )
    SELECT u.jid,u.push_name,
      (COALESCE(w.cash,0)+COALESCE(w.bank,0)+COALESCE(inv.value,0)+COALESCE(cars.value,0)+
       COALESCE(motorcycles.value,0)+COALESCE(businesses.value,0)+COALESCE(home.value,0))::bigint AS total
    FROM users u JOIN wallets w ON w.jid=u.jid
    LEFT JOIN inv ON inv.jid=u.jid LEFT JOIN cars ON cars.jid=u.jid
    LEFT JOIN motorcycles ON motorcycles.jid=u.jid LEFT JOIN businesses ON businesses.jid=u.jid
    LEFT JOIN home ON home.jid=u.jid
    ORDER BY total DESC,u.created_at ASC LIMIT $1
  `,[limit])
  return rows
}

export async function getBusinesses(jid){
  await ensureUser(jid)
  const {rows}=await db.query('SELECT business_id,price_paid,acquired_at,last_collected_at,level FROM user_businesses WHERE jid=$1 ORDER BY acquired_at',[jid])
  return rows.map(r=>({...BUSINESSES.find(b=>b.id===r.business_id),...r,id:r.business_id}))
}

export async function buyBusiness(jid,input){
  await ensureUser(jid)
  const business=resolveCatalog(input,BUSINESSES)
  if(!business) throw new Error('Negócio inválido. Use !negocios para ver as opções.')
  return tx(async client=>{
    const own=await client.query('SELECT 1 FROM user_businesses WHERE jid=$1 AND business_id=$2 FOR UPDATE',[jid,business.id])
    if(own.rows.length) throw new Error('Você já possui esse negócio.')
    const wallet=await client.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    if(Number(wallet.rows[0]?.cash||0)<business.price) throw new Error('Saldo insuficiente para comprar esse negócio.')
    await client.query('UPDATE wallets SET cash=cash-$1 WHERE jid=$2',[business.price,jid])
    const now=Math.floor(Date.now()/1000)
    await client.query('INSERT INTO user_businesses(jid,business_id,price_paid,acquired_at,last_collected_at) VALUES($1,$2,$3,$4,$4)',[jid,business.id,business.price,now])
    await client.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'business_purchase',$3)",[jid,business.price,business.name])
    return business
  })
}

export async function collectBusinesses(jid){
  await ensureUser(jid)
  return tx(async client=>{
    const {rows}=await client.query('SELECT * FROM user_businesses WHERE jid=$1 FOR UPDATE',[jid])
    if(!rows.length) throw new Error('Você ainda não possui negócios. Use !negocios.')
    const now=Math.floor(Date.now()/1000)
    let total=0
    const details=[]
    for(const row of rows){
      const b=BUSINESSES.find(x=>x.id===row.business_id)
      if(!b) continue
      const elapsed=Math.max(0,now-Number(row.last_collected_at||now))
      const level=Math.max(1,Number(row.level||1))
      const multiplier=1+(level-1)*0.25
      const capacityHours=b.capacityHours+(level-1)
      const capped=Math.min(elapsed,capacityHours*3600)
      const earned=Math.floor((capped/3600)*b.profitHour*multiplier)
      if(earned>0){
        total+=earned
        details.push({name:b.name,earned})
        // Preserve fractional-hour progress while discarding time beyond storage capacity.
        const remainder=elapsed<=(capacityHours*3600) ? elapsed%3600 : 0
        await client.query('UPDATE user_businesses SET last_collected_at=$1 WHERE id=$2',[now-remainder,row.id])
      }
    }
    if(total<=0) return {total:0,gross:0,tax:0,taxRate:10,details}
    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const gross=total*moneyMultiplier,tax=Math.floor(gross*.10),net=gross-tax
    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[net,jid])
    await client.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'business_profit','lucro bruto dos negócios')",[jid,gross])
    if(tax>0) await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'system',$2,'income_tax','TAXADE te pegou 10% | negócios')`,[jid,tax])
    return {total:net,gross,tax,taxRate:10,details,eventMultiplier:moneyMultiplier}
  })
}


export async function upgradeBusiness(jid,input){
  await ensureUser(jid)
  const business=resolveCatalog(input,BUSINESSES)
  if(!business) throw new Error('Negócio inválido. Use !meusnegocios.')
  return tx(async client=>{
    const own=await client.query('SELECT * FROM user_businesses WHERE jid=$1 AND business_id=$2 FOR UPDATE',[jid,business.id])
    if(!own.rows.length) throw new Error('Você não possui esse negócio.')
    const level=Math.max(1,Number(own.rows[0].level||1))
    if(level>=5) throw new Error('Esse negócio já está no nível máximo (5).')
    const cost=Math.floor(business.price*(0.5+level*0.25))
    const wallet=await client.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    if(Number(wallet.rows[0]?.cash||0)<cost) throw new Error('Saldo insuficiente. Upgrade custa R$ '+cost.toLocaleString('pt-BR')+'.')
    await client.query('UPDATE wallets SET cash=cash-$1 WHERE jid=$2',[cost,jid])
    await client.query('UPDATE user_businesses SET level=level+1 WHERE jid=$1 AND business_id=$2',[jid,business.id])
    await client.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'business_upgrade',$3)",[jid,cost,business.name])
    const newLevel=level+1
    return {...business,level:newLevel,cost,multiplier:1+(newLevel-1)*0.25,capacityHours:business.capacityHours+(newLevel-1)}
  })
}


function groupWeekKey(){
  const d=new Date(), onejan=new Date(Date.UTC(d.getUTCFullYear(),0,1))
  const week=Math.ceil((((d-onejan)/86400000)+onejan.getUTCDay()+1)/7)
  return d.getUTCFullYear()+'-W'+String(week).padStart(2,'0')
}

export async function getGroupMission(chatJid){
  const week=groupWeekKey()
  const choices=[
    {type:'work',title:'Trabalhar juntos',target:40,reward:50000},
    {type:'battle',title:'Batalhar juntos',target:25,reward:60000},
    {type:'quiz',title:'Acertar quizzes juntos',target:30,reward:55000}
  ]
  const seed=[...chatJid+week].reduce((a,x)=>a+x.charCodeAt(0),0)
  const m=choices[seed%choices.length]
  await db.query(`INSERT INTO group_missions(chat_jid,week_key,mission_type,title,target,reward_cash)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(chat_jid,week_key) DO NOTHING`,
    [chatJid,week,m.type,m.title,m.target,m.reward])
  const {rows}=await db.query('SELECT * FROM group_missions WHERE chat_jid=$1 AND week_key=$2',[chatJid,week])
  return rows[0]
}

export async function progressGroupMission(chatJid,jid,type,amount=1){
  if(!String(chatJid).endsWith('@g.us')) return null
  const m=await getGroupMission(chatJid)
  if(m.mission_type!==type || m.completed) return m
  return tx(async client=>{
    const {rows}=await client.query('SELECT * FROM group_missions WHERE chat_jid=$1 AND week_key=$2 FOR UPDATE',[chatJid,m.week_key])
    const cur=rows[0]; if(cur.completed) return cur
    const add=Math.max(1,Number(amount)||1)
    await client.query(`INSERT INTO group_mission_members(chat_jid,week_key,jid,contribution)
      VALUES($1,$2,$3,$4) ON CONFLICT(chat_jid,week_key,jid)
      DO UPDATE SET contribution=group_mission_members.contribution+EXCLUDED.contribution`,[chatJid,m.week_key,jid,add])
    const next=Math.min(Number(cur.target),Number(cur.progress)+add), done=next>=Number(cur.target)
    const r=await client.query('UPDATE group_missions SET progress=$1,completed=$2 WHERE chat_jid=$3 AND week_key=$4 RETURNING *',[next,done,chatJid,m.week_key])
    return r.rows[0]
  })
}

export async function getGroupMissionLeaderboard(chatJid){
  const m=await getGroupMission(chatJid)
  const {rows}=await db.query(`
    SELECT gm.jid,gm.contribution,u.push_name
    FROM group_mission_members gm
    LEFT JOIN users u ON u.jid=gm.jid
    WHERE gm.chat_jid=$1 AND gm.week_key=$2 AND gm.contribution>0
    ORDER BY gm.contribution DESC,gm.jid
  `,[chatJid,m.week_key])
  const total=rows.reduce((a,r)=>a+Number(r.contribution||0),0)
  return {mission:m,total,rows:rows.map((r,i)=>({...r,position:i+1,share:total?Math.floor(Number(m.reward_cash)*Number(r.contribution)/total):0}))}
}

export async function claimGroupMission(chatJid,jid){
  await ensureUser(jid)
  const board=await getGroupMissionLeaderboard(chatJid)
  const m=board.mission
  if(!m.completed) throw new Error('A missão coletiva ainda não foi concluída.')
  return tx(async client=>{
    const mem=await client.query('SELECT * FROM group_mission_members WHERE chat_jid=$1 AND week_key=$2 AND jid=$3 FOR UPDATE',[chatJid,m.week_key,jid])
    if(!mem.rows.length || Number(mem.rows[0].contribution)<1) throw new Error('Você precisa ter contribuído para essa missão.')
    if(mem.rows[0].claimed) throw new Error('Você já resgatou sua recompensa.')
    const contribution=Number(mem.rows[0].contribution)
    const total=Math.max(1,board.total)
    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const share=Math.max(1,Math.floor(Number(m.reward_cash)*contribution/total))*moneyMultiplier
    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[share,jid])
    await client.query('UPDATE group_mission_members SET claimed=TRUE WHERE chat_jid=$1 AND week_key=$2 AND jid=$3',[chatJid,m.week_key,jid])
    await client.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'group_mission','missão coletiva proporcional')",[jid,share])
    return {share,contribution,total,mission:m,leaderboard:board.rows}
  })
}

export async function maybeSpawnGroupEvent(chatJid){
  if(!String(chatJid).endsWith('@g.us')) return null
  return tx(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`group-event:${chatJid}`])
    const now=Math.floor(Date.now()/1000)
    const {rows}=await client.query('SELECT * FROM group_events WHERE chat_jid=$1 FOR UPDATE',[chatJid])
    const old=rows[0]
    if(old && !old.claimed_by && Number(old.expires_at)>now) return null
    if(old && Number(old.spawned_at)>now-1800) return null
    if(Math.random()>.035) return null
    const events=[
      {type:'maleta',reward:5000,text:'💼 Uma maleta de dinheiro apareceu!'},
      {type:'pix',reward:8000,text:'💸 Um PIX misterioso caiu no grupo!'},
      {type:'tesouro',reward:12000,text:'🧰 Um pequeno tesouro apareceu!'}
    ]
    const e=events[Math.floor(Math.random()*events.length)]
    await client.query(`INSERT INTO group_events(chat_jid,event_type,reward_cash,spawned_at,expires_at,claimed_by)
      VALUES($1,$2,$3,$4,$5,NULL) ON CONFLICT(chat_jid) DO UPDATE SET
      event_type=EXCLUDED.event_type,reward_cash=EXCLUDED.reward_cash,spawned_at=EXCLUDED.spawned_at,
      expires_at=EXCLUDED.expires_at,claimed_by=NULL`,[chatJid,e.type,e.reward,now,now+120])
    return {...e,expiresAt:now+120}
  })
}

export async function claimGroupEvent(chatJid,jid){
  await ensureUser(jid)
  const now=Math.floor(Date.now()/1000)
  return tx(async client=>{
    const {rows}=await client.query('SELECT * FROM group_events WHERE chat_jid=$1 FOR UPDATE',[chatJid])
    const e=rows[0]
    if(!e || e.claimed_by || Number(e.expires_at)<now) throw new Error('Não há evento disponível agora.')
    await client.query('UPDATE group_events SET claimed_by=$1 WHERE chat_jid=$2',[jid,chatJid])
    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[e.reward_cash,jid])
    await client.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'group_event',$3)",[jid,e.reward_cash,e.event_type])
    return e
  })
}
