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
           s.hp,s.max_hp,s.atk,s.def,s.spd,s.win,s.loss
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
