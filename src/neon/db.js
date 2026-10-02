import crypto from 'node:crypto'
import pg from 'pg'

const { Pool, Client } = pg

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada')

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  statement_timeout: 12000,
  query_timeout: 15000,
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

    CREATE TABLE IF NOT EXISTS careers (
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      career_xp INTEGER NOT NULL DEFAULT 0,
      total_shifts INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS wallets (
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      cash BIGINT NOT NULL DEFAULT 0,
      bank BIGINT NOT NULL DEFAULT 0,
      bank_limit BIGINT NOT NULL DEFAULT 9223372036854775807,
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

    CREATE TABLE IF NOT EXISTS daily_streaks (
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      last_claim_day DATE,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS profile_avatars (
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      image_data TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS snipe_messages (
      chat_jid TEXT NOT NULL,
      message_id TEXT NOT NULL,
      sender_jid TEXT NOT NULL DEFAULT '',
      push_name TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      media_label TEXT NOT NULL DEFAULT '',
      media_type TEXT,
      mime_type TEXT,
      media_data TEXT,
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      deleted_at BIGINT,
      expires_at BIGINT NOT NULL,
      PRIMARY KEY(chat_jid,message_id)
    );

    CREATE INDEX IF NOT EXISTS snipe_messages_exp_idx
      ON snipe_messages(expires_at);

    CREATE INDEX IF NOT EXISTS snipe_messages_deleted_idx
      ON snipe_messages(chat_jid,deleted_at DESC);

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

    CREATE TABLE IF NOT EXISTS support_tickets (
      code TEXT PRIMARY KEY,
      requester_jid TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      answer TEXT,
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      updated_at BIGINT NOT NULL DEFAULT ${nowSql},
      answered_at BIGINT,
      answered_by TEXT
    );

    CREATE INDEX IF NOT EXISTS support_tickets_status_idx
      ON support_tickets(status, created_at);

    CREATE TABLE IF NOT EXISTS group_licenses (
      chat_jid TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'blocked',
      plan TEXT NOT NULL DEFAULT 'trial',
      trial_started_at BIGINT,
      paid_until BIGINT,
      activated_by TEXT,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS group_settings (
      chat_jid TEXT PRIMARY KEY,
      economy_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      rpg_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      games_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      progression_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by TEXT,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS quick_flows (
      flow_key TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      sender_jid TEXT NOT NULL,
      stage TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE INDEX IF NOT EXISTS quick_flows_expires_idx
      ON quick_flows(expires_at);

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
      ('pix_name','"Alpha Bot"'::jsonb),
      ('payment_link','"https://mpago.la/1Aqm14o"'::jsonb)
    ON CONFLICT(key) DO NOTHING
  `)

  await db.query(`
    UPDATE trevo_settings
    SET value='"Alpha Bot"'::jsonb, updated_at=${nowSql}
    WHERE key='pix_name' AND value='"Trevo"'::jsonb
  `)

  // Banco sem teto prático: remove o antigo limite de R$ 10.000 também das contas já existentes.
  await db.query('UPDATE wallets SET bank_limit=9223372036854775807 WHERE bank_limit<9223372036854775807')

  const starterItems = [
    // Poções
    ['pocao_p','Poção Pequena','Recupera 35 HP.','consumable',500,'common'],
    ['pocao_m','Poção Média','Recupera 80 HP.','consumable',1200,'uncommon'],
    ['pocao_g','Poção Grande','Recupera 160 HP.','consumable',3000,'rare'],
    ['elixir_supremo','Elixir Supremo','Recupera uma grande quantidade de HP.','consumable',9000,'epic'],

    // Armas
    ['espada_madeira','Espada de Madeira','Arma inicial do Alpha Bot. +5 ATK.','weapon',1500,'common'],
    ['espada_ferro','Espada de Ferro','Arma reforçada. +12 ATK.','weapon',5000,'uncommon'],
    ['espada_aco','Espada de Aço','Lâmina rara. +20 ATK.','weapon',12000,'rare'],
    ['machado_guerra','Machado de Guerra','Golpes pesados. +24 ATK.','weapon',18000,'rare'],
    ['katana_sombria','Katana Sombria','Lâmina veloz e rara. +28 ATK.','weapon',25000,'rare'],
    ['espada_flamas','Espada das Chamas','Arma épica. +40 ATK.','weapon',60000,'epic'],
    ['tridente_tempestade','Tridente da Tempestade','Arma épica. +48 ATK.','weapon',95000,'epic'],
    ['lamina_abissal','Lâmina Abissal','Arma épica de alto nível. +55 ATK.','weapon',140000,'epic'],
    ['martelo_golem','Martelo do Golem Ancestral','Arma exclusiva do Boss de Grupo. +70 ATK. Apenas por drop.','weapon',0,'legendary'],
    ['excalibur','Excalibur','Arma lendária. +85 ATK. Apenas por drop.','weapon',0,'legendary'],
    ['katana_divina','Katana Divina','Arma lendária raríssima. +95 ATK. Apenas por drop.','weapon',0,'legendary'],

    // Armaduras
    ['armadura_couro','Armadura de Couro','Proteção inicial. +5 DEF.','armor',2000,'common'],
    ['armadura_ferro','Armadura de Ferro','Proteção reforçada. +12 DEF.','armor',6500,'uncommon'],
    ['armadura_aco','Armadura de Aço','Proteção rara. +20 DEF.','armor',14000,'rare'],
    ['armadura_samurai','Armadura Samurai','Proteção rara. +24 DEF.','armor',22000,'rare'],
    ['armadura_cavaleiro','Armadura do Cavaleiro','Proteção rara superior. +28 DEF.','armor',30000,'rare'],
    ['armadura_dragao','Armadura de Dragão','Proteção épica. +40 DEF.','armor',70000,'epic'],
    ['armadura_abissal','Armadura Abissal','Proteção épica. +48 DEF.','armor',110000,'epic'],
    ['armadura_celestial','Armadura Celestial','Proteção épica de alto nível. +55 DEF.','armor',155000,'epic'],
    ['armadura_golem','Armadura do Golem Ancestral','Armadura exclusiva do Boss de Grupo. +70 DEF. Apenas por drop.','armor',0,'legendary'],
    ['armadura_titan','Armadura do Titã','Armadura lendária. +85 DEF. Apenas por drop.','armor',0,'legendary'],
    ['armadura_divina','Armadura Divina','Armadura lendária raríssima. +95 DEF. Apenas por drop.','armor',0,'legendary'],

    // Caixas
    ['caixa_sorte','Caixa da Sorte','Pode conter dinheiro, EXP ou itens. Lendário: 0,1%.','special',3000,'common'],
    ['caixa_rara','Caixa Rara','Melhores chances de itens raros. Lendário: 0,3%.','special',12000,'rare'],
    ['caixa_epica','Caixa Épica','Loot de alto nível. Lendário: 1%.','special',35000,'epic'],
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

// WhatsApp can identify the same person as a phone JID, a device JID or a LID.
// Consolidate an old alias as soon as Baileys gives us the stable phone JID so
// profile cards and rankings never read split/outdated player records.
export async function consolidateUserIdentity(targetJid, aliases=[], pushName='') {
  if(!targetJid?.endsWith('@s.whatsapp.net')) return false
  const targetDigits=targetJid.split('@')[0].replace(/:\d+$/,'')
  const sources=[...new Set((aliases||[]).filter(Boolean))].filter(alias=>{
    if(alias===targetJid) return false
    if(alias.endsWith('@lid')) return true
    if(alias.endsWith('@s.whatsapp.net')){
      return alias.split('@')[0].replace(/:\d+$/,'')===targetDigits
    }
    return false
  })
  if(!sources.length) return false

  return transaction(async client=>{
    await client.query(`
      INSERT INTO users(jid,pn,push_name)
      VALUES($1,$1,$2)
      ON CONFLICT(jid) DO UPDATE SET
        pn=COALESCE(users.pn,EXCLUDED.pn),
        push_name=CASE WHEN EXCLUDED.push_name<>'' THEN EXCLUDED.push_name ELSE users.push_name END,
        updated_at=${nowSql}
    `,[targetJid,pushName])
    await client.query('INSERT INTO wallets(jid) VALUES($1) ON CONFLICT(jid) DO NOTHING',[targetJid])
    await client.query('INSERT INTO stats(jid) VALUES($1) ON CONFLICT(jid) DO NOTHING',[targetJid])

    let changed=false
    for(const sourceJid of sources){
      const sourceR=await client.query('SELECT * FROM users WHERE jid=$1 FOR UPDATE',[sourceJid])
      if(!sourceR.rows[0]) continue
      changed=true
      const source=sourceR.rows[0]

      await client.query(`
        UPDATE users SET
          push_name=COALESCE(NULLIF($2,''),NULLIF(push_name,''),$3),
          level=GREATEST(level,$4),
          exp=CASE WHEN $4>level THEN $5 ELSE GREATEST(exp,$5) END,
          premium=premium OR $6,
          premium_exp=GREATEST(premium_exp,$7),
          banned=banned OR $8,
          created_at=LEAST(created_at,$9),
          pn=$1,
          updated_at=${nowSql}
        WHERE jid=$1
      `,[targetJid,pushName,source.push_name,Number(source.level||1),Number(source.exp||0),Boolean(source.premium),Number(source.premium_exp||0),Boolean(source.banned),Number(source.created_at||Math.floor(Date.now()/1000))])

      await client.query(`
        UPDATE wallets t SET
          cash=t.cash+COALESCE(s.cash,0),
          bank=t.bank+COALESCE(s.bank,0),
          bank_limit=GREATEST(t.bank_limit,COALESCE(s.bank_limit,0)),
          updated_at=${nowSql}
        FROM wallets s WHERE t.jid=$1 AND s.jid=$2
      `,[targetJid,sourceJid])

      await client.query(`
        UPDATE stats t SET
          hp=GREATEST(t.hp,COALESCE(s.hp,0)),
          max_hp=GREATEST(t.max_hp,COALESCE(s.max_hp,0)),
          atk=GREATEST(t.atk,COALESCE(s.atk,0)),
          def=GREATEST(t.def,COALESCE(s.def,0)),
          spd=GREATEST(t.spd,COALESCE(s.spd,0)),
          weapon_id=COALESCE(t.weapon_id,s.weapon_id),
          armor_id=COALESCE(t.armor_id,s.armor_id),
          win=t.win+COALESCE(s.win,0),
          loss=t.loss+COALESCE(s.loss,0),
          updated_at=${nowSql}
        FROM stats s WHERE t.jid=$1 AND s.jid=$2
      `,[targetJid,sourceJid])

      await client.query(`
        INSERT INTO inventories(jid,item_id,quantity,data,created_at)
        SELECT $1,item_id,quantity,data,created_at FROM inventories WHERE jid=$2
        ON CONFLICT(jid,item_id) DO UPDATE
        SET quantity=inventories.quantity+EXCLUDED.quantity
      `,[targetJid,sourceJid])

      await client.query(`
        INSERT INTO daily_streaks(jid,streak,best_streak,last_claim_day,updated_at)
        SELECT $1,streak,best_streak,last_claim_day,${nowSql} FROM daily_streaks WHERE jid=$2
        ON CONFLICT(jid) DO UPDATE SET
          streak=GREATEST(daily_streaks.streak,EXCLUDED.streak),
          best_streak=GREATEST(daily_streaks.best_streak,EXCLUDED.best_streak),
          last_claim_day=GREATEST(daily_streaks.last_claim_day,EXCLUDED.last_claim_day),
          updated_at=${nowSql}
      `,[targetJid,sourceJid])

      await client.query(`
        INSERT INTO profile_avatars(jid,image_data,mime_type,updated_at)
        SELECT $1,image_data,mime_type,updated_at FROM profile_avatars WHERE jid=$2
        ON CONFLICT(jid) DO NOTHING
      `,[targetJid,sourceJid])

      // Progression tables are initialized before messages start arriving.
      await client.query(`
        INSERT INTO daily_missions(jid,day_key,mission_type,title,target,reward_cash,reward_box,progress,claimed,created_at)
        SELECT $1,day_key,mission_type,title,target,reward_cash,reward_box,progress,claimed,created_at
        FROM daily_missions WHERE jid=$2
        ON CONFLICT(jid,day_key,mission_type) DO UPDATE SET
          progress=GREATEST(daily_missions.progress,EXCLUDED.progress),
          claimed=daily_missions.claimed OR EXCLUDED.claimed
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO user_cars(jid,car_id,price_paid,acquired_at)
        SELECT $1,car_id,price_paid,acquired_at FROM user_cars WHERE jid=$2
        ON CONFLICT(jid,car_id) DO NOTHING
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO user_homes(jid,house_id,price_paid,acquired_at)
        SELECT $1,house_id,price_paid,acquired_at FROM user_homes WHERE jid=$2
        ON CONFLICT(jid) DO UPDATE SET
          house_id=CASE WHEN EXCLUDED.price_paid>user_homes.price_paid THEN EXCLUDED.house_id ELSE user_homes.house_id END,
          price_paid=GREATEST(user_homes.price_paid,EXCLUDED.price_paid),
          acquired_at=LEAST(user_homes.acquired_at,EXCLUDED.acquired_at)
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO careers(jid,career_xp,total_shifts,updated_at)
        SELECT $1,career_xp,total_shifts,${nowSql} FROM careers WHERE jid=$2
        ON CONFLICT(jid) DO UPDATE SET
          career_xp=careers.career_xp+EXCLUDED.career_xp,
          total_shifts=careers.total_shifts+EXCLUDED.total_shifts,
          updated_at=${nowSql}
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO user_motorcycles(jid,motorcycle_id,price_paid,acquired_at)
        SELECT $1,motorcycle_id,price_paid,acquired_at FROM user_motorcycles WHERE jid=$2
        ON CONFLICT(jid,motorcycle_id) DO UPDATE SET
          price_paid=GREATEST(user_motorcycles.price_paid,EXCLUDED.price_paid),
          acquired_at=LEAST(user_motorcycles.acquired_at,EXCLUDED.acquired_at)
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO user_businesses(jid,business_id,price_paid,acquired_at,last_collected_at,level)
        SELECT $1,business_id,price_paid,acquired_at,last_collected_at,level FROM user_businesses WHERE jid=$2
        ON CONFLICT(jid,business_id) DO UPDATE SET
          price_paid=GREATEST(user_businesses.price_paid,EXCLUDED.price_paid),
          acquired_at=LEAST(user_businesses.acquired_at,EXCLUDED.acquired_at),
          last_collected_at=GREATEST(user_businesses.last_collected_at,EXCLUDED.last_collected_at),
          level=GREATEST(user_businesses.level,EXCLUDED.level)
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO group_mission_members(chat_jid,week_key,jid,contribution,claimed)
        SELECT chat_jid,week_key,$1,contribution,claimed FROM group_mission_members WHERE jid=$2
        ON CONFLICT(chat_jid,week_key,jid) DO UPDATE SET
          contribution=group_mission_members.contribution+EXCLUDED.contribution,
          claimed=group_mission_members.claimed OR EXCLUDED.claimed
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO group_activity(chat_jid,jid,day,messages,commands)
        SELECT chat_jid,$1,day,messages,commands FROM group_activity WHERE jid=$2
        ON CONFLICT(chat_jid,jid,day) DO UPDATE SET
          messages=group_activity.messages+EXCLUDED.messages,
          commands=group_activity.commands+EXCLUDED.commands
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO group_warnings(chat_jid,jid,warnings,updated_at)
        SELECT chat_jid,$1,warnings,updated_at FROM group_warnings WHERE jid=$2
        ON CONFLICT(chat_jid,jid) DO UPDATE SET
          warnings=group_warnings.warnings+EXCLUDED.warnings,
          updated_at=GREATEST(group_warnings.updated_at,EXCLUDED.updated_at)
      `,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO pets(jid,species,name,level,xp,hunger,hygiene,energy,power,wins,losses,last_action,created_at)
        SELECT $1,species,name,level,xp,hunger,hygiene,energy,power,wins,losses,last_action,created_at FROM pets WHERE jid=$2
        ON CONFLICT(jid) DO UPDATE SET
          species=CASE WHEN EXCLUDED.xp>pets.xp THEN EXCLUDED.species ELSE pets.species END,
          name=CASE WHEN EXCLUDED.xp>pets.xp THEN EXCLUDED.name ELSE pets.name END,
          xp=pets.xp+EXCLUDED.xp,level=1+FLOOR((pets.xp+EXCLUDED.xp)/100),
          hunger=GREATEST(pets.hunger,EXCLUDED.hunger),hygiene=GREATEST(pets.hygiene,EXCLUDED.hygiene),
          energy=GREATEST(pets.energy,EXCLUDED.energy),power=GREATEST(pets.power,EXCLUDED.power),
          wins=pets.wins+EXCLUDED.wins,losses=pets.losses+EXCLUDED.losses,
          last_action=GREATEST(pets.last_action,EXCLUDED.last_action),created_at=LEAST(pets.created_at,EXCLUDED.created_at)
      `,[targetJid,sourceJid])
      await client.query(`UPDATE clans SET owner_jid=$1 WHERE owner_jid=$2`,[targetJid,sourceJid])
      await client.query(`
        INSERT INTO clan_members(jid,clan_id,role,joined_at)
        SELECT $1,clan_id,role,joined_at FROM clan_members WHERE jid=$2
        ON CONFLICT(jid) DO NOTHING
      `,[targetJid,sourceJid])

      const cooldowns=await client.query('SELECT key,expires_at FROM cooldowns WHERE key LIKE $1',[`%${sourceJid}%`])
      for(const row of cooldowns.rows){
        const nextKey=String(row.key).replaceAll(sourceJid,targetJid)
        await client.query(`
          INSERT INTO cooldowns(key,expires_at) VALUES($1,$2)
          ON CONFLICT(key) DO UPDATE SET expires_at=GREATEST(cooldowns.expires_at,EXCLUDED.expires_at)
        `,[nextKey,row.expires_at])
      }

      await client.query('UPDATE transactions SET from_jid=$1 WHERE from_jid=$2',[targetJid,sourceJid])
      await client.query('UPDATE transactions SET to_jid=$1 WHERE to_jid=$2',[targetJid,sourceJid])
      await client.query('UPDATE subscription_orders SET requester_jid=$1 WHERE requester_jid=$2',[targetJid,sourceJid])
      await client.query('UPDATE support_tickets SET requester_jid=$1 WHERE requester_jid=$2',[targetJid,sourceJid])
      await client.query('UPDATE snipe_messages SET sender_jid=$1 WHERE sender_jid=$2',[targetJid,sourceJid])
      await client.query('UPDATE clan_invites SET inviter_jid=$1 WHERE inviter_jid=$2',[targetJid,sourceJid])
      await client.query('UPDATE market_listings SET seller_jid=$1 WHERE seller_jid=$2',[targetJid,sourceJid])
      await client.query('UPDATE market_listings SET buyer_jid=$1 WHERE buyer_jid=$2',[targetJid,sourceJid])
      await client.query('UPDATE group_events SET claimed_by=$1 WHERE claimed_by=$2',[targetJid,sourceJid])

      const targetRelationship=await client.query('SELECT 1 FROM relationships WHERE jid=$1 OR partner_jid=$1 LIMIT 1',[targetJid])
      if(targetRelationship.rowCount){
        await client.query('DELETE FROM relationships WHERE jid=$1 OR partner_jid=$1',[sourceJid])
      }else{
        await client.query('UPDATE relationships SET partner_jid=$1 WHERE partner_jid=$2',[targetJid,sourceJid])
        await client.query('UPDATE relationships SET jid=$1 WHERE jid=$2',[targetJid,sourceJid])
      }
      await client.query(`
        INSERT INTO relationship_proposals(from_jid,to_jid,created_at)
        SELECT CASE WHEN from_jid=$2 THEN $1 ELSE from_jid END,
               CASE WHEN to_jid=$2 THEN $1 ELSE to_jid END,created_at
        FROM relationship_proposals
        WHERE (from_jid=$2 OR to_jid=$2)
          AND NOT (from_jid IN ($1,$2) AND to_jid IN ($1,$2))
        ON CONFLICT(from_jid,to_jid) DO UPDATE SET created_at=GREATEST(relationship_proposals.created_at,EXCLUDED.created_at)
      `,[targetJid,sourceJid])

      await client.query('DELETE FROM cooldowns WHERE key LIKE $1',[`%${sourceJid}%`])
      await client.query('DELETE FROM daily_missions WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM relationship_proposals WHERE from_jid=$1 OR to_jid=$1',[sourceJid])
      await client.query('DELETE FROM group_warnings WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM group_activity WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM group_mission_members WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM user_businesses WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM user_motorcycles WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM clan_members WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM clan_invites WHERE invitee_jid=$1',[sourceJid])
      await client.query('DELETE FROM user_homes WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM user_cars WHERE jid=$1',[sourceJid])
      await client.query('DELETE FROM quick_flows WHERE sender_jid=$1',[sourceJid])
      await client.query('DELETE FROM users WHERE jid=$1',[sourceJid])
    }
    return changed
  })
}

export async function getProfile(jid) {
  const { rows } = await db.query(`
    SELECT u.jid,u.push_name,u.level,u.exp,u.premium,u.created_at,
           w.cash,w.bank,w.bank_limit,
           s.hp,s.max_hp,s.atk,s.def,s.spd,s.weapon_id,s.armor_id,s.win,s.loss
    FROM users u
    JOIN wallets w ON w.jid=u.jid
    JOIN stats s ON s.jid=u.jid
    WHERE u.jid=$1
  `, [jid])
  return rows[0] ?? null
}

export async function claimCooldown(queryable, key, seconds) {
  const now = Math.floor(Date.now()/1000)
  const expires = now + seconds
  const claimed = await queryable.query(`
    INSERT INTO cooldowns(key,expires_at) VALUES($1,$2)
    ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at
    WHERE cooldowns.expires_at <= $3
    RETURNING expires_at
  `,[key,expires,now])
  if(claimed.rowCount) return {ok:true,expires}
  const current=await queryable.query('SELECT expires_at FROM cooldowns WHERE key=$1',[key])
  return {ok:false,remaining:Math.max(1,Number(current.rows[0]?.expires_at||now)-now)}
}

function streakRewardFor(streak){
  const cycleDay=((Number(streak)-1)%30)+1
  if(cycleDay===3) return { label:'🎁 Caixa da Sorte', itemId:'caixa_sorte', qty:1, bonusCash:0 }
  if(cycleDay===7) return { label:'🔵 Caixa Rara', itemId:'caixa_rara', qty:1, bonusCash:0 }
  if(cycleDay===15) return { label:'🟣 Caixa Épica', itemId:'caixa_epica', qty:1, bonusCash:0 }
  if(cycleDay===30) return { label:'🏆 R$ 20.000 + Caixa Épica', itemId:'caixa_epica', qty:1, bonusCash:20000 }
  return null
}

function nextStreakMilestone(streak){
  const cycleDay=((Math.max(1,Number(streak)||1)-1)%30)+1
  const checkpoints=[3,7,15,30]
  const next=checkpoints.find(n=>n>cycleDay) ?? 30
  const days=next-cycleDay
  const labels={3:'Caixa da Sorte',7:'Caixa Rara',15:'Caixa Épica',30:'R$ 20.000 + Caixa Épica'}
  return { day:next, days:Math.max(0,days), label:labels[next] }
}

async function ensureDailyStreakState(queryable,jid){
  await queryable.query(`
    INSERT INTO daily_streaks(jid,streak,best_streak,last_claim_day)
    SELECT
      $1,
      1,
      1,
      (to_timestamp(expires_at - 72000) AT TIME ZONE 'America/Sao_Paulo')::date
    FROM cooldowns
    WHERE key=$2
      AND (to_timestamp(expires_at - 72000) AT TIME ZONE 'America/Sao_Paulo')::date
          >= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 1)
    ON CONFLICT(jid) DO NOTHING
  `,[jid,`daily:${jid}`])

  await queryable.query(`
    INSERT INTO daily_streaks(jid,streak,best_streak,last_claim_day)
    VALUES($1,0,0,NULL)
    ON CONFLICT(jid) DO NOTHING
  `,[jid])
}

export async function getDailyStreak(jid) {
  await ensureUser(jid)
  await ensureDailyStreakState(db,jid)
  const {rows}=await db.query(`
    SELECT d.streak,d.best_streak,d.last_claim_day,
           TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS today
    FROM (SELECT $1::text AS jid) x
    LEFT JOIN daily_streaks d ON d.jid=x.jid
  `,[jid])

  const row=rows[0]||{}
  const streak=Number(row.streak||0)
  const bestStreak=Number(row.best_streak||0)
  const lastClaimDay=row.last_claim_day instanceof Date
    ? row.last_claim_day.toISOString().slice(0,10)
    : (String(row.last_claim_day||'').match(/\\d{4}-\\d{2}-\\d{2}/)?.[0] || null)
  const today=String(row.today||'')
  return {
    streak,
    bestStreak,
    lastClaimDay,
    claimedToday:Boolean(lastClaimDay && lastClaimDay===today),
    next:nextStreakMilestone(streak)
  }
}

export async function claimDaily(jid) {
  await ensureUser(jid)

  return transaction(async client=>{
    const clock=await client.query(`
      SELECT
        TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS today,
        TO_CHAR((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 1,'YYYY-MM-DD') AS yesterday,
        GREATEST(
          1,
          FLOOR(EXTRACT(EPOCH FROM (
            (((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
            - NOW()
          )))
        )::INT AS remaining
    `)
    const {today,yesterday,remaining}=clock.rows[0]

    await ensureDailyStreakState(client,jid)

    const stateR=await client.query(
      'SELECT streak,best_streak,last_claim_day FROM daily_streaks WHERE jid=$1 FOR UPDATE',
      [jid]
    )
    const state=stateR.rows[0]
    // pg devolve DATE como Date em UTC em muitos ambientes. String(Date).slice(0,10)
    // vira "Wed O..." e fazia a sequência reiniciar em 1 diariamente.
    const dateKey=(value)=>{
      if(!value) return null
      if(value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10)
      const raw=String(value)
      const iso=raw.match(/\\d{4}-\\d{2}-\\d{2}/)
      return iso ? iso[0] : null
    }
    const lastDay=dateKey(state.last_claim_day)

    if(lastDay===today){
      return {
        ok:false,
        remaining:Number(remaining||1),
        streak:Number(state.streak||0),
        bestStreak:Number(state.best_streak||0)
      }
    }

    const continued=lastDay===yesterday
    const streak=continued ? Number(state.streak||0)+1 : 1
    const bestStreak=Math.max(Number(state.best_streak||0),streak)
    const baseAmount=5000
    const reward=streakRewardFor(streak)
    const bonusCash=Number(reward?.bonusCash||0)
    const totalCash=baseAmount+bonusCash

    await client.query(
      `UPDATE daily_streaks
       SET streak=$1,best_streak=$2,last_claim_day=$3::date,updated_at=${nowSql}
       WHERE jid=$4`,
      [streak,bestStreak,today,jid]
    )

    await client.query(
      'UPDATE wallets SET cash=cash+$1, updated_at='+nowSql+' WHERE jid=$2',
      [totalCash,jid]
    )

    await client.query(`
      INSERT INTO transactions (from_jid,to_jid,amount,type,note)
      VALUES ('system',$1,$2,'reward',$3)
    `,[jid,totalCash,`daily streak:${streak}`])

    if(reward?.itemId){
      await client.query(`
        INSERT INTO inventories(jid,item_id,quantity)
        VALUES($1,$2,$3)
        ON CONFLICT(jid,item_id)
        DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity
      `,[jid,reward.itemId,reward.qty||1])
    }

    return {
      ok:true,
      amount:baseAmount,
      bonusCash,
      totalCash,
      streak,
      bestStreak,
      continued,
      reward:reward ? {label:reward.label,itemId:reward.itemId,qty:reward.qty||0,bonusCash} : null,
      next:nextStreakMilestone(streak)
    }
  })
}

const CAREER_RANKS=[
  {name:'Ajudante',xp:0,mult:1},
  {name:'Auxiliar',xp:100,mult:1.12},
  {name:'Assistente',xp:300,mult:1.25},
  {name:'Analista',xp:700,mult:1.45},
  {name:'Especialista',xp:1400,mult:1.7},
  {name:'Coordenador',xp:2500,mult:2},
  {name:'Gerente',xp:4000,mult:2.4},
  {name:'Diretor',xp:6500,mult:3},
  {name:'CEO',xp:10000,mult:4},
]
const careerRank=xp=>[...CAREER_RANKS].reverse().find(r=>xp>=r.xp)||CAREER_RANKS[0]

export async function getCareer(jid){
  await ensureUser(jid)
  await db.query(`INSERT INTO careers(jid) VALUES($1) ON CONFLICT(jid) DO NOTHING`,[jid])
  const {rows}=await db.query('SELECT career_xp,total_shifts FROM careers WHERE jid=$1',[jid])
  const row=rows[0], rank=careerRank(Number(row.career_xp))
  const idx=CAREER_RANKS.findIndex(r=>r.name===rank.name), next=CAREER_RANKS[idx+1]||null
  return {...row,rank,next}
}

export async function work(jid) {
  await ensureUser(jid)
  const jobs=['organizando documentos','atendendo clientes','resolvendo uma demanda','fechando um relatório','ajudando a equipe','entregando um projeto']
  return transaction(async client=>{
    const cd=await claimCooldown(client,`work:${jid}`,30*60)
    if(!cd.ok) return cd
    await client.query(`INSERT INTO careers(jid) VALUES($1) ON CONFLICT(jid) DO NOTHING`,[jid])
    const cr=(await client.query('SELECT career_xp,total_shifts FROM careers WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const oldXp=Number(cr.career_xp), oldRank=careerRank(oldXp)
    const xpGain=25+Math.floor(Math.random()*16)
    const newXp=oldXp+xpGain, newRank=careerRank(newXp)
    let base=700+Math.floor(Math.random()*701)
    let event=null, factor=1
    const roll=Math.random()
    if(roll<.08){event='🌟 Excelente desempenho! Bônus de 50%.';factor=1.5}
    else if(roll<.15){event='⏰ Hora extra! Bônus de 25%.';factor=1.25}
    else if(roll<.19){event='😴 Dia complicado. Rendimento 15% menor.';factor=.85}
    const gross=Math.max(1,Math.round(base*newRank.mult*factor))
    const tax=Math.floor(gross*.10)
    const amount=gross-tax
    await client.query('UPDATE careers SET career_xp=$1,total_shifts=total_shifts+1,updated_at='+nowSql+' WHERE jid=$2',[newXp,jid])
    await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[amount,jid])
    await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'work',$3)`,
      [jid,gross,`${newRank.name} | ${jobs[Math.floor(Math.random()*jobs.length)]}`])
    if(tax>0) await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'income_tax','TAXADE te pegou 10% | trabalho')`,[jid,tax])
    const promoted=newRank.name!==oldRank.name
    const idx=CAREER_RANKS.findIndex(r=>r.name===newRank.name), next=CAREER_RANKS[idx+1]||null
    return {ok:true,gross,tax,taxRate:10,amount,job:newRank.name,careerXp:newXp,xpGain,totalShifts:Number(cr.total_shifts)+1,event,promoted,oldRank:oldRank.name,rank:newRank,next}
  })
}

export async function deposit(jid, amount) {
  amount = Number(amount)
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor inválido.')

  return transaction(async client => {
    const { rows } = await client.query('SELECT * FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const w=rows[0]
    if (!w || Number(w.cash) < amount) throw new Error('Saldo em carteira insuficiente.')
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

export async function purchaseService(jid, serviceId, price) {
  price=Number(price)
  if(!Number.isSafeInteger(price) || price<1) throw new Error('Preço de serviço inválido.')
  await ensureUser(jid)

  return transaction(async client=>{
    const walletR=await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const wallet=walletR.rows[0]
    const cash=Number(wallet?.cash||0), bank=Number(wallet?.bank||0)
    if(!wallet || cash+bank<price) throw new Error('Saldo insuficiente para essa compra.')
    const fromCash=Math.min(cash,price)
    const fromBank=price-fromCash

    await client.query(
      'UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at='+nowSql+' WHERE jid=$3',
      [fromCash,fromBank,jid]
    )
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'shop',$2,'service',$3)
    `,[jid,price,serviceId])

    return { serviceId, price, cash:cash-fromCash, bank:bank-fromBank }
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
    const walletR = await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const wallet=walletR.rows[0]
    const cash=Number(wallet?.cash||0), bank=Number(wallet?.bank||0)
    if (!wallet || cash+bank < total) throw new Error('Saldo insuficiente para essa compra.')
    const fromCash=Math.min(cash,total)
    const fromBank=total-fromCash

    await client.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2, updated_at='+nowSql+' WHERE jid=$3',[fromCash,fromBank,jid])
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
    SELECT i.item_id,i.quantity,it.name,it.description,it.category,it.rarity,it.price,
           CASE
             WHEN it.price > 0 THEN GREATEST(1,FLOOR(it.price*0.50))
             WHEN it.rarity='legendary' THEN 100000
             WHEN it.rarity='epic' THEN 25000
             WHEN it.rarity='rare' THEN 7500
             WHEN it.rarity='uncommon' THEN 2500
             ELSE 500
           END::bigint AS sell_unit
    FROM inventories i
    JOIN items it ON it.id=i.item_id
    WHERE i.jid=$1 AND i.quantity>0
    ORDER BY
      CASE it.category
        WHEN 'weapon' THEN 1
        WHEN 'armor' THEN 2
        WHEN 'consumable' THEN 3
        WHEN 'special' THEN 4
        ELSE 5
      END,
      CASE it.rarity
        WHEN 'legendary' THEN 5
        WHEN 'epic' THEN 4
        WHEN 'rare' THEN 3
        WHEN 'uncommon' THEN 2
        ELSE 1
      END DESC,
      it.name
  `,[jid])
  return rows
}

export async function sellItem(jid, itemId, qty=1) {
  qty=Number(qty)
  if(!Number.isInteger(qty) || qty<1 || qty>9999) throw new Error('Quantidade inválida.')

  await ensureUser(jid)

  return transaction(async client=>{
    const invR=await client.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
      [jid,itemId]
    )
    const owned=Number(invR.rows[0]?.quantity||0)
    if(owned<1) throw new Error('Você não possui esse item.')

    const itemR=await client.query('SELECT * FROM items WHERE id=$1',[itemId])
    const item=itemR.rows[0]
    if(!item) throw new Error('Item não encontrado.')

    const statsR=await client.query(
      'SELECT weapon_id,armor_id FROM stats WHERE jid=$1 FOR UPDATE',
      [jid]
    )
    const stats=statsR.rows[0]||{}
    const equipped=(stats.weapon_id===itemId || stats.armor_id===itemId) ? 1 : 0
    const sellable=Math.max(0,owned-equipped)

    if(sellable<1){
      throw new Error('Essa é sua única cópia equipada. Troque o equipamento antes de vender.')
    }
    if(qty>sellable){
      throw new Error(`Você pode vender no máximo ${sellable} unidade(s); 1 cópia está equipada.`)
    }

    let unit
    if(Number(item.price)>0) unit=Math.max(1,Math.floor(Number(item.price)*0.50))
    else if(item.rarity==='legendary') unit=100000
    else if(item.rarity==='epic') unit=25000
    else if(item.rarity==='rare') unit=7500
    else if(item.rarity==='uncommon') unit=2500
    else unit=500

    const total=unit*qty

    await client.query(
      'UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3',
      [qty,jid,itemId]
    )
    await client.query(
      'UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',
      [total,jid]
    )
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('shop',$1,$2,'sale',$3)
    `,[jid,total,`${itemId} x${qty}`])

    const walletR=await client.query('SELECT cash FROM wallets WHERE jid=$1',[jid])

    return {
      item:{
        id:item.id,
        name:item.name,
        rarity:item.rarity,
        category:item.category
      },
      qty,
      unit,
      total,
      remaining:owned-qty,
      equipped:Boolean(equipped),
      cash:Number(walletR.rows[0]?.cash||0)
    }
  })
}

export async function sellItemsBatch(jid, selections=[]) {
  if(!Array.isArray(selections) || selections.length<1 || selections.length>50) {
    throw new Error('Seleção de venda inválida.')
  }

  const normalized=selections.map(s=>({
    itemId:String(s?.itemId||''),
    qty:Number(s?.qty||0)
  }))

  if(normalized.some(s=>!s.itemId || !Number.isInteger(s.qty) || s.qty<1 || s.qty>9999)) {
    throw new Error('Quantidade inválida na venda em lote.')
  }

  await ensureUser(jid)

  return transaction(async client=>{
    const statsR=await client.query(
      'SELECT weapon_id,armor_id FROM stats WHERE jid=$1 FOR UPDATE',
      [jid]
    )
    const stats=statsR.rows[0]||{}
    const sold=[]
    let grandTotal=0
    let totalUnits=0

    for(const sel of normalized){
      const invR=await client.query(
        'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
        [jid,sel.itemId]
      )
      const owned=Number(invR.rows[0]?.quantity||0)
      if(owned<1) throw new Error('Um dos itens selecionados não está mais no inventário.')

      const itemR=await client.query('SELECT * FROM items WHERE id=$1',[sel.itemId])
      const item=itemR.rows[0]
      if(!item) throw new Error('Item não encontrado.')
      if(item.rarity==='legendary') throw new Error('Itens lendários não entram em venda em lote.')

      const equipped=(stats.weapon_id===sel.itemId || stats.armor_id===sel.itemId)
      const minimumKeep=1
      const maxBatch=Math.max(0,owned-minimumKeep)

      if(sel.qty>maxBatch){
        throw new Error(`A venda em lote de ${item.name} deve manter pelo menos 1 cópia.`)
      }

      let unit
      if(Number(item.price)>0) unit=Math.max(1,Math.floor(Number(item.price)*0.50))
      else if(item.rarity==='epic') unit=25000
      else if(item.rarity==='rare') unit=7500
      else if(item.rarity==='uncommon') unit=2500
      else unit=500

      const total=unit*sel.qty
      await client.query(
        'UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3',
        [sel.qty,jid,sel.itemId]
      )

      sold.push({
        itemId:item.id,
        name:item.name,
        rarity:item.rarity,
        qty:sel.qty,
        remaining:owned-sel.qty,
        unit,
        total,
        equipped
      })
      grandTotal+=total
      totalUnits+=sel.qty
    }

    await client.query(
      'UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',
      [grandTotal,jid]
    )

    for(const row of sold){
      await client.query(`
        INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES('shop',$1,$2,'sale_batch',$3)
      `,[jid,row.total,`${row.itemId} x${row.qty}`])
    }

    const walletR=await client.query('SELECT cash FROM wallets WHERE jid=$1',[jid])
    return {
      sold,
      types:sold.length,
      totalUnits,
      total:grandTotal,
      cash:Number(walletR.rows[0]?.cash||0)
    }
  })
}



export async function saveSnipeMessage({
  chat,messageId,sender='',pushName='',text='',mediaLabel='',
  mediaType=null,mimeType=null,mediaBuffer=null,createdAt=Date.now(),expiresAt=Date.now()+30*60*1000
}){
  if(!chat || !messageId) return false
  const buf=mediaBuffer ? Buffer.from(mediaBuffer) : null
  if(buf && buf.length>8*1024*1024) throw new Error('Snipe media exceeds 8 MB.')
  await db.query('DELETE FROM snipe_messages WHERE expires_at < $1',[Date.now()])
  await db.query(`
    INSERT INTO snipe_messages(
      chat_jid,message_id,sender_jid,push_name,text_content,media_label,
      media_type,mime_type,media_data,created_at,expires_at
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(chat_jid,message_id) DO UPDATE SET
      sender_jid=EXCLUDED.sender_jid,
      push_name=EXCLUDED.push_name,
      text_content=EXCLUDED.text_content,
      media_label=EXCLUDED.media_label,
      media_type=EXCLUDED.media_type,
      mime_type=EXCLUDED.mime_type,
      media_data=EXCLUDED.media_data,
      created_at=EXCLUDED.created_at,
      expires_at=EXCLUDED.expires_at
  `,[
    chat,messageId,sender,pushName,text,mediaLabel,mediaType,mimeType,
    buf?.length ? buf.toString('base64') : null,
    Math.floor(Number(createdAt)||Date.now()),
    Math.floor(Number(expiresAt)||Date.now()+30*60*1000)
  ])
  return true
}

function snipeRow(row){
  if(!row) return null
  let mediaBuffer=null
  try{ if(row.media_data) mediaBuffer=Buffer.from(row.media_data,'base64') }catch{}
  return {
    chat:row.chat_jid,
    messageId:row.message_id,
    sender:row.sender_jid,
    pushName:row.push_name||'',
    text:row.text_content||'',
    mediaLabel:row.media_label||'',
    mediaType:row.media_type||null,
    mimeType:row.mime_type||null,
    mediaBuffer,
    createdAt:Number(row.created_at||0),
    deletedAt:Number(row.deleted_at||0),
    expiresAt:Number(row.expires_at||0)
  }
}

export async function markSnipeDeleted(chat,messageId){
  if(!chat || !messageId) return null
  const {rows}=await db.query(`
    UPDATE snipe_messages
    SET deleted_at=${nowSql}
    WHERE chat_jid=$1 AND message_id=$2 AND expires_at >= $3
    RETURNING *
  `,[chat,messageId,Date.now()])
  return snipeRow(rows[0])
}

export async function getLastDeletedSnipe(chat){
  const {rows}=await db.query(`
    SELECT * FROM snipe_messages
    WHERE chat_jid=$1 AND deleted_at IS NOT NULL AND expires_at >= $2
    ORDER BY deleted_at DESC
    LIMIT 1
  `,[chat,Date.now()])
  return snipeRow(rows[0])
}

export async function cleanupSnipeMessages(){
  const r=await db.query('DELETE FROM snipe_messages WHERE expires_at < $1',[Date.now()])
  return r.rowCount
}


export async function getProfileAvatar(jid){
  const {rows}=await db.query('SELECT image_data,mime_type FROM profile_avatars WHERE jid=$1',[jid])
  if(!rows[0]) return null
  try{
    return { buffer:Buffer.from(rows[0].image_data,'base64'), mimeType:rows[0].mime_type }
  }catch{return null}
}

export async function setProfileAvatar(jid,buffer,mimeType='image/jpeg'){
  await ensureUser(jid)
  const b=Buffer.from(buffer)
  if(!b.length) throw new Error('Imagem vazia.')
  if(b.length>8*1024*1024) throw new Error('A imagem deve ter no máximo 8 MB.')
  await db.query(`
    INSERT INTO profile_avatars(jid,image_data,mime_type,updated_at)
    VALUES($1,$2,$3,${nowSql})
    ON CONFLICT(jid) DO UPDATE
    SET image_data=EXCLUDED.image_data,mime_type=EXCLUDED.mime_type,updated_at=${nowSql}
  `,[jid,b.toString('base64'),mimeType])
  return true
}

export async function removeProfileAvatar(jid){
  const r=await db.query('DELETE FROM profile_avatars WHERE jid=$1',[jid])
  return r.rowCount>0
}

export async function getPlayerRanks(jid) {
  const {rows}=await db.query(`
    SELECT
      1+(SELECT COUNT(*) FROM users x JOIN wallets wx ON wx.jid=x.jid
         WHERE x.jid NOT LIKE '%@local'
           AND x.jid NOT LIKE '%@lid'
           AND x.jid NOT LIKE '%:%@s.whatsapp.net'
           AND COALESCE(NULLIF(BTRIM(x.push_name),''),'')<>''
           AND LOWER(BTRIM(x.push_name))<>'jogador' AND
         ((wx.cash+wx.bank)>(w.cash+w.bank) OR
          ((wx.cash+wx.bank)=(w.cash+w.bank) AND x.level>u.level) OR
          ((wx.cash+wx.bank)=(w.cash+w.bank) AND x.level=u.level AND x.created_at<u.created_at))) AS economy_rank,
      1+(SELECT COUNT(*) FROM users x JOIN stats sx ON sx.jid=x.jid
         WHERE x.jid NOT LIKE '%@local'
           AND x.jid NOT LIKE '%@lid'
           AND x.jid NOT LIKE '%:%@s.whatsapp.net'
           AND COALESCE(NULLIF(BTRIM(x.push_name),''),'')<>''
           AND LOWER(BTRIM(x.push_name))<>'jogador' AND
         ((sx.win*3-sx.loss)>(s.win*3-s.loss) OR
          ((sx.win*3-sx.loss)=(s.win*3-s.loss) AND sx.win>s.win) OR
          ((sx.win*3-sx.loss)=(s.win*3-s.loss) AND sx.win=s.win AND x.level>u.level))) AS combat_rank,
      (SELECT COUNT(*) FROM users x
       WHERE x.jid NOT LIKE '%@local'
         AND x.jid NOT LIKE '%@lid'
         AND x.jid NOT LIKE '%:%@s.whatsapp.net'
         AND COALESCE(NULLIF(BTRIM(x.push_name),''),'')<>''
         AND LOWER(BTRIM(x.push_name))<>'jogador') AS players
    FROM users u JOIN wallets w ON w.jid=u.jid JOIN stats s ON s.jid=u.jid
    WHERE u.jid=$1
  `,[jid])
  const r=rows[0]||{}
  return {economyRank:Number(r.economy_rank||0),combatRank:Number(r.combat_rank||0),players:Number(r.players||0)}
}

export async function leaderboard(limit=10, participantJids=[]) {
  const participants=[...new Set((participantJids||[]).filter(Boolean))]
  const { rows } = await db.query(`
    SELECT u.jid,u.push_name,u.level,
           COALESCE(w.cash,0)::bigint AS cash,
           COALESCE(w.bank,0)::bigint AS bank,
           (COALESCE(w.cash,0)+COALESCE(w.bank,0))::bigint AS total
    FROM users u
    JOIN wallets w ON w.jid=u.jid
    WHERE u.jid NOT LIKE '%@local'
      AND u.jid NOT LIKE '%@lid'
      AND u.jid NOT LIKE '%:%@s.whatsapp.net'
      AND COALESCE(NULLIF(BTRIM(u.push_name),''),'') <> ''
      AND LOWER(BTRIM(u.push_name)) <> 'jogador'
      AND (CARDINALITY($2::text[])=0 OR u.jid=ANY($2::text[]))
    ORDER BY total DESC,u.level DESC,u.created_at ASC
    LIMIT $1
  `,[limit,participants])
  return rows
}


const EQUIPMENT = {
  espada_madeira: { category:'weapon', atk:5, def:0, name:'Espada de Madeira' },
  espada_ferro: { category:'weapon', atk:12, def:0, name:'Espada de Ferro' },
  espada_aco: { category:'weapon', atk:20, def:0, name:'Espada de Aço' },
  machado_guerra: { category:'weapon', atk:24, def:0, name:'Machado de Guerra' },
  katana_sombria: { category:'weapon', atk:28, def:0, name:'Katana Sombria' },
  espada_flamas: { category:'weapon', atk:40, def:0, name:'Espada das Chamas' },
  tridente_tempestade: { category:'weapon', atk:48, def:0, name:'Tridente da Tempestade' },
  lamina_abissal: { category:'weapon', atk:55, def:0, name:'Lâmina Abissal' },
  martelo_golem: { category:'weapon', atk:70, def:0, name:'Martelo do Golem Ancestral' },
  excalibur: { category:'weapon', atk:85, def:0, name:'Excalibur' },
  katana_divina: { category:'weapon', atk:95, def:0, name:'Katana Divina' },

  armadura_couro: { category:'armor', atk:0, def:5, name:'Armadura de Couro' },
  armadura_ferro: { category:'armor', atk:0, def:12, name:'Armadura de Ferro' },
  armadura_aco: { category:'armor', atk:0, def:20, name:'Armadura de Aço' },
  armadura_samurai: { category:'armor', atk:0, def:24, name:'Armadura Samurai' },
  armadura_cavaleiro: { category:'armor', atk:0, def:28, name:'Armadura do Cavaleiro' },
  armadura_dragao: { category:'armor', atk:0, def:40, name:'Armadura de Dragão' },
  armadura_abissal: { category:'armor', atk:0, def:48, name:'Armadura Abissal' },
  armadura_celestial: { category:'armor', atk:0, def:55, name:'Armadura Celestial' },
  armadura_golem: { category:'armor', atk:0, def:70, name:'Armadura do Golem Ancestral' },
  armadura_titan: { category:'armor', atk:0, def:85, name:'Armadura do Titã' },
  armadura_divina: { category:'armor', atk:0, def:95, name:'Armadura Divina' },
}

const POTIONS = {
  pocao_p: { heal:35, name:'Poção Pequena' },
  pocao_m: { heal:80, name:'Poção Média' },
  pocao_g: { heal:160, name:'Poção Grande' },
  elixir_supremo: { heal:999999, name:'Elixir Supremo' },
}

const MAX_LEVEL=999
const MAX_ADMIN_EXP=50_000_000

function expNeeded(level) {
  return Math.max(100, Number(level) * 100)
}

async function applyExp(client, jid, gain) {
  const numericGain=Number(gain)
  if(!Number.isSafeInteger(numericGain) || numericGain<0) throw new Error('EXP inválida.')

  const r = await client.query('SELECT level,exp FROM users WHERE jid=$1 FOR UPDATE',[jid])
  if (!r.rows[0]) return { level:1, exp:0, levels:0 }

  let level=Math.min(MAX_LEVEL,Math.max(1,Number(r.rows[0].level)||1))
  let exp=Math.max(0,Number(r.rows[0].exp)||0)+numericGain
  let levels=0

  // Nunca passa de 998 iterações, mesmo com EXP enorme.
  while(level<MAX_LEVEL && exp>=expNeeded(level)) {
    exp-=expNeeded(level)
    level++
    levels++
  }

  // Nível máximo não acumula EXP infinito.
  if(level>=MAX_LEVEL) exp=0

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

export function getEquipmentInfo(itemId) {
  const eq=EQUIPMENT[itemId]
  return eq ? {...eq,itemId} : null
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
    const cd=await claimCooldown(client,`battle:${attackerJid}`,10*60)
    if(!cd.ok) return {ok:false,remaining:cd.remaining}

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

function directDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL)
  url.hostname = url.hostname.replace('-pooler.', '.')
  return url.toString()
}

export async function acquireRuntimeLock(sessionId) {
  if (runtimeLockClient) return true

  // v2 intentionally uses a new key because older releases acquired the
  // session advisory lock through PgBouncer, which could leave it pinned
  // to a pooled backend after a rolling deploy.
  const lockName = `trevo-whatsapp-v2:${sessionId}`
  const connectionString = directDatabaseUrl()

  while (true) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 15000,
      application_name: 'trevo-runtime-lock'
    })

    try {
      await client.connect()
      const { rows } = await client.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
        [lockName]
      )

      if (rows[0]?.locked) {
        runtimeLockClient = client
        client.on('error', err=>{
          console.error('[Runtime] conexão direta do lock Neon encerrada',err?.message || err)
          if(runtimeLockClient===client) runtimeLockClient=null
          setTimeout(()=>process.exit(1),100)
        })
        console.log('[Runtime] lock exclusivo direto adquirido para', sessionId)
        return true
      }
    } catch (err) {
      await client.end().catch(()=>{})
      throw err
    }

    await client.end().catch(()=>{})
    console.log('[Runtime] outra instância ainda usa a sessão; aguardando...')
    await new Promise(resolve => setTimeout(resolve, 2500))
  }
}


export async function saveQuickFlow(flowKey, chatJid, senderJid, stage, data, expiresAtMs) {
  const expiresAt=Math.floor(Number(expiresAtMs)/1000)
  await db.query(`
    INSERT INTO quick_flows(flow_key,chat_jid,sender_jid,stage,data,expires_at,updated_at)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,${nowSql})
    ON CONFLICT(flow_key) DO UPDATE
    SET chat_jid=EXCLUDED.chat_jid,
        sender_jid=EXCLUDED.sender_jid,
        stage=EXCLUDED.stage,
        data=EXCLUDED.data,
        expires_at=EXCLUDED.expires_at,
        updated_at=${nowSql}
  `,[flowKey,chatJid,senderJid,stage,JSON.stringify(data??{}),expiresAt])
}

export async function getStoredQuickFlow(flowKey) {
  const now=Math.floor(Date.now()/1000)
  const {rows}=await db.query(
    'SELECT stage,data,expires_at FROM quick_flows WHERE flow_key=$1 AND expires_at>$2',
    [flowKey,now]
  )
  const row=rows[0]
  if(!row){
    await db.query('DELETE FROM quick_flows WHERE flow_key=$1',[flowKey]).catch(()=>{})
    return null
  }
  return {
    stage:row.stage,
    data:row.data||{},
    expiresAt:Number(row.expires_at)*1000
  }
}

export async function deleteQuickFlow(flowKey) {
  await db.query('DELETE FROM quick_flows WHERE flow_key=$1',[flowKey])
}

export async function cleanupQuickFlows() {
  const now=Math.floor(Date.now()/1000)
  await db.query('DELETE FROM quick_flows WHERE expires_at<=$1',[now])
}

export async function getGroupSettings(chatJid) {
  const { rows } = await db.query(`
    INSERT INTO group_settings(chat_jid)
    VALUES ($1)
    ON CONFLICT(chat_jid) DO UPDATE SET chat_jid=EXCLUDED.chat_jid
    RETURNING *
  `,[chatJid])
  return rows[0]
}

export async function setGroupSetting(chatJid, key, enabled, updatedBy='') {
  const allowed=new Set(['economy_enabled','rpg_enabled','games_enabled','progression_enabled'])
  if(!allowed.has(key)) throw new Error('Configuração de grupo inválida.')
  await getGroupSettings(chatJid)
  const { rows } = await db.query(
    `UPDATE group_settings
     SET ${key}=$1, updated_by=$2, updated_at=${nowSql}
     WHERE chat_jid=$3
     RETURNING *`,
    [Boolean(enabled),updatedBy,chatJid]
  )
  return rows[0]
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


export async function ownerSetBalance(jid, amount) {
  amount=Number(amount)
  if(!Number.isSafeInteger(amount) || amount<0) throw new Error('Valor inválido.')
  await ensureUser(jid)

  return transaction(async client=>{
    const r=await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const oldCash=Number(r.rows[0]?.cash||0)
    await client.query(
      'UPDATE wallets SET cash=$1,updated_at='+nowSql+' WHERE jid=$2',
      [amount,jid]
    )
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('owner',$1,$2,'owner_set_balance',$3)
    `,[jid,Math.abs(amount-oldCash),`from:${oldCash};to:${amount}`])
    return { oldCash, cash:amount, bank:Number(r.rows[0]?.bank||0) }
  })
}

export async function ownerResetBalance(jid) {
  await ensureUser(jid)

  return transaction(async client=>{
    const r=await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const cash=Number(r.rows[0]?.cash||0)
    const bank=Number(r.rows[0]?.bank||0)
    await client.query(
      'UPDATE wallets SET cash=0,bank=0,updated_at='+nowSql+' WHERE jid=$1',
      [jid]
    )
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'owner',$2,'owner_reset_balance','admin reset cash+bank')
    `,[jid,cash+bank])
    return { oldCash:cash, oldBank:bank, cash:0, bank:0 }
  })
}

export async function ownerResetExp(jid) {
  await ensureUser(jid)

  return transaction(async client=>{
    const u=await client.query('SELECT level,exp FROM users WHERE jid=$1 FOR UPDATE',[jid])
    const oldLevel=Number(u.rows[0]?.level||1)
    const oldExp=Number(u.rows[0]?.exp||0)
    await client.query(
      'UPDATE users SET level=1,exp=0,updated_at='+nowSql+' WHERE jid=$1',
      [jid]
    )
    await client.query(`
      UPDATE stats
      SET hp=100,max_hp=100,atk=10,def=5,spd=10,updated_at=${nowSql}
      WHERE jid=$1
    `,[jid])
    return { oldLevel, oldExp, level:1, exp:0 }
  })
}

export async function ownerResetInventory(jid) {
  await ensureUser(jid)

  return transaction(async client=>{
    const r=await client.query('SELECT COALESCE(SUM(quantity),0)::BIGINT AS qty FROM inventories WHERE jid=$1',[jid])
    const removed=Number(r.rows[0]?.qty||0)
    await client.query('DELETE FROM inventories WHERE jid=$1',[jid])
    await client.query(
      'UPDATE stats SET weapon_id=NULL,armor_id=NULL,updated_at='+nowSql+' WHERE jid=$1',
      [jid]
    )
    return { removed }
  })
}

export async function ownerResetTotal(jid) {
  await ensureUser(jid)

  return transaction(async client=>{
    const u=await client.query('SELECT level,exp FROM users WHERE jid=$1 FOR UPDATE',[jid])
    const w=await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const inv=await client.query('SELECT COALESCE(SUM(quantity),0)::BIGINT AS qty FROM inventories WHERE jid=$1',[jid])

    const previous={
      level:Number(u.rows[0]?.level||1),
      exp:Number(u.rows[0]?.exp||0),
      cash:Number(w.rows[0]?.cash||0),
      bank:Number(w.rows[0]?.bank||0),
      inventory:Number(inv.rows[0]?.qty||0)
    }

    await client.query(
      'UPDATE users SET level=1,exp=0,updated_at='+nowSql+' WHERE jid=$1',
      [jid]
    )
    await client.query(
      'UPDATE wallets SET cash=0,bank=0,bank_limit=9223372036854775807,updated_at='+nowSql+' WHERE jid=$1',
      [jid]
    )
    await client.query(`
      UPDATE stats
      SET hp=100,max_hp=100,atk=10,def=5,spd=10,
          weapon_id=NULL,armor_id=NULL,win=0,loss=0,updated_at=${nowSql}
      WHERE jid=$1
    `,[jid])
    await client.query('DELETE FROM inventories WHERE jid=$1',[jid])
    await client.query('DELETE FROM cooldowns WHERE key LIKE $1',[`%:${jid}`])
    await client.query('DELETE FROM daily_streaks WHERE jid=$1',[jid])
    await client.query('DELETE FROM profile_avatars WHERE jid=$1',[jid])

    // Tabelas de progressão são criadas por initProgression() antes dos comandos serem usados.
    await client.query('DELETE FROM daily_missions WHERE jid=$1',[jid])
    await client.query('DELETE FROM user_homes WHERE jid=$1',[jid])
    await client.query('DELETE FROM user_cars WHERE jid=$1',[jid])

    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'owner',$2,'owner_reset_total','admin full gameplay reset')
    `,[jid,previous.cash+previous.bank])

    return { ...previous, level:1, exp:0, cash:0, bank:0, inventory:0 }
  })
}

export async function ownerAddExp(jid, amount) {
  amount=Number(amount)
  if(!Number.isSafeInteger(amount) || amount<=0 || amount>MAX_ADMIN_EXP) {
    throw new Error('EXP inválida. Use no máximo 50.000.000 por ação.')
  }
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


export async function grantExp(jid,gain){
  await ensureUser(jid)
  return transaction(async client=>applyExp(client,jid,Number(gain)))
}

// Permite que recompensas compostas (dinheiro, item e EXP) sejam confirmadas
// juntas na mesma transação. O chamador deve fornecer um client transacional.
export async function grantExpInTransaction(client,jid,gain){
  return applyExp(client,jid,Number(gain))
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
  if(String(plan).toLowerCase()==='permanent'){
    await db.query(`
      INSERT INTO group_licenses(chat_jid,status,plan,trial_started_at,paid_until,activated_by,updated_at)
      VALUES($1,'active','permanent',NULL,NULL,$2,${nowSql})
      ON CONFLICT(chat_jid)
      DO UPDATE SET status='active',plan='permanent',trial_started_at=NULL,paid_until=NULL,
                    activated_by=EXCLUDED.activated_by,updated_at=EXCLUDED.updated_at
    `,[chatJid,activatedBy])
    return getGroupLicense(chatJid)
  }
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
  if(String(license.plan||'').toLowerCase()==='permanent') return true
  const now=Math.floor(Date.now()/1000)
  return Number(license.paid_until||0)>now
}


const BOX_CONFIG = {
  caixa_sorte: {
    legendary:0.001,
    epic:0.015,
    rare:0.08,
    uncommon:0.25,
    cashChance:0.38,
    expChance:0.18,
    cash:[800,4500],
    exp:[60,220]
  },
  caixa_rara: {
    legendary:0.003,
    epic:0.05,
    rare:0.25,
    uncommon:0.40,
    cashChance:0.20,
    expChance:0.10,
    cash:[2500,12000],
    exp:[120,450]
  },
  caixa_epica: {
    legendary:0.01,
    epic:0.20,
    rare:0.50,
    uncommon:0.70,
    cashChance:0.12,
    expChance:0.08,
    cash:[7000,30000],
    exp:[250,900]
  }
}

const LOOT_POOLS = {
  common:['pocao_p','espada_madeira','armadura_couro'],
  uncommon:['pocao_m','espada_ferro','armadura_ferro'],
  rare:['pocao_g','espada_aco','machado_guerra','katana_sombria','armadura_aco','armadura_samurai','armadura_cavaleiro'],
  epic:['elixir_supremo','espada_flamas','tridente_tempestade','lamina_abissal','armadura_dragao','armadura_abissal','armadura_celestial'],
  legendary:['excalibur','katana_divina','armadura_titan','armadura_divina']
}

function pick(arr){
  return arr[Math.floor(Math.random()*arr.length)]
}

export async function openLootBoxes(jid, boxId='caixa_sorte', qty=1) {
  await ensureUser(jid)
  qty=Number(qty)
  const config=BOX_CONFIG[boxId]
  if(!config) throw new Error('Essa caixa não pode ser aberta.')
  if(!Number.isInteger(qty) || qty<1 || qty>5000) throw new Error('Quantidade inválida de caixas.')

  return transaction(async client=>{
    const inv=await client.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
      [jid,boxId]
    )
    const available=Number(inv.rows[0]?.quantity||0)
    if(available<qty){
      throw new Error(`Você possui apenas ${available} caixa(s) desse tipo.`)
    }

    await client.query(
      'UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3',
      [qty,jid,boxId]
    )

    let cash=0
    let exp=0
    const rewards=new Map()
    const rarityCounts={common:0,uncommon:0,rare:0,epic:0,legendary:0}

    for(let i=0;i<qty;i++){
      const utilityRoll=Math.random()
      if(utilityRoll<config.cashChance){
        const [min,max]=config.cash
        cash+=min+Math.floor(Math.random()*(max-min+1))
        continue
      }
      if(utilityRoll<config.cashChance+config.expChance){
        const [min,max]=config.exp
        exp+=min+Math.floor(Math.random()*(max-min+1))
        continue
      }

      const roll=Math.random()
      let rarity='common'
      if(roll<config.legendary) rarity='legendary'
      else if(roll<config.epic) rarity='epic'
      else if(roll<config.rare) rarity='rare'
      else if(roll<config.uncommon) rarity='uncommon'

      rarityCounts[rarity]++
      const itemId=pick(LOOT_POOLS[rarity])
      rewards.set(itemId,(rewards.get(itemId)||0)+1)
    }

    if(cash>0){
      await client.query(
        'UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',
        [cash,jid]
      )
      await client.query(`
        INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES('system',$1,$2,'loot_box',$3)
      `,[jid,cash,`${boxId} x${qty}`])
    }

    let level=null
    if(exp>0) level=await applyExp(client,jid,exp)

    const itemIds=[...rewards.keys()]
    const names=new Map()
    const rarities=new Map()
    if(itemIds.length){
      const itemRows=await client.query(
        'SELECT id,name,rarity FROM items WHERE id = ANY($1::text[])',
        [itemIds]
      )
      for(const row of itemRows.rows){
        names.set(row.id,row.name)
        rarities.set(row.id,row.rarity)
      }

      for(const [itemId,itemQty] of rewards){
        await client.query(`
          INSERT INTO inventories(jid,item_id,quantity)
          VALUES($1,$2,$3)
          ON CONFLICT(jid,item_id) DO UPDATE
          SET quantity=inventories.quantity+EXCLUDED.quantity
        `,[jid,itemId,itemQty])
      }
    }

    const wallet=await client.query('SELECT cash FROM wallets WHERE jid=$1',[jid])
    const remaining=Math.max(0,available-qty)

    return {
      boxId,
      opened:qty,
      remaining,
      cash,
      exp,
      level,
      balance:Number(wallet.rows[0]?.cash||0),
      rarityCounts,
      items:[...rewards.entries()].map(([itemId,itemQty])=>({
        itemId,
        name:names.get(itemId)||itemId,
        rarity:rarities.get(itemId)||'common',
        qty:itemQty
      }))
    }
  })
}

export async function openLuckyBoxes(jid, qty=1) {
  return openLootBoxes(jid,'caixa_sorte',qty)
}

export async function openLuckyBox(jid) {
  return openLootBoxes(jid,'caixa_sorte',1)
}

export async function dungeon(jid) {
  await ensureUser(jid)

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

    const cd=await claimCooldown(client,`dungeon:${jid}`,20*60)
    if(!cd.ok) return cd

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

    const cd=await claimCooldown(client,`rob:${thiefJid}`,60*60)
    if(!cd.ok) return cd

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
  let out='ALPHA-'
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
    name:String(map.pix_name ?? 'Alpha Bot')
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


function supportCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out='SUP-'
  for(let i=0;i<6;i++) out+=chars[Math.floor(Math.random()*chars.length)]
  return out
}

export async function createSupportTicket(requesterJid, chatJid, category, message) {
  category=String(category||'outro').trim().slice(0,40)
  message=String(message||'').trim()
  if(message.length<3) throw new Error('Descreva o problema com um pouco mais de detalhe.')
  if(message.length>1500) throw new Error('Mensagem muito longa. Use no máximo 1.500 caracteres.')

  for(let attempt=0;attempt<8;attempt++){
    const code=supportCode()
    try{
      const {rows}=await db.query(`
        INSERT INTO support_tickets(code,requester_jid,chat_jid,category,message)
        VALUES($1,$2,$3,$4,$5)
        RETURNING *
      `,[code,requesterJid,chatJid,category,message])
      return rows[0]
    }catch(err){
      if(err?.code!=='23505') throw err
    }
  }
  throw new Error('Não foi possível abrir o chamado. Tente novamente.')
}

export async function getSupportTicket(code) {
  code=String(code||'').trim().toUpperCase()
  const {rows}=await db.query('SELECT * FROM support_tickets WHERE code=$1',[code])
  return rows[0]||null
}

export async function listOpenSupportTickets(limit=30) {
  const {rows}=await db.query(`
    SELECT * FROM support_tickets
    WHERE status='open'
    ORDER BY created_at ASC
    LIMIT $1
  `,[limit])
  return rows
}

export async function answerSupportTicket(code, ownerJid, answer) {
  code=String(code||'').trim().toUpperCase()
  answer=String(answer||'').trim()
  if(answer.length<1) throw new Error('A resposta não pode ficar vazia.')
  if(answer.length>1800) throw new Error('Resposta muito longa. Use no máximo 1.800 caracteres.')

  const now=Math.floor(Date.now()/1000)
  const {rows}=await db.query(`
    UPDATE support_tickets
    SET status='answered',
        answer=$2,
        answered_at=$3,
        answered_by=$4,
        updated_at=${nowSql}
    WHERE code=$1 AND status='open'
    RETURNING *
  `,[code,answer,now,ownerJid])
  if(!rows[0]) throw new Error('Chamado aberto não encontrado.')
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


// ===== Alpha Community Pack: moderação, pets, relacionamentos e mercado P2P =====
export async function initCommunityPack(){
  await db.query(`
    ALTER TABLE group_settings ADD COLUMN IF NOT EXISTS welcome_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE group_settings ADD COLUMN IF NOT EXISTS antilink_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE group_settings ADD COLUMN IF NOT EXISTS antibadword_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE group_settings ADD COLUMN IF NOT EXISTS antidelete_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE group_settings ADD COLUMN IF NOT EXISTS rules_text TEXT NOT NULL DEFAULT '';
    ALTER TABLE group_settings ADD COLUMN IF NOT EXISTS antiflood_enabled BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS group_warnings(
      chat_jid TEXT NOT NULL,
      jid TEXT NOT NULL,
      warnings INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql},
      PRIMARY KEY(chat_jid,jid)
    );

    CREATE TABLE IF NOT EXISTS pets(
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      species TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      hunger INTEGER NOT NULL DEFAULT 100,
      hygiene INTEGER NOT NULL DEFAULT 100,
      energy INTEGER NOT NULL DEFAULT 100,
      power INTEGER NOT NULL DEFAULT 10,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      last_action BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT ${nowSql}
    );
    ALTER TABLE pets ADD COLUMN IF NOT EXISTS last_rest BIGINT NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS relationship_proposals(
      from_jid TEXT NOT NULL,
      to_jid TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      PRIMARY KEY(from_jid,to_jid)
    );

    CREATE TABLE IF NOT EXISTS relationships(
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      partner_jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      since_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    CREATE TABLE IF NOT EXISTS market_listings(
      id BIGSERIAL PRIMARY KEY,
      seller_jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id),
      quantity INTEGER NOT NULL CHECK(quantity>0),
      price BIGINT NOT NULL CHECK(price>0),
      status TEXT NOT NULL DEFAULT 'active',
      buyer_jid TEXT,
      created_at BIGINT NOT NULL DEFAULT ${nowSql},
      sold_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS market_active_idx ON market_listings(status,created_at DESC);

    CREATE TABLE IF NOT EXISTS group_activity(
      chat_jid TEXT NOT NULL,
      jid TEXT NOT NULL,
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      messages INTEGER NOT NULL DEFAULT 0,
      commands INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(chat_jid,jid,day)
    );
    CREATE INDEX IF NOT EXISTS group_activity_week_idx ON group_activity(chat_jid,day DESC);
  `)
}

export async function getCommunitySettings(chatJid){
  const st=await getGroupSettings(chatJid)
  return st
}
export async function setCommunitySetting(chatJid,key,enabled,updatedBy=''){
  const allowed=new Set(['welcome_enabled','antilink_enabled','antibadword_enabled','antidelete_enabled','antiflood_enabled'])
  if(!allowed.has(key)) throw new Error('Configuração inválida.')
  await getGroupSettings(chatJid)
  const {rows}=await db.query(`UPDATE group_settings SET ${key}=$1,updated_by=$2,updated_at=${nowSql} WHERE chat_jid=$3 RETURNING *`,[Boolean(enabled),updatedBy,chatJid])
  return rows[0]
}
export async function setGroupRules(chatJid,text,updatedBy=''){
  await getGroupSettings(chatJid)
  const {rows}=await db.query(`UPDATE group_settings SET rules_text=$1,updated_by=$2,updated_at=${nowSql} WHERE chat_jid=$3 RETURNING *`,[String(text||'').slice(0,3000),updatedBy,chatJid])
  return rows[0]
}
export async function addGroupWarning(chatJid,jid){
  const {rows}=await db.query(`INSERT INTO group_warnings(chat_jid,jid,warnings) VALUES($1,$2,1)
    ON CONFLICT(chat_jid,jid) DO UPDATE SET warnings=group_warnings.warnings+1,updated_at=${nowSql} RETURNING warnings`,[chatJid,jid])
  return Number(rows[0]?.warnings||0)
}
export async function getGroupWarnings(chatJid,jid){
  const {rows}=await db.query('SELECT warnings FROM group_warnings WHERE chat_jid=$1 AND jid=$2',[chatJid,jid])
  return Number(rows[0]?.warnings||0)
}
export async function clearGroupWarnings(chatJid,jid){
  await db.query('DELETE FROM group_warnings WHERE chat_jid=$1 AND jid=$2',[chatJid,jid])
}

export async function adoptPet(jid,species='cachorro',name='Alpha'){
  await ensureUser(jid)
  species=String(species||'cachorro').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  const rules={
    cachorro:{level:1,price:5000,label:'🐶 Cachorro'},
    gato:{level:2,price:8000,label:'🐱 Gato'},
    coelho:{level:3,price:12000,label:'🐰 Coelho'},
    papagaio:{level:4,price:18000,label:'🦜 Papagaio'},
    hamster:{level:5,price:25000,label:'🐹 Hamster'},
    tartaruga:{level:6,price:35000,label:'🐢 Tartaruga'},
    coruja:{level:7,price:50000,label:'🦉 Coruja'},
    raposa:{level:8,price:70000,label:'🦊 Raposa'},
    lobo:{level:10,price:100000,label:'🐺 Lobo'},
    aguia:{level:12,price:150000,label:'🦅 Águia'},
    panda:{level:14,price:225000,label:'🐼 Panda'},
    tigre:{level:17,price:350000,label:'🐯 Tigre'},
    leao:{level:20,price:500000,label:'🦁 Leão'},
    unicornio:{level:25,price:750000,label:'🦄 Unicórnio'},
    dragao:{level:30,price:1000000,label:'🐉 Dragão'}
  }
  const rule=rules[species]
  if(!rule) throw new Error('Pet inválido. Use !adotar para ver os 15 pets disponíveis.')
  return transaction(async client=>{
    const ur=await client.query('SELECT level FROM users WHERE jid=$1 FOR UPDATE',[jid]); const level=Number(ur.rows[0]?.level||1)
    if(level<rule.level) throw new Error(`${rule.label} exige nível ${rule.level}. Seu nível atual: ${level}.`)
    const old=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const changeFee=old?25000:0
    const total=rule.price+changeFee
    const wr=(await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0],cash=Number(wr?.cash||0),bank=Number(wr?.bank||0)
    if(cash+bank<total) throw new Error(`Você precisa de R$ ${total.toLocaleString('pt-BR')} (${rule.label}: R$ ${rule.price.toLocaleString('pt-BR')}${old?' + troca: R$ 25.000':''}).`)
    const fromCash=Math.min(cash,total)
    await client.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at='+nowSql+' WHERE jid=$3',[fromCash,total-fromCash,jid])
    const petName=String(name||'Alpha').slice(0,24)
    const {rows}=await client.query(`INSERT INTO pets(jid,species,name) VALUES($1,$2,$3)
      ON CONFLICT(jid) DO UPDATE SET species=EXCLUDED.species,name=EXCLUDED.name,level=1,xp=0,power=10,hunger=100,hygiene=100,energy=100,wins=0,losses=0,last_action=0 RETURNING *`,[jid,species,petName])
    return {...rows[0],fee:total,petPrice:rule.price,changeFee,replaced:Boolean(old)}
  })
}
export async function getPet(jid){
  const {rows}=await db.query('SELECT * FROM pets WHERE jid=$1',[jid]); return rows[0]||null
}
export async function petAction(jid,action){
  const map={
    alimentar:{hunger:25,hygiene:-2,energy:2,xp:8},
    banho:{hunger:0,hygiene:30,energy:0,xp:0},
    descansar:{hunger:-5,hygiene:0,energy:30,xp:0,rest:true},
    passear:{hunger:-8,hygiene:-6,energy:-12,xp:15},
    treinar:{hunger:-10,hygiene:-4,energy:-15,xp:25,power:1},
    aventura:{hunger:-15,hygiene:-10,energy:-20,xp:40,power:1}
  }
  const a=map[action]; if(!a) throw new Error('Ação de pet inválida.')
  return transaction(async client=>{
    const pet=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!pet) throw new Error('Você ainda não tem pet. Use !adotar.')
    const now=Math.floor(Date.now()/1000)
    if(a.rest){
      const restCooldown=30*60
      const remaining=restCooldown-(now-Number(pet.last_rest||0))
      if(remaining>0) throw new Error(`Seu pet poderá descansar novamente em ${Math.ceil(remaining/60)} min.`)
      if(Number(pet.energy)>=100) throw new Error('Seu pet já está com a energia cheia.')
    }
    if(now-Number(pet.last_action||0)<60) throw new Error('Seu pet precisa descansar um pouco.')
    if(a.energy<0 && Number(pet.energy)<Math.abs(a.energy)) throw new Error(`Energia insuficiente. Esta ação exige ${Math.abs(a.energy)} de energia. Use !descansar.`)
    const xp=Number(pet.xp)+a.xp, level=1+Math.floor(xp/100)
    const {rows}=await client.query(`UPDATE pets SET
      hunger=LEAST(100,GREATEST(0,hunger+$1)),hygiene=LEAST(100,GREATEST(0,hygiene+$2)),
      energy=LEAST(100,GREATEST(0,energy+$3)),xp=$4,level=$5,power=power+$6,last_action=$7,
      last_rest=CASE WHEN $8 THEN $7 ELSE last_rest END
      WHERE jid=$9 RETURNING *`,[a.hunger,a.hygiene,a.energy,xp,level,a.power||0,now,Boolean(a.rest),jid])
    return rows[0]
  })
}
export async function petAdventure(jid){
  return transaction(async client=>{
    const pet=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!pet) throw new Error('Você ainda não tem pet. Use !adotar.')
    const energy=Number(pet.energy||0)
    if(energy<10) throw new Error(`Seu pet precisa de pelo menos 10 de energia para explorar. Energia atual: ${energy}/100. Use !descansar.`)
    const now=Math.floor(Date.now()/1000)
    if(now-Number(pet.last_action||0)<60) throw new Error('Seu pet precisa descansar um pouco antes de sair.')
    const level=Number(pet.level||1),power=Number(pet.power||10)
    const cash=Math.floor(energy*(70+Math.random()*50)+level*150+power*25)
    const xpGain=energy*2
    const xp=Number(pet.xp||0)+xpGain
    const nextLevel=1+Math.floor(xp/100)
    const powerGain=Math.floor(energy/50)
    const {rows}=await client.query(`UPDATE pets SET energy=0,xp=$1,level=$2,power=power+$3,
      hunger=GREATEST(0,hunger-$4),hygiene=GREATEST(0,hygiene-$5),last_action=$6
      WHERE jid=$7 RETURNING *`,[xp,nextLevel,powerGain,Math.ceil(energy*.25),Math.ceil(energy*.15),now,jid])
    await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[cash,jid])
    await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'pet_adventure',$3)`,[jid,cash,`${pet.name}: ${energy} energia`])
    return {...rows[0],cash,xpGain,energySpent:energy,powerGain}
  })
}
export async function petLeaderboard(limit=10){
  const {rows}=await db.query(`SELECT p.*,u.push_name FROM pets p JOIN users u ON u.jid=p.jid ORDER BY p.level DESC,p.power DESC,p.xp DESC LIMIT $1`,[Math.min(20,Math.max(1,Number(limit)||10))]); return rows
}

export async function recordGroupActivity(chatJid,jid,isCommand=false){
  if(!chatJid?.endsWith('@g.us')||!jid) return
  await db.query(`INSERT INTO group_activity(chat_jid,jid,day,messages,commands) VALUES($1,$2,CURRENT_DATE,1,$3)
    ON CONFLICT(chat_jid,jid,day) DO UPDATE SET messages=group_activity.messages+1,commands=group_activity.commands+EXCLUDED.commands`,[chatJid,jid,isCommand?1:0])
}
export async function weeklyActivityLeaderboard(chatJid,limit=10){
  const {rows}=await db.query(`SELECT a.jid,COALESCE(NULLIF(u.push_name,''),'Jogador') push_name,SUM(a.messages)::int messages,SUM(a.commands)::int commands
    FROM group_activity a LEFT JOIN users u ON u.jid=a.jid WHERE a.chat_jid=$1 AND a.day>=CURRENT_DATE-6
    GROUP BY a.jid,u.push_name ORDER BY SUM(a.messages) DESC,SUM(a.commands) DESC LIMIT $2`,[chatJid,Math.min(20,Math.max(1,Number(limit)||10))]); return rows
}
export async function getAchievements(jid){
  const [p,pet,rel,streak,inv]=await Promise.all([getCombatProfile(jid),getPet(jid),getRelationship(jid),getDailyStreak(jid),db.query('SELECT COALESCE(SUM(quantity),0)::int qty FROM inventories WHERE jid=$1',[jid])])
  if(!p) return []
  const total=Number(p.cash||0)+Number(p.bank||0), out=[]
  if(Number(streak?.bestStreak||0)>=7) out.push('🔥 Sequência de 7 dias')
  if(Number(streak?.bestStreak||0)>=30) out.push('🌟 Sequência de 30 dias')
  if(total>=1000000) out.push('💎 Primeiro milhão')
  if(Number(p.win||0)>=10) out.push('⚔️ 10 vitórias')
  if(Number(p.win||0)>=100) out.push('👑 100 vitórias')
  if(pet) out.push('🐾 Melhor amigo')
  if(Number(pet?.level||0)>=10) out.push('🦁 Pet nível 10')
  if(rel) out.push('💍 Comprometido')
  if(Number(inv.rows[0]?.qty||0)>=25) out.push('🎒 Colecionador')
  return out
}
export async function petDuel(challengerJid,targetJid){
  if(challengerJid===targetJid) throw new Error('Escolha outro jogador.')
  const [a,b]=await Promise.all([getPet(challengerJid),getPet(targetJid)])
  if(!a||!b) throw new Error('Os dois jogadores precisam ter um pet.')
  const scoreA=Number(a.power)+Number(a.level)*2+Math.floor(Math.random()*11)
  const scoreB=Number(b.power)+Number(b.level)*2+Math.floor(Math.random()*11)
  const winner=scoreA===scoreB?(Math.random()<.5?'a':'b'):(scoreA>scoreB?'a':'b')
  const winJid=winner==='a'?challengerJid:targetJid,loseJid=winner==='a'?targetJid:challengerJid
  await transaction(async client=>{
    await client.query('UPDATE pets SET wins=wins+1,xp=xp+25,level=1+FLOOR((xp+25)/100) WHERE jid=$1',[winJid])
    await client.query('UPDATE pets SET losses=losses+1,xp=xp+10,level=1+FLOOR((xp+10)/100) WHERE jid=$1',[loseJid])
  })
  return {winnerJid:winJid,loserJid:loseJid,winner:winner==='a'?a:b,loser:winner==='a'?b:a}
}

export async function proposeRelationship(fromJid,toJid){
  if(fromJid===toJid) throw new Error('Você não pode casar consigo mesmo.')
  await ensureUser(toJid)
  const taken=await db.query('SELECT jid FROM relationships WHERE jid=ANY($1::text[])',[[fromJid,toJid]])
  if(taken.rowCount) throw new Error('Uma das pessoas já está em um relacionamento.')
  await db.query(`INSERT INTO relationship_proposals(from_jid,to_jid) VALUES($1,$2)
    ON CONFLICT(from_jid,to_jid) DO UPDATE SET created_at=${nowSql}`,[fromJid,toJid])
}
export async function acceptRelationship(toJid,fromJid){
  await ensureUser(fromJid); await ensureUser(toJid)
  return transaction(async client=>{
    const p=await client.query('SELECT 1 FROM relationship_proposals WHERE from_jid=$1 AND to_jid=$2 FOR UPDATE',[fromJid,toJid])
    if(!p.rowCount) throw new Error('Pedido de casamento não encontrado.')
    const taken=await client.query('SELECT jid FROM relationships WHERE jid=ANY($1::text[])',[[fromJid,toJid]])
    if(taken.rowCount) throw new Error('Uma das pessoas já está em um relacionamento.')
    await client.query('INSERT INTO relationships(jid,partner_jid) VALUES($1,$2),($2,$1)',[fromJid,toJid])
    await client.query('DELETE FROM relationship_proposals WHERE from_jid=$1 AND to_jid=$2',[fromJid,toJid])
    return true
  })
}
export async function divorceRelationship(jid){
  return transaction(async client=>{
    const r=await client.query('SELECT partner_jid FROM relationships WHERE jid=$1 FOR UPDATE',[jid])
    const partner=r.rows[0]?.partner_jid; if(!partner) throw new Error('Você não está casado(a).')
    await client.query('DELETE FROM relationships WHERE jid=ANY($1::text[])',[[jid,partner]])
    return partner
  })
}
export async function getRelationship(jid){
  const {rows}=await db.query(`SELECT r.*,u.push_name AS partner_name FROM relationships r LEFT JOIN users u ON u.jid=r.partner_jid WHERE r.jid=$1`,[jid]); return rows[0]||null
}

export async function createMarketListing(jid,itemId,qty,price){
  qty=Number(qty); price=Number(price)
  if(!Number.isInteger(qty)||qty<1||!Number.isSafeInteger(price)||price<1) throw new Error('Quantidade ou preço inválido.')
  return transaction(async client=>{
    const inv=await client.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])
    if(Number(inv.rows[0]?.quantity||0)<qty) throw new Error('Você não possui essa quantidade.')
    const stats=await client.query('SELECT weapon_id,armor_id FROM stats WHERE jid=$1',[jid])
    const equipped=[stats.rows[0]?.weapon_id,stats.rows[0]?.armor_id].includes(itemId)?1:0
    if(Number(inv.rows[0].quantity)-equipped<qty) throw new Error('Não é possível anunciar sua única cópia equipada.')
    await client.query('UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3',[qty,jid,itemId])
    const r=await client.query(`INSERT INTO market_listings(seller_jid,item_id,quantity,price) VALUES($1,$2,$3,$4) RETURNING *`,[jid,itemId,qty,price])
    return r.rows[0]
  })
}
export async function listMarket(limit=15){
  const {rows}=await db.query(`SELECT m.*,i.name,u.push_name AS seller_name FROM market_listings m JOIN items i ON i.id=m.item_id LEFT JOIN users u ON u.jid=m.seller_jid WHERE m.status='active' ORDER BY m.created_at DESC LIMIT $1`,[Math.min(30,Math.max(1,Number(limit)||15))]); return rows
}
export async function buyMarketListing(buyerJid,id){
  await ensureUser(buyerJid)
  return transaction(async client=>{
    const r=await client.query(`SELECT m.*,i.name FROM market_listings m JOIN items i ON i.id=m.item_id WHERE m.id=$1 FOR UPDATE`,[Number(id)])
    const x=r.rows[0]; if(!x||x.status!=='active') throw new Error('Anúncio não está mais disponível.')
    if(x.seller_jid===buyerJid) throw new Error('Você não pode comprar seu próprio anúncio.')
    const w=await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[buyerJid])
    const cash=Number(w.rows[0]?.cash||0),bank=Number(w.rows[0]?.bank||0),price=Number(x.price)
    if(cash+bank<price) throw new Error('Saldo insuficiente.')
    const fromCash=Math.min(cash,price),fromBank=price-fromCash
    await client.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at='+nowSql+' WHERE jid=$3',[fromCash,fromBank,buyerJid])
    await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[price,x.seller_jid])
    await client.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,[buyerJid,x.item_id,x.quantity])
    await client.query(`UPDATE market_listings SET status='sold',buyer_jid=$1,sold_at=${nowSql} WHERE id=$2`,[buyerJid,x.id])
    return x
  })
}
export async function cancelMarketListing(jid,id){
  return transaction(async client=>{
    const r=await client.query('SELECT * FROM market_listings WHERE id=$1 AND seller_jid=$2 FOR UPDATE',[Number(id),jid])
    const x=r.rows[0]; if(!x||x.status!=='active') throw new Error('Anúncio ativo não encontrado.')
    await client.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,[jid,x.item_id,x.quantity])
    await client.query(`UPDATE market_listings SET status='cancelled' WHERE id=$1`,[x.id]); return x
  })
}
