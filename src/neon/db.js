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
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    );
    CREATE TABLE IF NOT EXISTS wallets (
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      cash BIGINT NOT NULL DEFAULT 0,
      bank BIGINT NOT NULL DEFAULT 0,
      bank_limit BIGINT NOT NULL DEFAULT 10000,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
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
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      from_jid TEXT NOT NULL,
      to_jid TEXT,
      amount BIGINT NOT NULL,
      type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
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
}

export async function ensureUser(jid, pushName='') {
  await db.query(`
    INSERT INTO users (jid, push_name)
    VALUES ($1,$2)
    ON CONFLICT(jid) DO UPDATE
      SET push_name = CASE WHEN EXCLUDED.push_name <> '' THEN EXCLUDED.push_name ELSE users.push_name END,
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
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

export async function claimDaily(jid) {
  const key = `daily:${jid}`
  const { rows } = await db.query('SELECT expires_at FROM cooldowns WHERE key=$1', [key]).catch(() => ({ rows: [] }))
  const now = Math.floor(Date.now()/1000)
  if (rows[0] && Number(rows[0].expires_at) > now) {
    return { ok:false, remaining:Number(rows[0].expires_at)-now }
  }
  await db.query('CREATE TABLE IF NOT EXISTS cooldowns (key TEXT PRIMARY KEY, expires_at BIGINT NOT NULL)')
  const expires = now + 20*60*60
  await db.query(`
    INSERT INTO cooldowns (key,expires_at) VALUES ($1,$2)
    ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at
  `, [key,expires])
  await db.query('UPDATE wallets SET cash=cash+5000 WHERE jid=$1',[jid])
  await db.query(`
    INSERT INTO transactions (from_jid,to_jid,amount,type,note)
    VALUES ('system',$1,5000,'reward','daily')
  `,[jid])
  return { ok:true, amount:5000 }
}
