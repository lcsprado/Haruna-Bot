import crypto from 'node:crypto'
import { db, ensureUser } from './db.js'

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
  {id:'popular',name:'Carro Popular',price:18000},
  {id:'sedan_esportivo',name:'Sedan Esportivo',price:60000},
  {id:'suv_premium',name:'SUV Premium',price:160000},
  {id:'superesportivo',name:'Superesportivo',price:500000},
  {id:'hipercarro',name:'Hipercarro',price:2000000},
]

export const MOTORCYCLES=[
  {id:'bicicleta',name:'Bicicleta',price:1500},
  {id:'moto_125',name:'Moto 125cc',price:9000},
  {id:'moto_160',name:'Moto 160cc',price:16000},
  {id:'moto_300',name:'Moto 300cc',price:35000},
  {id:'moto_600',name:'Moto 600cc',price:90000},
  {id:'moto_1000',name:'Superbike 1000cc',price:220000},
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

    const cash=r.rows.reduce((a,m)=>a+Number(m.reward_cash||0),0)
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

    return {claimed:r.rows.length,cash,boxes}
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
    if(owned.rows.length>=5) throw new Error('Sua garagem de motos está cheia: limite atual de 5 motos.')

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

export async function deliverIfood(jid,mode='moto'){
  await ensureUser(jid)
  const garage=await getMotorcycleGarage(jid)
  if(!garage.length) throw new Error('Você precisa ter bicicleta ou moto para fazer entregas. Use !motos para comprar uma.')

  const candidates=mode==='bike'
    ? garage.filter(v=>v.id==='bicicleta')
    : garage.filter(v=>v.id!=='bicicleta')
  if(!candidates.length){
    if(mode==='bike') throw new Error('Você precisa ter uma Bicicleta para usar !ifoodbike. Veja !motos.')
    throw new Error('Você precisa ter uma moto para usar !ifood. Veja !motos.')
  }
  const best=candidates.reduce((a,b)=>(Number(b.price||0)>Number(a.price||0)?b:a))
  const tiers={
    // Faixas não se sobrepõem: veículo mais caro sempre tem potencial de ganho claramente maior.
    bicicleta:{category:'Entrega de bicicleta',min:30,max:75},
    moto_125:{category:'Entrega básica',min:100,max:190},
    moto_160:{category:'Entrega rápida',min:190,max:310},
    moto_300:{category:'Entrega turbo',min:340,max:520},
    moto_600:{category:'Entrega premium',min:620,max:900},
    moto_1000:{category:'Entrega elite',min:1100,max:1550},
  }
  const tier=tiers[best.id]||tiers.bicicleta

  return tx(async client=>{
    const key=`ifood:${mode==='bike'?'bike':'moto'}:${jid}`
    const now=Math.floor(Date.now()/1000)
    const cd=await client.query('SELECT expires_at FROM cooldowns WHERE key=$1 FOR UPDATE',[key])
    const cooldown=best.id==='bicicleta' ? 3*60 : 6*60
    if(cd.rows[0] && Number(cd.rows[0].expires_at)>now){
      const remaining=Number(cd.rows[0].expires_at)-now
      if(remaining>cooldown){
        const corrected=now+cooldown
        await client.query('UPDATE cooldowns SET expires_at=$1 WHERE key=$2',[corrected,key])
        return {ok:false,remaining:cooldown}
      }
      return {ok:false,remaining}
    }
    const expires=now+cooldown
    await client.query(`
      INSERT INTO cooldowns(key,expires_at) VALUES($1,$2)
      ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at
    `,[key,expires])

    const types=[
      {name:'Entrega curta',factor:.85,weight:40},
      {name:'Entrega média',factor:1,weight:40},
      {name:'Entrega longa',factor:1.25,weight:17},
      {name:'Pedido especial',factor:1.5,weight:3},
    ]
    let roll=Math.random()*100, delivery=types[0]
    for(const t of types){ roll-=t.weight; if(roll<=0){delivery=t;break} }

    const base=Math.floor(tier.min+Math.random()*(tier.max-tier.min+1))
    const fare=Math.max(1,Math.round(base*delivery.factor))
    const tip=Math.random()<.18 ? Math.max(10,Math.round(fare*(.05+Math.random()*.15))) : 0
    const total=fare+tip

    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[total,jid])
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'ifood',$3)
    `,[jid,total,`${tier.category} | ${delivery.name} | ${best.name}${tip? ` | gorjeta:${tip}`:''}`])
    return {ok:true,motorcycle:best,category:tier.category,delivery:delivery.name,fare,tip,total,cooldown}
  })
}

export async function driveUber(jid){
  await ensureUser(jid)

  const garage=await getGarage(jid)
  if(!garage.length) throw new Error('Você precisa ter pelo menos um carro para trabalhar de Uber. Use !carros para comprar um.')

  // O melhor carro da garagem define a categoria disponível e o teto da corrida.
  const best=garage.reduce((a,b)=>(Number(b.price||0)>Number(a.price||0)?b:a))
  const tiers={
    popular:{category:'UberX',min:260,max:520},
    sedan_esportivo:{category:'Comfort',min:520,max:900},
    suv_premium:{category:'Comfort+',min:900,max:1450},
    superesportivo:{category:'Black',min:1700,max:2700},
    hipercarro:{category:'Black Premium',min:4000,max:6000},
  }
  const tier=tiers[best.id]||tiers.popular

  return tx(async client=>{
    const key=`uber:${jid}`
    const now=Math.floor(Date.now()/1000)
    const cd=await client.query('SELECT expires_at FROM cooldowns WHERE key=$1 FOR UPDATE',[key])
    const cooldown=9*60
    if(cd.rows[0] && Number(cd.rows[0].expires_at)>now){
      // Corridas criadas antes do balanceamento podiam guardar 25 min.
      // Nunca deixe um cooldown legado ultrapassar a regra atual de 9 min.
      const remaining=Number(cd.rows[0].expires_at)-now
      if(remaining>cooldown){
        const corrected=now+cooldown
        await client.query('UPDATE cooldowns SET expires_at=$1 WHERE key=$2',[corrected,key])
        return {ok:false,remaining:cooldown}
      }
      return {ok:false,remaining}
    }

    // Uma corrida a cada 9 minutos.
    const expires=now+cooldown
    await client.query(`
      INSERT INTO cooldowns(key,expires_at) VALUES($1,$2)
      ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at
    `,[key,expires])

    const types=[
      {name:'Corrida curta',factor:.85,weight:35},
      {name:'Corrida média',factor:1,weight:40},
      {name:'Corrida longa',factor:1.25,weight:20},
      {name:'Corrida premium',factor:1.6,weight:5},
    ]
    let roll=Math.random()*100
    let ride=types[0]
    for(const t of types){
      roll-=t.weight
      if(roll<=0){ride=t;break}
    }

    const base=Math.floor(tier.min+Math.random()*(tier.max-tier.min+1))
    const fare=Math.max(1,Math.round(base*ride.factor))
    const tip=Math.random()<.22 ? Math.max(20,Math.round(fare*(.08+Math.random()*.17))) : 0
    const total=fare+tip

    await client.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[total,jid])
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'uber',$3)
    `,[jid,total,`${tier.category} | ${ride.name} | ${best.name}${tip? ` | gorjeta:${tip}`:''}`])

    return {ok:true,car:best,category:tier.category,ride:ride.name,fare,tip,total,cooldown}
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
      SELECT i.jid,COALESCE(SUM(i.quantity*it.price),0)::bigint AS value
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
    home AS (
      SELECT h.jid,(${houseCase})::bigint AS value
      FROM user_homes h
      WHERE h.jid=$1
    )
    SELECT u.jid,u.push_name,w.cash,w.bank,
           COALESCE(inv.value,0)::bigint AS inventory_value,
           COALESCE(cars.value,0)::bigint AS cars_value,
           COALESCE(motorcycles.value,0)::bigint AS motorcycles_value,
           COALESCE(home.value,0)::bigint AS home_value
    FROM users u
    JOIN wallets w ON w.jid=u.jid
    LEFT JOIN inv ON inv.jid=u.jid
    LEFT JOIN cars ON cars.jid=u.jid
    LEFT JOIN motorcycles ON motorcycles.jid=u.jid
    LEFT JOIN home ON home.jid=u.jid
    WHERE u.jid=$1
  `,[jid])
  const r=rows[0]
  const total=['cash','bank','inventory_value','cars_value','motorcycles_value','home_value']
    .reduce((a,k)=>a+Number(r?.[k]||0),0)
  return {...r,total}
}

export async function patrimonyLeaderboard(limit=10){
  const {rows}=await db.query(`
    WITH inv AS (
      SELECT i.jid,COALESCE(SUM(i.quantity*it.price),0)::bigint AS value
      FROM inventories i JOIN items it ON it.id=i.item_id
      GROUP BY i.jid
    ),
    cars AS (
      SELECT uc.jid,COALESCE(SUM(${carCase}),0)::bigint AS value
      FROM user_cars uc
      GROUP BY uc.jid
    ),
    home AS (
      SELECT h.jid,(${houseCase})::bigint AS value
      FROM user_homes h
    )
    SELECT u.jid,u.push_name,
           (COALESCE(w.cash,0)+COALESCE(w.bank,0)+
            COALESCE(inv.value,0)+COALESCE(cars.value,0)+COALESCE(home.value,0))::bigint AS total
    FROM users u
    JOIN wallets w ON w.jid=u.jid
    LEFT JOIN inv ON inv.jid=u.jid
    LEFT JOIN cars ON cars.jid=u.jid
    LEFT JOIN home ON home.jid=u.jid
    ORDER BY total DESC,u.created_at ASC
    LIMIT $1
  `,[limit])
  return rows
}
