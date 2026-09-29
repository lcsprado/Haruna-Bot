import crypto from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada')

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
})

db.on('error', err => console.error('[Neon] pool error', err))

const nowSql = '(EXTRACT(EPOCH FROM NOW())::BIGINT)'

async function transaction(fn) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function initDatabase() {
  await db.query('SELECT 1')
  console.log('[Neon] banco conectado')

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      jid TEXT PRIMARY KEY,
      pn TEXT UNIQUE,
      push_name TEXT NOT NULL DEFAULT '',
      level INTEGER NOT NULL DEFAULT 1,
      exp INTEGER NOT NULL DEFAULT 0,
      premium BOOLEAN NOT NULL DEFAULT FALSE,
      premium_exp BIGINT NOT NULL DEFAULT 0,
      banned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS wallets (
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      cash BIGINT NOT NULL DEFAULT 0,
      bank BIGINT NOT NULL DEFAULT 0,
      bank_limit BIGINT NOT NULL DEFAULT 10000,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS stats (
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      hp INTEGER NOT NULL DEFAULT 100,
      max_hp INTEGER NOT NULL DEFAULT 100,
      atk INTEGER NOT NULL DEFAULT 10,
      def INTEGER NOT NULL DEFAULT 5,
      spd INTEGER NOT NULL DEFAULT 10,
      weapon_id TEXT,
      armor_id TEXT,
      win INTEGER NOT NULL DEFAULT 0,
      loss INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'misc',
      price BIGINT NOT NULL DEFAULT 0,
      sellable BOOLEAN NOT NULL DEFAULT TRUE,
      stackable BOOLEAN NOT NULL DEFAULT TRUE,
      rarity TEXT NOT NULL DEFAULT 'common',
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS inventories (
      id BIGSERIAL PRIMARY KEY,
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id),
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      UNIQUE(jid, item_id)
    );

    CREATE TABLE IF NOT EXISTS cooldowns (
      key TEXT PRIMARY KEY,
      expires_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      from_jid TEXT NOT NULL,
      to_jid TEXT,
      amount BIGINT NOT NULL,
      type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS trevo_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS subscription_orders (
      code TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      requester_jid TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      expires_at BIGINT NOT NULL,
      approved_at BIGINT,
      approved_by TEXT,
      cancelled_at BIGINT
    );

    CREATE INDEX IF NOT EXISTS subscription_orders_chat_idx
      ON subscription_orders(chat_jid, status);

    CREATE TABLE IF NOT EXISTS group_licenses (
      chat_jid TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'blocked',
      plan TEXT NOT NULL DEFAULT 'trial',
      trial_started_at BIGINT,
      paid_until BIGINT,
      activated_by TEXT,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS auth_creds (
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, key)
    );

    CREATE TABLE IF NOT EXISTS auth_keys (
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      id TEXT NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, type, id)
    );
  `)

  await db.query(`
    INSERT INTO trevo_settings(key,value)
    VALUES
      ('launch_price','2'::jsonb),
      ('pix_key','""'::jsonb),
      ('pix_name','"Trevo"'::jsonb),
      ('payment_link','"https://mpago.la/1Aqm14o"'::jsonb)
    ON CONFLICT(key) DO NOTHING
  `)

  const starterItems = [
    ['pocao_p','Poção Pequena','Recupera energia para futuras funções RPG.','consumable',500,'common'],
    ['pocao_m','Poção Média','Poção intermediária.','consumable',1200,'uncommon'],
    ['espada_madeira','Espada de Madeira','Arma inicial do Trevo.','weapon',1500,'common'],
    ['espada_ferro','Espada de Ferro','Arma mais forte.','weapon',5000,'uncommon'],
    ['armadura_couro','Armadura de Couro','Proteção inicial.','armor',2000,'common'],
    ['armadura_ferro','Armadura de Ferro','Proteção reforçada.','armor',6500,'uncommon'],
    ['caixa_sorte','Caixa da Sorte','Item especial para futuras recompensas.','special',3000,'rare'],
  ]

  for (const item of starterItems) {
    await db.query(`
      INSERT INTO items (id,name,description,category,price,rarity)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT(id) DO UPDATE
      SET name=EXCLUDED.name, description=EXCLUDED.description,
          category=EXCLUDED.category, price=EXCLUDED.price, rarity=EXCLUDED.rarity
    `, item)
  }
}

export async function ensureUser(jid, pushName='') {
  await db.query(`
    INSERT INTO users (jid, push_name)
    VALUES ($1,$2)
    ON CONFLICT(jid) DO UPDATE
      SET push_name = CASE WHEN EXCLUDED.push_name <> '' THEN EXCLUDED.push_name ELSE users.push_name END,
          updated_at = ${nowSql}
  `, [jid, pushName])

  await db.query('INSERT INTO wallets (jid) VALUES ($1) ON CONFLICT(jid) DO NOTHING', [jid])
  await db.query('INSERT INTO stats (jid) VALUES ($1) ON CONFLICT(jid) DO NOTHING', [jid])
}

export async function getProfile(jid) {
  const { rows } = await db.query(`
    SELECT u.jid,u.push_name,u.level,u.exp,u.premium,
           w.cash,w.bank,w.bank_limit,
           s.hp,s.max_hp,s.atk,s.def,s.spd,s.weapon_id,s.armor_id,s.win,s.loss
    FROM users u
    JOIN wallets w ON w.jid=u.jid
    JOIN stats s ON s.jid=u.jid
    WHERE u.jid=$1
  `, [jid])
  return rows[0] ?? null
}

async function claimCooldown(key, seconds) {
  return transaction(async client => {
    const now = Math.floor(Date.now()/1000)
    const r = await client.query('SELECT expires_at FROM cooldowns WHERE key=$1 FOR UPDATE', [key])
    if (r.rows[0] && Number(r.rows[0].expires_at) > now) {
      return { ok:false, remaining:Number(r.rows[0].expires_at)-now }
    }
    const expires = now + seconds
    await client.query(`
      INSERT INTO cooldowns (key,expires_at) VALUES ($1,$2)
      ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at
    `, [key,expires])
    return { ok:true, expires }
  })
}

export async function claimDaily(jid) {
  const cd = await claimCooldown(`daily:${jid}`, 20*60*60)
  if (!cd.ok) return cd

  await transaction(async client => {
    await client.query('UPDATE wallets SET cash=cash+5000, updated_at='+nowSql+' WHERE jid=$1',[jid])
    await client.query(`
      INSERT INTO transactions (from_jid,to_jid,amount,type,note)
      VALUES ('system',$1,5000,'reward','daily')
    `,[jid])
  })
  return { ok:true, amount:5000 }
}

export async function work(jid) {
  const cd = await claimCooldown(`work:${jid}`, 30*60)
  if (!cd.ok) return cd

  const jobs = [
    ['entregador',500,1000],
    ['ajudante de obra',700,1400],
    ['programador freelancer',1000,2200],
    ['motorista',650,1500],
    ['vendedor',600,1700],
  ]
  const job = jobs[Math.floor(Math.random()*jobs.length)]
  const amount = Math.floor(job[1] + Math.random()*(job[2]-job[1]+1))

  await transaction(async client => {
    await client.query('UPDATE wallets SET cash=cash+$1, updated_at='+nowSql+' WHERE jid=$2',[amount,jid])
    await client.query(`
      INSERT INTO transactions (from_jid,to_jid,amount,type,note)
      VALUES ('system',$1,$2,'work',$3)
    `,[jid,amount,job[0]])
  })

  return { ok:true, amount, job:job[0] }
}

export async function deposit(jid, amount) {
  amount = Number(amount)
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor inválido.')

  return transaction(async client => {
    const { rows } = await client.query('SELECT * FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const w=rows[0]
    if (!w || Number(w.cash) < amount) throw new Error('Saldo em carteira insuficiente.')
    if (Number(w.bank)+amount > Number(w.bank_limit)) throw new Error('Esse depósito ultrapassa seu limite bancário.')

    await client.query(`
      UPDATE wallets
      SET cash=cash-$1, bank=bank+$1, updated_at=${nowSql}
      WHERE jid=$2
    `,[amount,jid])
    return { cash:Number(w.cash)-amount, bank:Number(w.bank)+amount }
  })
}

export async function withdraw(jid, amount) {
  amount = Number(amount)
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor inválido.')

  return transaction(async client => {
    const { rows } = await client.query('SELECT * FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const w=rows[0]
    if (!w || Number(w.bank) < amount) throw new Error('Saldo no banco insuficiente.')

    await client.query(`
      UPDATE wallets
      SET bank=bank-$1, cash=cash+$1, updated_at=${nowSql}
      WHERE jid=$2
    `,[amount,jid])
    return { cash:Number(w.cash)+amount, bank:Number(w.bank)-amount }
  })
}

export async function transfer(fromJid, toJid, amount) {
  amount = Number(amount)
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor inválido.')
  if (fromJid === toJid) throw new Error('Você não pode transferir para si mesmo.')

  const fee = Math.max(1, Math.floor(amount*0.02))
  const total = amount + fee

  await ensureUser(toJid)

  return transaction(async client => {
    const { rows } = await client.query(
      'SELECT jid,cash FROM wallets WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',
      [[fromJid,toJid]]
    )
    const from = rows.find(r=>r.jid===fromJid)
    if (!from || Number(from.cash) < total) throw new Error(`Você precisa de R$ ${total.toLocaleString('pt-BR')} contando a taxa de 2%.`)

    await client.query('UPDATE wallets SET cash=cash-$1, updated_at='+nowSql+' WHERE jid=$2',[total,fromJid])
    await client.query('UPDATE wallets SET cash=cash+$1, updated_at='+nowSql+' WHERE jid=$2',[amount,toJid])
    await client.query(`
      INSERT INTO transactions (from_jid,to_jid,amount,type,note)
      VALUES ($1,$2,$3,'transfer',$4)
    `,[fromJid,toJid,amount,`taxa:${fee}`])

    return { amount, fee, total }
  })
}

export async function getShop() {
  const { rows } = await db.query(`
    SELECT id,name,description,category,price,rarity
    FROM items
    WHERE price > 0
    ORDER BY category,price
  `)
  return rows
}

export async function buyItem(jid, itemId, qty=1) {
  qty = Number(qty)
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('Quantidade inválida.')

  return transaction(async client => {
    const itemR = await client.query('SELECT * FROM items WHERE id=$1',[itemId])
    const item=itemR.rows[0]
    if (!item) throw new Error('Item não encontrado.')

    const total = Number(item.price)*qty
    const walletR = await client.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const wallet=walletR.rows[0]
    if (!wallet || Number(wallet.cash) < total) throw new Error('Saldo insuficiente para essa compra.')

    await client.query('UPDATE wallets SET cash=cash-$1, updated_at='+nowSql+' WHERE jid=$2',[total,jid])
    await client.query(`
      INSERT INTO inventories (jid,item_id,quantity)
      VALUES ($1,$2,$3)
      ON CONFLICT(jid,item_id)
      DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity
    `,[jid,itemId,qty])
    await client.query(`
      INSERT INTO transactions (from_jid,to_jid,amount,type,note)
      VALUES ($1,'shop',$2,'purchase',$3)
    `,[jid,total,`${itemId} x${qty}`])

    return { item, qty, total }
  })
}

export async function getInventory(jid) {
  const { rows } = await db.query(`
    SELECT i.item_id,i.quantity,it.name,it.category,it.rarity
    FROM inventories i
    JOIN items it ON it.id=i.item_id
    WHERE i.jid=$1 AND i.quantity>0
    ORDER BY it.category,it.name
  `,[jid])
  return rows
}

export async function leaderboard(limit=10) {
  const { rows } = await db.query(`
    SELECT u.jid,u.push_name,u.level,
           COALESCE(w.cash,0)::bigint AS cash,
           COALESCE(w.bank,0)::bigint AS bank,
           (COALESCE(w.cash,0)+COALESCE(w.bank,0))::bigint AS total
    FROM users u
    JOIN wallets w ON w.jid=u.jid
    WHERE u.jid NOT LIKE '%@local'
    ORDER BY total DESC,u.level DESC,u.created_at ASC
    LIMIT $1
  `,[limit])
  return rows
}


const EQUIPMENT = {
  espada_madeira: { category:'weapon', atk:5, def:0, name:'Espada de Madeira' },
  espada_ferro: { category:'weapon', atk:12, def:0, name:'Espada de Ferro' },
  armadura_couro: { category:'armor', atk:0, def:5, name:'Armadura de Couro' },
  armadura_ferro: { category:'armor', atk:0, def:12, name:'Armadura de Ferro' },
}

const POTIONS = {
  pocao_p: { heal:35, name:'Poção Pequena' },
  pocao_m: { heal:80, name:'Poção Média' },
}

function expNeeded(level) {
  return Math.max(100, Number(level) * 100)
}

async function applyExp(client, jid, gain) {
  const r = await client.query('SELECT level,exp FROM users WHERE jid=$1 FOR UPDATE',[jid])
  if (!r.rows[0]) return { level:1, exp:0, levels:0 }

  let level=Number(r.rows[0].level)
  let exp=Number(r.rows[0].exp)+Number(gain)
  let levels=0

  while(exp >= expNeeded(level)) {
    exp -= expNeeded(level)
    level++
    levels++
  }

  await client.query(
    'UPDATE users SET level=$1,exp=$2,updated_at='+nowSql+' WHERE jid=$3',
    [level,exp,jid]
  )

  if(levels>0){
    await client.query(`
      UPDATE stats
      SET max_hp=max_hp+$1,
          hp=max_hp+$1,
          atk=atk+$2,
          def=def+$3,
          spd=spd+$4,
          updated_at=${nowSql}
      WHERE jid=$5
    `,[levels*8,levels*2,levels,levels,jid])
  }

  return { level, exp, levels }
}

export async function equipItem(jid, itemId) {
  const eq=EQUIPMENT[itemId]
  if(!eq) throw new Error('Esse item não pode ser equipado.')

  return transaction(async client=>{
    const inv=await client.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
      [jid,itemId]
    )
    if(!inv.rows[0] || Number(inv.rows[0].quantity)<1) {
      throw new Error('Você não possui esse item.')
    }

    const field=eq.category==='weapon' ? 'weapon_id' : 'armor_id'
    await client.query(
      `UPDATE stats SET ${field}=$1,updated_at=${nowSql} WHERE jid=$2`,
      [itemId,jid]
    )
    return { ...eq, itemId }
  })
}

export async function usePotion(jid, itemId) {
  const potion=POTIONS[itemId]
  if(!potion) throw new Error('Esse item não é uma poção utilizável.')

  return transaction(async client=>{
    const inv=await client.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
      [jid,itemId]
    )
    if(!inv.rows[0] || Number(inv.rows[0].quantity)<1) {
      throw new Error('Você não possui essa poção.')
    }

    const st=await client.query(
      'SELECT hp,max_hp FROM stats WHERE jid=$1 FOR UPDATE',
      [jid]
    )
    const hp=Number(st.rows[0].hp)
    const maxHp=Number(st.rows[0].max_hp)
    if(hp>=maxHp) throw new Error('Seu HP já está cheio.')

    const newHp=Math.min(maxHp,hp+potion.heal)
    const healed=newHp-hp

    await client.query(
      'UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',
      [jid,itemId]
    )
    await client.query(
      'UPDATE stats SET hp=$1,updated_at='+nowSql+' WHERE jid=$2',
      [newHp,jid]
    )
    return { ...potion, healed, hp:newHp, maxHp }
  })
}

export async function getCombatProfile(jid) {
  const p=await getProfile(jid)
  if(!p) return null
  const weapon=EQUIPMENT[p.weapon_id] || {atk:0,def:0,name:'Nenhuma'}
  const armor=EQUIPMENT[p.armor_id] || {atk:0,def:0,name:'Nenhuma'}
  return {
    ...p,
    base_atk:Number(p.atk),
    base_def:Number(p.def),
    weapon_atk:Number(weapon.atk||0),
    armor_def:Number(armor.def||0),
    effective_atk:Number(p.atk)+Number(weapon.atk||0)+Number(armor.atk||0),
    effective_def:Number(p.def)+Number(weapon.def||0)+Number(armor.def||0),
    weapon_name:weapon.name,
    armor_name:armor.name,
  }
}

export async function battle(attackerJid, defenderJid) {
  if(attackerJid===defenderJid) throw new Error('Você não pode batalhar contra si mesmo.')
  await ensureUser(defenderJid)

  const cd=await claimCooldown(`battle:${attackerJid}`,10*60)
  if(!cd.ok) return { ok:false, remaining:cd.remaining }

  return transaction(async client=>{
    const ids=[attackerJid,defenderJid].sort()
    const statsR=await client.query(
      'SELECT * FROM stats WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',
      [ids]
    )
    const usersR=await client.query(
      'SELECT jid,push_name,level,exp FROM users WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',
      [ids]
    )

    const statFor=jid=>statsR.rows.find(r=>r.jid===jid)
    const userFor=jid=>usersR.rows.find(r=>r.jid===jid)
    const a=statFor(attackerJid)
    const b=statFor(defenderJid)
    const au=userFor(attackerJid)
    const bu=userFor(defenderJid)
    if(!a || !b) throw new Error('Não foi possível carregar os jogadores.')
    if(Number(a.hp)<=0) throw new Error('Você está sem HP. Use uma poção antes de batalhar.')
    if(Number(b.hp)<=0) throw new Error('O adversário está sem HP.')

    const aeW=EQUIPMENT[a.weapon_id]||{atk:0,def:0}
    const aeA=EQUIPMENT[a.armor_id]||{atk:0,def:0}
    const beW=EQUIPMENT[b.weapon_id]||{atk:0,def:0}
    const beA=EQUIPMENT[b.armor_id]||{atk:0,def:0}

    const A={
      jid:attackerJid,name:au?.push_name||'Jogador',
      hp:Number(a.hp),maxHp:Number(a.max_hp),
      atk:Number(a.atk)+aeW.atk+aeA.atk,
      def:Number(a.def)+aeW.def+aeA.def,
      spd:Number(a.spd)
    }
    const B={
      jid:defenderJid,name:bu?.push_name||'Jogador',
      hp:Number(b.hp),maxHp:Number(b.max_hp),
      atk:Number(b.atk)+beW.atk+beA.atk,
      def:Number(b.def)+beW.def+beA.def,
      spd:Number(b.spd)
    }

    const log=[]
    let first=A.spd>=B.spd?A:B
    let second=first===A?B:A

    const hit=(from,to)=>{
      const variance=0.85+Math.random()*0.30
      const crit=Math.random()<0.10
      const raw=Math.max(1,Math.round((from.atk-(to.def*0.45))*variance))
      const dmg=crit?Math.round(raw*1.6):raw
      to.hp=Math.max(0,to.hp-dmg)
      log.push({from:from.name,to:to.name,dmg,crit,hp:to.hp})
    }

    for(let round=1;round<=20 && A.hp>0 && B.hp>0;round++){
      hit(first,second)
      if(second.hp<=0) break
      hit(second,first)
    }

    let winner=A.hp===B.hp ? (Math.random()<0.5?A:B) : (A.hp>B.hp?A:B)
    let loser=winner===A?B:A
    if(A.hp>0 && B.hp>0){
      loser.hp=0
    }

    const reward=600+Math.floor(Math.random()*601)
    await client.query(
      'UPDATE stats SET hp=$1,win=win+1,updated_at='+nowSql+' WHERE jid=$2',
      [Math.max(1,winner.hp),winner.jid]
    )
    await client.query(
      'UPDATE stats SET hp=$1,loss=loss+1,updated_at='+nowSql+' WHERE jid=$2',
      [Math.max(1,Math.floor(loser.maxHp*0.25)),loser.jid]
    )
    await client.query(
      'UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',
      [reward,winner.jid]
    )
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'battle_reward','pvp victory')
    `,[winner.jid,reward])

    const winExp=await applyExp(client,winner.jid,40)
    const loseExp=await applyExp(client,loser.jid,15)

    return {
      ok:true,winner,loser,reward,log,
      winExp,loseExp,
      final:{
        attackerHp: A.jid===winner.jid ? Math.max(1,winner.hp) : Math.max(1,Math.floor(A.maxHp*0.25)),
        defenderHp: B.jid===winner.jid ? Math.max(1,winner.hp) : Math.max(1,Math.floor(B.maxHp*0.25))
      }
    }
  })
}

export async function combatLeaderboard(limit=10) {
  const {rows}=await db.query(`
    SELECT u.jid,u.push_name,u.level,s.win,s.loss,
           (s.win*3-s.loss) AS score
    FROM users u
    JOIN stats s ON s.jid=u.jid
    WHERE u.jid NOT LIKE '%@local'
    ORDER BY score DESC,s.win DESC,u.level DESC
    LIMIT $1
  `,[limit])
  return rows
}


let runtimeLockClient = null

export async function acquireRuntimeLock(sessionId) {
  if (runtimeLockClient) return true

  const lockName = `trevo-whatsapp:${sessionId}`

  while (true) {
    const client = await db.connect()
    try {
      const { rows } = await client.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
        [lockName]
      )

      if (rows[0]?.locked) {
        runtimeLockClient = client
        client.on('error', err=>{
          console.error('[Runtime] conexão do lock Neon encerrada',err?.message || err)
          if(runtimeLockClient===client) runtimeLockClient=null
          setTimeout(()=>process.exit(1),100)
        })
        console.log('[Runtime] lock exclusivo adquirido para', sessionId)
        return true
      }
    } catch (err) {
      client.release()
      throw err
    }

    client.release()
    console.log('[Runtime] outra instância ainda usa a sessão; aguardando...')
    await new Promise(resolve => setTimeout(resolve, 2500))
  }
}


export async function ownerAddBalance(jid, amount) {
  amount=Number(amount)
  if(!Number.isInteger(amount) || amount<=0) throw new Error('Valor inválido.')
  await ensureUser(jid)
  await transaction(async client=>{
    await client.query(
      'UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',
      [amount,jid]
    )
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('owner',$1,$2,'owner_credit','admin')
    `,[jid,amount])
  })
  return getProfile(jid)
}

export async function ownerRemoveBalance(jid, amount) {
  amount=Number(amount)
  if(!Number.isInteger(amount) || amount<=0) throw new Error('Valor inválido.')
  await ensureUser(jid)

  return transaction(async client=>{
    const r=await client.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const current=Number(r.rows[0]?.cash||0)
    const removed=Math.min(current,amount)
    await client.query(
      'UPDATE wallets SET cash=GREATEST(0,cash-$1),updated_at='+nowSql+' WHERE jid=$2',
      [amount,jid]
    )
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'owner',$2,'owner_debit','admin')
    `,[jid,removed])
    return { removed, cash:current-removed }
  })
}

export async function ownerAddExp(jid, amount) {
  amount=Number(amount)
  if(!Number.isInteger(amount) || amount<=0) throw new Error('EXP inválida.')
  await ensureUser(jid)
  return transaction(async client=>applyExp(client,jid,amount))
}

export async function ownerSetLevel(jid, level) {
  level=Number(level)
  if(!Number.isInteger(level) || level<1 || level>999) throw new Error('Nível inválido.')
  await ensureUser(jid)

  return transaction(async client=>{
    const r=await client.query('SELECT level FROM users WHERE jid=$1 FOR UPDATE',[jid])
    const current=Number(r.rows[0]?.level||1)
    const maxHp=100+((level-1)*8)
    const atk=10+((level-1)*2)
    const def=5+(level-1)
    const spd=10+(level-1)

    await client.query(
      'UPDATE users SET level=$1,exp=0,updated_at='+nowSql+' WHERE jid=$2',
      [level,jid]
    )
    await client.query(`
      UPDATE stats
      SET max_hp=$1,hp=$1,atk=$2,def=$3,spd=$4,updated_at=${nowSql}
      WHERE jid=$5
    `,[maxHp,atk,def,spd,jid])

    return { oldLevel:current, level, maxHp, atk, def, spd }
  })
}

export async function ownerHeal(jid) {
  await ensureUser(jid)
  const {rows}=await db.query(`
    UPDATE stats
    SET hp=max_hp,updated_at=${nowSql}
    WHERE jid=$1
    RETURNING hp,max_hp
  `,[jid])
  return rows[0]
}

export async function ownerGrantItem(jid, itemId, qty=1) {
  qty=Number(qty)
  if(!Number.isInteger(qty) || qty<1 || qty>999) throw new Error('Quantidade inválida.')
  await ensureUser(jid)

  return transaction(async client=>{
    const itemR=await client.query('SELECT id,name FROM items WHERE id=$1',[itemId])
    const item=itemR.rows[0]
    if(!item) throw new Error('Item não encontrado.')

    await client.query(`
      INSERT INTO inventories(jid,item_id,quantity)
      VALUES($1,$2,$3)
      ON CONFLICT(jid,item_id)
      DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity
    `,[jid,itemId,qty])

    return { item, qty }
  })
}


export async function getGroupLicense(chatJid) {
  const { rows } = await db.query(
    'SELECT * FROM group_licenses WHERE chat_jid=$1',
    [chatJid]
  )
  return rows[0] || null
}

export async function ensureGroupTrial(chatJid) {
  const now=Math.floor(Date.now()/1000)
  const trialUntil=now+(3*24*60*60)
  await db.query(`
    INSERT INTO group_licenses(chat_jid,status,plan,trial_started_at,paid_until,updated_at)
    VALUES($1,'active','trial',$2,$3,${nowSql})
    ON CONFLICT(chat_jid) DO NOTHING
  `,[chatJid,now,trialUntil])
  return getGroupLicense(chatJid)
}

export async function activateGroupLicense(chatJid,days=30,activatedBy='owner',plan='basic') {
  days=Number(days)
  if(!Number.isInteger(days)||days<1||days>3650) throw new Error('Dias inválidos.')
  const now=Math.floor(Date.now()/1000)
  const current=await getGroupLicense(chatJid)
  const base=current?.paid_until && Number(current.paid_until)>now ? Number(current.paid_until) : now
  const paidUntil=base+(days*24*60*60)

  await db.query(`
    INSERT INTO group_licenses(chat_jid,status,plan,trial_started_at,paid_until,activated_by,updated_at)
    VALUES($1,'active',$2,NULL,$3,$4,${nowSql})
    ON CONFLICT(chat_jid)
    DO UPDATE SET status='active',plan=EXCLUDED.plan,paid_until=EXCLUDED.paid_until,
                  activated_by=EXCLUDED.activated_by,updated_at=EXCLUDED.updated_at
  `,[chatJid,plan,paidUntil,activatedBy])

  return getGroupLicense(chatJid)
}

export async function blockGroupLicense(chatJid,activatedBy='owner') {
  await db.query(`
    INSERT INTO group_licenses(chat_jid,status,plan,activated_by,updated_at)
    VALUES($1,'blocked','blocked',$2,${nowSql})
    ON CONFLICT(chat_jid)
    DO UPDATE SET status='blocked',plan='blocked',activated_by=EXCLUDED.activated_by,
                  updated_at=EXCLUDED.updated_at
  `,[chatJid,activatedBy])
  return getGroupLicense(chatJid)
}

export async function listGroupLicenses(limit=50) {
  const { rows } = await db.query(`
    SELECT chat_jid,status,plan,trial_started_at,paid_until,activated_by,updated_at
    FROM group_licenses
    ORDER BY updated_at DESC
    LIMIT $1
  `,[limit])
  return rows
}

export function groupLicenseIsActive(license) {
  if(!license || license.status!=='active') return false
  const now=Math.floor(Date.now()/1000)
  return Number(license.paid_until||0)>now
}


export async function openLuckyBox(jid) {
  await ensureUser(jid)
  return transaction(async client=>{
    const inv=await client.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
      [jid,'caixa_sorte']
    )
    if(!inv.rows[0] || Number(inv.rows[0].quantity)<1) throw new Error('Você não possui uma Caixa da Sorte.')

    await client.query(
      'UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',
      [jid,'caixa_sorte']
    )

    const roll=Math.random()
    if(roll<0.55){
      const cash=1000+Math.floor(Math.random()*4001)
      await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[cash,jid])
      await client.query(`
        INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES('system',$1,$2,'lucky_box','cash')
      `,[jid,cash])
      return {type:'cash',cash}
    }

    if(roll<0.80){
      const itemId=Math.random()<0.65?'pocao_m':'espada_madeira'
      const item=await client.query('SELECT name FROM items WHERE id=$1',[itemId])
      await client.query(`
        INSERT INTO inventories(jid,item_id,quantity)
        VALUES($1,$2,1)
        ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1
      `,[jid,itemId])
      return {type:'item',itemId,name:item.rows[0]?.name||itemId,qty:1}
    }

    if(roll<0.95){
      const exp=100+Math.floor(Math.random()*201)
      const level=await applyExp(client,jid,exp)
      return {type:'exp',exp,level}
    }

    const itemId='espada_ferro'
    const item=await client.query('SELECT name FROM items WHERE id=$1',[itemId])
    await client.query(`
      INSERT INTO inventories(jid,item_id,quantity)
      VALUES($1,$2,1)
      ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1
    `,[jid,itemId])
    return {type:'rare',itemId,name:item.rows[0]?.name||itemId,qty:1}
  })
}

export async function dungeon(jid) {
  await ensureUser(jid)
  const cd=await claimCooldown(`dungeon:${jid}`,20*60)
  if(!cd.ok) return {ok:false,remaining:cd.remaining}

  return transaction(async client=>{
    const p=await client.query(`
      SELECT u.level,s.hp,s.max_hp,s.atk,s.def,s.weapon_id,s.armor_id
      FROM users u JOIN stats s ON s.jid=u.jid
      WHERE u.jid=$1
      FOR UPDATE OF u,s
    `,[jid])
    const row=p.rows[0]
    if(!row) throw new Error('Perfil não encontrado.')
    if(Number(row.hp)<=0) throw new Error('Você está sem HP. Use uma poção antes.')

    const weapon=EQUIPMENT[row.weapon_id]||{atk:0,def:0}
    const armor=EQUIPMENT[row.armor_id]||{atk:0,def:0}
    const atk=Number(row.atk)+weapon.atk+armor.atk
    const def=Number(row.def)+weapon.def+armor.def
    const level=Number(row.level)

    const monsters=[
      {name:'Slime Sombrio',hp:45,atk:8,def:2,mult:1},
      {name:'Goblin do Beco',hp:70,atk:12,def:4,mult:1.2},
      {name:'Orc Brutal',hp:105,atk:17,def:7,mult:1.5},
      {name:'Cavaleiro Espectral',hp:145,atk:22,def:10,mult:2}
    ]
    const idx=Math.min(monsters.length-1,Math.floor((level-1)/3)+Math.floor(Math.random()*2))
    const m={...monsters[Math.min(idx,monsters.length-1)]}
    m.hp+=level*6
    m.atk+=Math.floor(level*1.3)
    m.def+=Math.floor(level*.7)

    let php=Number(row.hp),mhp=m.hp,rounds=0
    while(php>0&&mhp>0&&rounds<25){
      rounds++
      const pdmg=Math.max(1,Math.round((atk-m.def*.4)*(0.85+Math.random()*.3)))
      mhp=Math.max(0,mhp-pdmg)
      if(mhp<=0) break
      const mdmg=Math.max(1,Math.round((m.atk-def*.35)*(0.85+Math.random()*.3)))
      php=Math.max(0,php-mdmg)
    }

    if(php<=0){
      const recover=Math.max(1,Math.floor(Number(row.max_hp)*.30))
      await client.query('UPDATE stats SET hp=$1,updated_at='+nowSql+' WHERE jid=$2',[recover,jid])
      const expRes=await applyExp(client,jid,10)
      return {ok:true,won:false,monster:m.name,hp:recover,maxHp:Number(row.max_hp),exp:10,level:expRes}
    }

    const cash=Math.floor((700+Math.random()*801)*m.mult)
    const exp=Math.floor((35+Math.random()*31)*m.mult)
    await client.query('UPDATE stats SET hp=$1,updated_at='+nowSql+' WHERE jid=$2',[Math.max(1,php),jid])
    await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[cash,jid])
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'dungeon_reward',$3)
    `,[jid,cash,m.name])
    const expRes=await applyExp(client,jid,exp)
    return {ok:true,won:true,monster:m.name,hp:Math.max(1,php),maxHp:Number(row.max_hp),cash,exp,level:expRes}
  })
}

export async function robPlayer(thiefJid,targetJid) {
  if(thiefJid===targetJid) throw new Error('Você não pode roubar a si mesmo.')
  await ensureUser(thiefJid)
  await ensureUser(targetJid)

  return transaction(async client=>{
    const ids=[thiefJid,targetJid].sort()
    const wallets=await client.query(
      'SELECT jid,cash FROM wallets WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',
      [ids]
    )
    const stats=await client.query(
      'SELECT jid,spd FROM stats WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',
      [ids]
    )
    const tw=wallets.rows.find(r=>r.jid===thiefJid)
    const vw=wallets.rows.find(r=>r.jid===targetJid)
    const ts=stats.rows.find(r=>r.jid===thiefJid)
    const vs=stats.rows.find(r=>r.jid===targetJid)
    const victimCash=Number(vw?.cash||0)
    if(victimCash<100) throw new Error('Essa pessoa está praticamente sem dinheiro na carteira.')

    const now=Math.floor(Date.now()/1000)
    const cdKey=`rob:${thiefJid}`
    const cdR=await client.query('SELECT expires_at FROM cooldowns WHERE key=$1 FOR UPDATE',[cdKey])
    const activeUntil=Number(cdR.rows[0]?.expires_at||0)
    if(activeUntil>now) return {ok:false,remaining:activeUntil-now}

    const expires=now+(60*60)
    await client.query(`
      INSERT INTO cooldowns(key,expires_at) VALUES($1,$2)
      ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at
    `,[cdKey,expires])

    const speedDiff=Number(ts?.spd||10)-Number(vs?.spd||10)
    const chance=Math.max(.25,Math.min(.70,.45+(speedDiff*.015)))
    const success=Math.random()<chance

    if(success){
      const pct=.05+Math.random()*.10
      const amount=Math.min(3000,Math.max(50,Math.floor(victimCash*pct)))
      await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[amount,thiefJid])
      await client.query('UPDATE wallets SET cash=GREATEST(0,cash-$1),updated_at='+nowSql+' WHERE jid=$2',[amount,targetJid])
      await client.query(`
        INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES($1,$2,$3,'robbery','success')
      `,[targetJid,thiefJid,amount])
      return {ok:true,success:true,amount,chance}
    }

    const thiefCash=Number(tw?.cash||0)
    const fine=Math.min(500,thiefCash)
    if(fine>0){
      await client.query('UPDATE wallets SET cash=GREATEST(0,cash-$1),updated_at='+nowSql+' WHERE jid=$2',[fine,thiefJid])
    }
    return {ok:true,success:false,fine,chance}
  })
}

export async function getLaunchPrice() {
  const { rows } = await db.query(
    "SELECT value FROM trevo_settings WHERE key='launch_price'"
  )
  const raw=rows[0]?.value
  const value=Number(raw ?? 2)
  return Number.isFinite(value) && value>0 ? value : 2
}

export async function setLaunchPrice(value) {
  value=Number(String(value).replace(',','.'))
  if(!Number.isFinite(value) || value<=0 || value>9999) throw new Error('Preço inválido.')
  value=Math.round(value*100)/100

  await db.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    VALUES('launch_price',$1::jsonb,${nowSql})
    ON CONFLICT(key)
    DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
  `,[JSON.stringify(value)])

  return value
}


function orderCode() {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out='TREVO-'
  const bytes=crypto.randomBytes(6)
  for(let i=0;i<6;i++) out+=alphabet[bytes[i]%alphabet.length]
  return out
}

export async function getPixSettings() {
  const { rows } = await db.query(
    "SELECT key,value FROM trevo_settings WHERE key=ANY($1::text[])",
    [['pix_key','pix_name']]
  )
  const map=Object.fromEntries(rows.map(r=>[r.key,r.value]))
  return {
    key:String(map.pix_key ?? ''),
    name:String(map.pix_name ?? 'Trevo')
  }
}

export async function setPixKey(value) {
  value=String(value||'').trim()
  if(value.length<3 || value.length>200) throw new Error('Chave Pix inválida.')
  await db.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    VALUES('pix_key',$1::jsonb,${nowSql})
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
  `,[JSON.stringify(value)])
  return value
}

export async function setPixName(value) {
  value=String(value||'').trim()
  if(value.length<2 || value.length>100) throw new Error('Nome Pix inválido.')
  await db.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    VALUES('pix_name',$1::jsonb,${nowSql})
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
  `,[JSON.stringify(value)])
  return value
}

export async function createSubscriptionOrder(chatJid, requesterJid) {
  if(!chatJid?.endsWith('@g.us')) throw new Error('A assinatura é vinculada a um grupo.')
  const price=await getLaunchPrice()
  const now=Math.floor(Date.now()/1000)
  const expires=now+(24*60*60)

  const existing=await db.query(`
    SELECT * FROM subscription_orders
    WHERE chat_jid=$1 AND status='pending' AND expires_at>$2
    ORDER BY created_at DESC
    LIMIT 1
  `,[chatJid,now])
  if(existing.rows[0]) return {order:existing.rows[0],reused:true}

  for(let attempt=0;attempt<8;attempt++){
    const code=orderCode()
    try{
      const {rows}=await db.query(`
        INSERT INTO subscription_orders(code,chat_jid,requester_jid,amount,status,expires_at)
        VALUES($1,$2,$3,$4,'pending',$5)
        RETURNING *
      `,[code,chatJid,requesterJid,price,expires])
      return {order:rows[0],reused:false}
    }catch(err){
      if(err?.code!=='23505') throw err
    }
  }
  throw new Error('Não foi possível gerar o pedido. Tente novamente.')
}

export async function getSubscriptionOrder(code) {
  code=String(code||'').trim().toUpperCase()
  const {rows}=await db.query(
    'SELECT * FROM subscription_orders WHERE code=$1',
    [code]
  )
  return rows[0]||null
}

export async function listPendingSubscriptionOrders(limit=30) {
  const now=Math.floor(Date.now()/1000)
  await db.query(
    "UPDATE subscription_orders SET status='expired' WHERE status='pending' AND expires_at<=$1",
    [now]
  )
  const {rows}=await db.query(`
    SELECT * FROM subscription_orders
    WHERE status='pending'
    ORDER BY created_at ASC
    LIMIT $1
  `,[limit])
  return rows
}

export async function approveSubscriptionOrder(code, ownerJid) {
  code=String(code||'').trim().toUpperCase()
  return transaction(async client=>{
    const now=Math.floor(Date.now()/1000)
    const r=await client.query(
      'SELECT * FROM subscription_orders WHERE code=$1 FOR UPDATE',
      [code]
    )
    const order=r.rows[0]
    if(!order) throw new Error('Pedido não encontrado.')
    if(order.status==='approved') throw new Error('Esse pedido já foi aprovado.')
    if(order.status!=='pending') throw new Error(`Pedido está ${order.status}.`)
    if(Number(order.expires_at)<=now){
      await client.query(
        "UPDATE subscription_orders SET status='expired' WHERE code=$1",
        [code]
      )
      throw new Error('Esse pedido expirou. Gere outro com !assinar.')
    }

    const lic=await client.query(
      'SELECT paid_until FROM group_licenses WHERE chat_jid=$1 FOR UPDATE',
      [order.chat_jid]
    )
    const currentUntil=Number(lic.rows[0]?.paid_until||0)
    const base=currentUntil>now?currentUntil:now
    const paidUntil=base+(30*24*60*60)

    await client.query(`
      INSERT INTO group_licenses(chat_jid,status,plan,trial_started_at,paid_until,activated_by,updated_at)
      VALUES($1,'active','basic',NULL,$2,$3,${nowSql})
      ON CONFLICT(chat_jid)
      DO UPDATE SET status='active',plan='basic',paid_until=EXCLUDED.paid_until,
                    activated_by=EXCLUDED.activated_by,updated_at=EXCLUDED.updated_at
    `,[order.chat_jid,paidUntil,ownerJid])

    await client.query(`
      UPDATE subscription_orders
      SET status='approved',approved_at=$2,approved_by=$3
      WHERE code=$1
    `,[code,now,ownerJid])

    return {...order,status:'approved',approved_at:now,approved_by:ownerJid,paid_until:paidUntil}
  })
}

export async function cancelSubscriptionOrder(code) {
  code=String(code||'').trim().toUpperCase()
  const now=Math.floor(Date.now()/1000)
  const {rows}=await db.query(`
    UPDATE subscription_orders
    SET status='cancelled',cancelled_at=$2
    WHERE code=$1 AND status='pending'
    RETURNING *
  `,[code,now])
  if(!rows[0]) throw new Error('Pedido pendente não encontrado.')
  return rows[0]
}


export async function getPaymentLink() {
  const { rows } = await db.query(
    "SELECT value FROM trevo_settings WHERE key='payment_link'"
  )
  return String(rows[0]?.value ?? 'https://mpago.la/1Aqm14o')
}

export async function setPaymentLink(value) {
  value=String(value||'').trim()
  try{
    const u=new URL(value)
    if(!['http:','https:'].includes(u.protocol)) throw new Error()
  }catch{
    throw new Error('Link de pagamento inválido.')
  }

  await db.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    VALUES('payment_link',$1::jsonb,${nowSql})
    ON CONFLICT(key)
    DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
  `,[JSON.stringify(value)])

  return value
}
