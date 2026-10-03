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
      weapon_tier INTEGER NOT NULL DEFAULT 1,
      armor_tier INTEGER NOT NULL DEFAULT 1,
      win INTEGER NOT NULL DEFAULT 0,
      loss INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT ${nowSql}
    );

    ALTER TABLE stats ADD COLUMN IF NOT EXISTS weapon_tier INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE stats ADD COLUMN IF NOT EXISTS armor_tier INTEGER NOT NULL DEFAULT 1;

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

    CREATE TABLE IF NOT EXISTS equipment_fusions(
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id),
      tier INTEGER NOT NULL DEFAULT 1 CHECK(tier>=1 AND tier<=10),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),
      PRIMARY KEY(jid,item_id,tier)
    );

    CREATE TABLE IF NOT EXISTS equipment_upgrades(
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id),
      level INTEGER NOT NULL DEFAULT 1 CHECK(level>=1 AND level<=10),
      updated_at BIGINT NOT NULL DEFAULT ${nowSql},
      PRIMARY KEY(jid,item_id)
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
    ['pocao_pet_comum','Poção de Pet Comum','Recupera 60 HP do pet ativo.','consumable',500,'common'],
    ['pocao_pet_rara','Poção de Pet Rara','Recupera 160 HP do pet ativo.','consumable',1500,'rare'],
    ['pocao_pet_epica','Poção de Pet Épica','Recupera 320 HP do pet ativo.','consumable',3500,'epic'],
    ['energetico_pet','Energético Pet','Restaura instantaneamente 100% da energia do pet ativo.','consumable',12000,'rare'],

    // Armas
    ['espada_madeira','Espada de Madeira','Arma inicial do Alpha Bot. +5 ATK.','weapon',1500,'common'],
    ['espada_ferro','Espada de Ferro','Arma reforçada. +12 ATK.','weapon',5000,'uncommon'],
    ['espada_aco','Espada de Aço','Lâmina rara. +20 ATK.','weapon',12000,'rare'],
    ['machado_guerra','Machado de Guerra','Golpes pesados. +24 ATK.','weapon',18000,'rare'],
    ['katana_sombria','Katana Sombria','Lâmina veloz e rara. +28 ATK.','weapon',25000,'rare'],
    ['espada_flamas','Espada das Chamas','Arma épica. +40 ATK.','weapon',60000,'epic'],
    ['tridente_tempestade','Tridente da Tempestade','Arma épica. +48 ATK.','weapon',95000,'epic'],
    ['lamina_abissal','Lâmina Abissal','Arma épica de alto nível. +55 ATK.','weapon',140000,'epic'],
    ['foice_carmesim','Foice Carmesim','Arma épica. +43 ATK.','weapon',72000,'epic'],
    ['lanca_solar','Lança Solar','Arma épica. +46 ATK.','weapon',85000,'epic'],
    ['garras_vazio','Garras do Vazio','Arma épica. +51 ATK.','weapon',115000,'epic'],
    ['espada_eclipse','Espada do Eclipse','Arma épica superior. +54 ATK.','weapon',132000,'epic'],
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
    ['manto_fenix','Manto da Fênix','Proteção épica. +43 DEF.','armor',78000,'epic'],
    ['couraca_vulcanica','Couraça Vulcânica','Proteção épica. +46 DEF.','armor',92000,'epic'],
    ['armadura_vazio','Armadura do Vazio','Proteção épica. +51 DEF.','armor',125000,'epic'],
    ['armadura_eclipse','Armadura do Eclipse','Proteção épica superior. +54 DEF.','armor',145000,'epic'],
    ['armadura_golem','Armadura do Golem Ancestral','Armadura exclusiva do Boss de Grupo. +70 DEF. Apenas por drop.','armor',0,'legendary'],
    ['armadura_titan','Armadura do Titã','Armadura lendária. +85 DEF. Apenas por drop.','armor',0,'legendary'],
    ['armadura_divina','Armadura Divina','Armadura lendária raríssima. +95 DEF. Apenas por drop.','armor',0,'legendary'],

    // Chaves de Raid
    ['chave_raid_10','Chave de Raid Lv.10','Abre uma Raid de nível 10. A chave só é consumida quando a luta começa.','special',10000,'uncommon'],
    ['chave_raid_15','Chave de Raid Lv.15','Abre uma Raid de nível 15. A chave só é consumida quando a luta começa.','special',16000,'uncommon'],
    ['chave_raid_20','Chave de Raid Lv.20','Abre uma Raid de nível 20. A chave só é consumida quando a luta começa.','special',25000,'rare'],
    ['chave_raid_25','Chave de Raid Lv.25','Abre uma Raid de nível 25. A chave só é consumida quando a luta começa.','special',40000,'rare'],
    ['chave_raid_30','Chave de Raid Lv.30','Abre uma Raid de nível 30. A chave só é consumida quando a luta começa.','special',60000,'epic'],
    ['chave_raid_40','Chave de Raid Lv.40','Abre uma Raid de nível 40. A chave só é consumida quando a luta começa.','special',100000,'epic'],
    ['chave_raid_50','Chave de Raid Lv.50','Abre uma Raid de nível 50. A chave só é consumida quando a luta começa.','special',160000,'legendary'],

    // Materiais específicos de Raid
    ['nucleo_pedra','Núcleo de Pedra','Material conquistado na Raid Lv.10.','special',0,'uncommon'],
    ['escama_vulcanica','Escama Vulcânica','Material conquistado na Raid Lv.15.','special',0,'rare'],
    ['olho_abissal','Olho Abissal','Material conquistado na Raid Lv.20.','special',0,'rare'],
    ['nucleo_titan','Núcleo do Titã','Material conquistado na Raid Lv.25.','special',0,'epic'],
    ['essencia_rei_abissal','Essência do Rei Abissal','Material conquistado na Raid Lv.30.','special',0,'epic'],
    ['fragmento_celestial','Fragmento Celestial','Material conquistado na Raid Lv.40.','special',0,'epic'],
    ['nucleo_alpha_corrompido','Núcleo Alpha Corrompido','Material conquistado na Raid Lv.50.','special',0,'legendary'],

    // Exclusivo de Boss de Evento
    ['insignia_eclipse','Insígnia do Eclipse','Relíquia exclusiva do Boss de Evento Imperador do Eclipse. Raridade Evento Único; não pode ser comprada nem obtida fora do evento.','special',0,'event'],

    // Caixas
    ['caixa_sorte','Caixa da Sorte','Pode conter dinheiro, EXP ou itens. Lendário: 0,1%.','special',3000,'common'],
    ['caixa_rara','Caixa Rara','Item garantido no mínimo Incomum. Chance de Lendário: 0,3%.','special',12000,'rare'],
    ['caixa_epica','Caixa Épica','Item garantido no mínimo Raro. Chance de Lendário: 1%.','special',35000,'epic'],
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

  // Troféu de evento: não é item de loja e não pode ser vendido.
  await db.query("UPDATE items SET sellable=FALSE,stackable=FALSE WHERE id='insignia_eclipse'")

  // A fusão foi descontinuada. Preserva qualquer equipamento já fundido,
  // devolvendo o equivalente em cópias normais (T2=2, T3=4, T4=8...).
  await transaction(async client=>{
    await client.query(`
      INSERT INTO inventories(jid,item_id,quantity)
      SELECT jid,item_id,SUM(quantity * (1::bigint << (tier-1)))::integer
      FROM equipment_fusions
      WHERE quantity>0
      GROUP BY jid,item_id
      ON CONFLICT(jid,item_id) DO UPDATE
      SET quantity=inventories.quantity+EXCLUDED.quantity
    `)
    await client.query('DELETE FROM equipment_fusions WHERE quantity>0')
    await client.query('UPDATE stats SET weapon_tier=1,armor_tier=1 WHERE weapon_tier<>1 OR armor_tier<>1')
  })
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
        INSERT INTO equipment_upgrades(jid,item_id,level,updated_at)
        SELECT $1,item_id,level,${nowSql} FROM equipment_upgrades WHERE jid=$2
        ON CONFLICT(jid,item_id) DO UPDATE SET
          level=GREATEST(equipment_upgrades.level,EXCLUDED.level),
          updated_at=${nowSql}
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
    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const totalCash=(baseAmount+bonusCash)*moneyMultiplier

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
      next:nextStreakMilestone(streak),
      eventMultiplier:moneyMultiplier
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

export async function work(jid, taxMultiplier=1) {
  await ensureUser(jid)
  const jobs=['organizando documentos','atendendo clientes','resolvendo uma demanda','fechando um relatório','ajudando a equipe','entregando um projeto']
  return transaction(async client=>{
    const cd=await claimCooldown(client,`work:${jid}`,30*60)
    if(!cd.ok) return cd
    await client.query(`INSERT INTO careers(jid) VALUES($1) ON CONFLICT(jid) DO NOTHING`,[jid])
    const cr=(await client.query('SELECT career_xp,total_shifts FROM careers WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const oldXp=Number(cr.career_xp), oldRank=careerRank(oldXp)
    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const xpMultiplier=await getDoubleEventMultiplier(client,'xp')
    const xpGain=(25+Math.floor(Math.random()*16))*xpMultiplier
    const newXp=oldXp+xpGain, newRank=careerRank(newXp)
    let base=700+Math.floor(Math.random()*701)
    let event=null, factor=1
    const roll=Math.random()
    if(roll<.08){event='🌟 Excelente desempenho! Bônus de 50%.';factor=1.5}
    else if(roll<.15){event='⏰ Hora extra! Bônus de 25%.';factor=1.25}
    else if(roll<.19){event='😴 Dia complicado. Rendimento 15% menor.';factor=.85}
    const gross=Math.max(1,Math.round(base*newRank.mult*factor*moneyMultiplier))
    const taxRate=Math.min(100,10*Math.max(1,Number(taxMultiplier)||1))
    const tax=Math.floor(gross*(taxRate/100))
    const amount=gross-tax
    await client.query('UPDATE careers SET career_xp=$1,total_shifts=total_shifts+1,updated_at='+nowSql+' WHERE jid=$2',[newXp,jid])
    await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[amount,jid])
    await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'work',$3)`,
      [jid,gross,`${newRank.name} | ${jobs[Math.floor(Math.random()*jobs.length)]}`])
    if(tax>0) await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'income_tax',$3)`,[jid,tax,`TAXADE te pegou ${taxRate}% | trabalho`])
    const promoted=newRank.name!==oldRank.name
    const idx=CAREER_RANKS.findIndex(r=>r.name===newRank.name), next=CAREER_RANKS[idx+1]||null
    return {ok:true,gross,tax,taxRate,amount,job:newRank.name,careerXp:newXp,xpGain,totalShifts:Number(cr.total_shifts)+1,event,promoted,oldRank:oldRank.name,rank:newRank,next,eventMultiplier:Math.max(moneyMultiplier,xpMultiplier)}
  })
}

export async function deposit(jid, amount) {
  const depositAll=['total','tudo'].includes(String(amount||'').trim().toLowerCase())
  if(!depositAll){
    amount = Number(amount)
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor inválido.')
  }

  return transaction(async client => {
    const { rows } = await client.query('SELECT * FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const w=rows[0]
    if(depositAll) amount=Number(w?.cash||0)
    if(amount<=0) throw new Error('Você não possui dinheiro na carteira para depositar.')
    if (!w || Number(w.cash) < amount) throw new Error('Saldo em carteira insuficiente.')
        await client.query(`
      UPDATE wallets
      SET cash=cash-$1, bank=bank+$1, updated_at=${nowSql}
      WHERE jid=$2
    `,[amount,jid])
    return { amount,cash:Number(w.cash)-amount, bank:Number(w.bank)+amount }
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



export async function sellDuplicateEquipment(jid) {
  await ensureUser(jid)
  const items=await getInventory(jid)
  const selections=items
    .filter(i=>['weapon','armor'].includes(i.category) && i.rarity!=='legendary' && Number(i.quantity)>1)
    .map(i=>({itemId:i.item_id,qty:Number(i.quantity)-1}))

  if(!selections.length) return {sold:[],types:0,totalUnits:0,total:0,cash:null}
  return sellItemsBatch(jid,selections)
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
  foice_carmesim: { category:'weapon', atk:43, def:0, name:'Foice Carmesim' },
  lanca_solar: { category:'weapon', atk:46, def:0, name:'Lança Solar' },
  garras_vazio: { category:'weapon', atk:51, def:0, name:'Garras do Vazio' },
  espada_eclipse: { category:'weapon', atk:54, def:0, name:'Espada do Eclipse' },
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
  manto_fenix: { category:'armor', atk:0, def:43, name:'Manto da Fênix' },
  couraca_vulcanica: { category:'armor', atk:0, def:46, name:'Couraça Vulcânica' },
  armadura_vazio: { category:'armor', atk:0, def:51, name:'Armadura do Vazio' },
  armadura_eclipse: { category:'armor', atk:0, def:54, name:'Armadura do Eclipse' },
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

const PET_POTIONS = {
  pocao_pet_comum: { heal:60, name:'Poção de Pet Comum' },
  pocao_pet_rara: { heal:160, name:'Poção de Pet Rara' },
  pocao_pet_epica: { heal:320, name:'Poção de Pet Épica' },
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

const EQUIPMENT_MAX_LEVEL=10
const UPGRADE_BASE_COST={common:2500,uncommon:5000,rare:12000,epic:30000,legendary:75000}

export function equipmentStatsAtLevel(itemId,level=1){
  const eq=EQUIPMENT[itemId]
  if(!eq) return null
  level=Math.max(1,Math.min(EQUIPMENT_MAX_LEVEL,Number(level)||1))
  // Curva progressiva: upgrades iniciais já são perceptíveis e os níveis altos escalam mais.
  // Lv.10 chega a ~2,08x o atributo base sem alterar a identidade/raridade do equipamento.
  const multipliers=[1,1.0833,1.1667,1.2708,1.375,1.5,1.625,1.7708,1.9167,2.0833]
  const mult=multipliers[level-1]
  return {
    ...eq,itemId,level,mult,
    atk:Math.round(Number(eq.atk||0)*mult),
    def:Math.round(Number(eq.def||0)*mult)
  }
}

function equipmentUpgradeCost(rarity,currentLevel){
  const base=UPGRADE_BASE_COST[String(rarity||'common')]||2500
  return base*Math.max(1,Number(currentLevel)||1)
}

export async function getEquipmentLevels(jid,itemIds=[]){
  const ids=[...new Set((itemIds||[]).filter(Boolean))]
  if(!ids.length) return {}
  const {rows}=await db.query('SELECT item_id,level FROM equipment_upgrades WHERE jid=$1 AND item_id=ANY($2::text[])',[jid,ids])
  const out={}
  for(const id of ids) out[id]=1
  for(const row of rows) out[row.item_id]=Number(row.level||1)
  return out
}

export async function listUpgradeableEquipment(jid){
  await ensureUser(jid)
  const {rows}=await db.query(`
    SELECT inv.item_id,inv.quantity,i.name,i.category,i.rarity,i.price,
           COALESCE(u.level,1)::int AS level
    FROM inventories inv
    JOIN items i ON i.id=inv.item_id
    LEFT JOIN equipment_upgrades u ON u.jid=inv.jid AND u.item_id=inv.item_id
    WHERE inv.jid=$1 AND inv.quantity>0 AND i.category IN ('weapon','armor')
    ORDER BY CASE i.category WHEN 'weapon' THEN 1 ELSE 2 END,
             CASE i.rarity WHEN 'legendary' THEN 5 WHEN 'epic' THEN 4 WHEN 'rare' THEN 3 WHEN 'uncommon' THEN 2 ELSE 1 END DESC,
             i.name
  `,[jid])
  return rows.map(r=>{
    const current=equipmentStatsAtLevel(r.item_id,r.level)
    const next=Number(r.level)<EQUIPMENT_MAX_LEVEL?equipmentStatsAtLevel(r.item_id,Number(r.level)+1):null
    return {...r,current,next,maxLevel:EQUIPMENT_MAX_LEVEL,cost:next?equipmentUpgradeCost(r.rarity,r.level):0}
  })
}

export async function upgradeEquipment(jid,itemId){
  await ensureUser(jid)
  const eq=EQUIPMENT[itemId]
  if(!eq) throw new Error('Esse item não pode ser aprimorado.')
  return transaction(async client=>{
    const inv=await client.query(`
      SELECT inv.quantity,i.rarity,i.name
      FROM inventories inv JOIN items i ON i.id=inv.item_id
      WHERE inv.jid=$1 AND inv.item_id=$2 FOR UPDATE
    `,[jid,itemId])
    if(!inv.rows[0]||Number(inv.rows[0].quantity)<1) throw new Error('Você não possui esse equipamento.')
    const up=await client.query('SELECT level FROM equipment_upgrades WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])
    const currentLevel=Number(up.rows[0]?.level||1)
    if(currentLevel>=EQUIPMENT_MAX_LEVEL) throw new Error('Esse equipamento já está no Lv.10.')
    const cost=equipmentUpgradeCost(inv.rows[0].rarity,currentLevel)
    const wallet=await client.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    if(Number(wallet.rows[0]?.cash||0)<cost) throw new Error(`Saldo insuficiente. Upgrade custa R$ ${cost.toLocaleString('pt-BR')}.`)
    const nextLevel=currentLevel+1
    await client.query('UPDATE wallets SET cash=cash-$1,updated_at='+nowSql+' WHERE jid=$2',[cost,jid])
    await client.query(`
      INSERT INTO equipment_upgrades(jid,item_id,level,updated_at)
      VALUES($1,$2,$3,${nowSql})
      ON CONFLICT(jid,item_id) DO UPDATE SET level=EXCLUDED.level,updated_at=EXCLUDED.updated_at
    `,[jid,itemId,nextLevel])
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'upgrade',$2,'equipment_upgrade',$3)
    `,[jid,cost,`${itemId} Lv.${currentLevel}->Lv.${nextLevel}`])
    const cash=(await client.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0]?.cash||0
    return {
      itemId,name:inv.rows[0].name,rarity:inv.rows[0].rarity,
      fromLevel:currentLevel,level:nextLevel,cost,cash:Number(cash),
      stats:equipmentStatsAtLevel(itemId,nextLevel)
    }
  })
}

export async function equipItem(jid, itemId) {
  const eq=EQUIPMENT[itemId]
  if(!eq) throw new Error('Esse item não pode ser equipado.')

  return transaction(async client=>{
    const inv=await client.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])
    if(!inv.rows[0] || Number(inv.rows[0].quantity)<1) throw new Error('Você não possui esse item.')

    const field=eq.category==='weapon' ? 'weapon_id' : 'armor_id'
    await client.query(`UPDATE stats SET ${field}=$1,updated_at=${nowSql} WHERE jid=$2`,[itemId,jid])
    return {...eq,itemId}
  })
}

export async function usePetPotion(jid,itemId=null){
  await ensureUser(jid)
  return transaction(async client=>{
    const ids=Object.keys(PET_POTIONS)
    const rows=(await client.query(
      'SELECT item_id,quantity FROM inventories WHERE jid=$1 AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',
      [jid,ids]
    )).rows
    if(itemId && !PET_POTIONS[itemId]) throw new Error('Esse item não recupera HP do pet.')
    if(itemId && !rows.some(r=>r.item_id===itemId)) throw new Error('Você não possui essa poção de pet.')
    if(!itemId && !rows.length) throw new Error('Você não possui nenhuma poção de cura de pet.')

    const pet=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!pet) throw new Error('Você ainda não tem pet. Use !adotar.')

    const maxHp=petMaxHp(pet.level,pet.xp,pet.species)
    const before=Math.max(0,Number(pet.hp??maxHp))
    if(before>=maxHp) throw new Error(`O HP de ${pet.name} já está cheio (${maxHp}/${maxHp}).`)

    const missing=maxHp-before
    const available=rows
      .map(r=>({...r,...PET_POTIONS[r.item_id]}))
      .sort((a,b)=>a.heal-b.heal)
    const chosen=itemId
      ? available.find(x=>x.item_id===itemId)
      : (available.find(x=>x.heal>=missing) || available[available.length-1])

    const potion=PET_POTIONS[chosen.item_id]
    const hp=Math.min(maxHp,before+potion.heal)
    const healed=hp-before
    await client.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,chosen.item_id])
    await client.query('UPDATE pets SET hp=$1,max_hp=$2 WHERE jid=$3',[hp,maxHp,jid])
    await client.query('UPDATE pet_collection SET hp=$1,max_hp=$2 WHERE jid=$3 AND active=TRUE',[hp,maxHp,jid])
    return {
      itemId:chosen.item_id,name:potion.name,petName:pet.name,
      before,hp,maxHp,healed,remaining:Number(chosen.quantity)-1
    }
  })
}

export async function usePetEnergyItem(jid,itemId='energetico_pet'){
  if(itemId!=='energetico_pet') throw new Error('Esse item não recupera energia do pet.')
  await ensureUser(jid)
  return transaction(async client=>{
    const inv=(await client.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
      [jid,itemId]
    )).rows[0]
    if(!inv || Number(inv.quantity)<1) throw new Error('Você não possui Energético Pet.')

    const pet=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!pet) throw new Error('Você ainda não tem pet. Use !adotar.')
    const max=petMaxEnergy(pet.level,pet.species)
    const before=Number(pet.energy||0)
    if(before>=max) throw new Error(`A energia de ${pet.name} já está cheia (${max}/${max}).`)

    await client.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,itemId])
    await client.query('UPDATE pets SET energy=$1 WHERE jid=$2',[max,jid])
    await client.query('UPDATE pet_collection SET energy=$1 WHERE jid=$2 AND active=TRUE',[max,jid])
    return {name:'Energético Pet',petName:pet.name,before,energy:max,max,recovered:max-before,remaining:Number(inv.quantity)-1}
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
  const levels=await getEquipmentLevels(jid,[p.weapon_id,p.armor_id])
  const weapon=p.weapon_id?equipmentStatsAtLevel(p.weapon_id,levels[p.weapon_id]||1):null
  const armor=p.armor_id?equipmentStatsAtLevel(p.armor_id,levels[p.armor_id]||1):null
  const w=weapon||{atk:0,def:0,name:'Nenhuma',level:1}
  const a=armor||{atk:0,def:0,name:'Nenhuma',level:1}
  return {
    ...p,
    base_atk:Number(p.atk),
    base_def:Number(p.def),
    weapon_atk:Number(w.atk||0),
    armor_def:Number(a.def||0),
    effective_atk:Number(p.atk)+Number(w.atk||0)+Number(a.atk||0),
    effective_def:Number(p.def)+Number(w.def||0)+Number(a.def||0),
    weapon_name:w.name,
    armor_name:a.name,
    weapon_level:Number(w.level||1),
    armor_level:Number(a.level||1),
  }
}

export async function battle(attackerJid, defenderJid) {
  if(attackerJid===defenderJid) throw new Error('Você não pode batalhar contra si mesmo.')
  await ensureUser(defenderJid)

  return transaction(async client=>{
    const sleeping=await client.query('SELECT ends_at FROM player_sleep WHERE jid=$1 AND ends_at>$2',[defenderJid,Math.floor(Date.now()/1000)])
    if(sleeping.rows.length) throw new Error('Essa pessoa está dormindo e não pode ser atacada agora.')
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

    const levelRows=(await client.query(
      'SELECT jid,item_id,level FROM equipment_upgrades WHERE jid=ANY($1::text[])',
      [[attackerJid,defenderJid]]
    )).rows
    const eqLevel=(jid,itemId)=>Number(levelRows.find(r=>r.jid===jid&&r.item_id===itemId)?.level||1)
    const aeW=a.weapon_id?equipmentStatsAtLevel(a.weapon_id,eqLevel(attackerJid,a.weapon_id)):{atk:0,def:0}
    const aeA=a.armor_id?equipmentStatsAtLevel(a.armor_id,eqLevel(attackerJid,a.armor_id)):{atk:0,def:0}
    const beW=b.weapon_id?equipmentStatsAtLevel(b.weapon_id,eqLevel(defenderJid,b.weapon_id)):{atk:0,def:0}
    const beA=b.armor_id?equipmentStatsAtLevel(b.armor_id,eqLevel(defenderJid,b.armor_id)):{atk:0,def:0}

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

    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const xpMultiplier=await getDoubleEventMultiplier(client,'xp')
    const reward=(600+Math.floor(Math.random()*601))*moneyMultiplier
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

    const winXpGain=40*xpMultiplier
    const loseXpGain=15*xpMultiplier
    const winExp=await applyExp(client,winner.jid,winXpGain)
    const loseExp=await applyExp(client,loser.jid,loseXpGain)

    return {
      ok:true,winner,loser,reward,log,
      winExp,loseExp,winXpGain,loseXpGain,eventMultiplier:Math.max(moneyMultiplier,xpMultiplier),
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
    await client.query('DELETE FROM equipment_upgrades WHERE jid=$1',[jid])
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
    await client.query('DELETE FROM equipment_upgrades WHERE jid=$1',[jid])
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
    label:'Caixa da Sorte',
    minRarity:'common',
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
    label:'Caixa Rara',
    minRarity:'uncommon',
    legendary:0.003,
    epic:0.05,
    rare:0.35,
    uncommon:1.00,
    cashChance:0.20,
    expChance:0.10,
    cash:[5000,20000],
    exp:[200,700]
  },
  caixa_epica: {
    label:'Caixa Épica',
    minRarity:'rare',
    legendary:0.01,
    epic:0.25,
    rare:1.00,
    uncommon:1.00,
    cashChance:0.12,
    expChance:0.08,
    cash:[20000,60000],
    exp:[800,1800]
  }
}

const LOOT_POOLS = {
  common:['pocao_p','espada_madeira','armadura_couro'],
  uncommon:['pocao_m','espada_ferro','armadura_ferro'],
  rare:['pocao_g','espada_aco','machado_guerra','katana_sombria','armadura_aco','armadura_samurai','armadura_cavaleiro'],
  epic:['elixir_supremo','espada_flamas','tridente_tempestade','lamina_abissal','foice_carmesim','lanca_solar','garras_vazio','espada_eclipse','armadura_dragao','armadura_abissal','armadura_celestial','manto_fenix','couraca_vulcanica','armadura_vazio','armadura_eclipse'],
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

      const rarityOrder={common:0,uncommon:1,rare:2,epic:3,legendary:4}
      if(rarityOrder[rarity]<rarityOrder[config.minRarity]){
        rarity=config.minRarity
      }

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
      boxName:config.label||boxId,
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
    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const xpMultiplier=await getDoubleEventMultiplier(client,'xp')

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
      const lossExp=10*xpMultiplier
      const expRes=await applyExp(client,jid,lossExp)
      return {ok:true,won:false,monster:m.name,hp:recover,maxHp:Number(row.max_hp),exp:lossExp,level:expRes,eventMultiplier:xpMultiplier}
    }

    const cash=Math.floor((700+Math.random()*801)*m.mult)*moneyMultiplier
    const exp=Math.floor((35+Math.random()*31)*m.mult)*xpMultiplier
    await client.query('UPDATE stats SET hp=$1,updated_at='+nowSql+' WHERE jid=$2',[Math.max(1,php),jid])
    await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[cash,jid])
    await client.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'dungeon_reward',$3)
    `,[jid,cash,m.name])
    const expRes=await applyExp(client,jid,exp)
    return {ok:true,won:true,monster:m.name,hp:Math.max(1,php),maxHp:Number(row.max_hp),cash,exp,level:expRes,eventMultiplier:Math.max(moneyMultiplier,xpMultiplier)}
  })
}

export async function robPlayer(thiefJid,targetJid) {
  if(thiefJid===targetJid) throw new Error('Você não pode roubar a si mesmo.')
  await ensureUser(thiefJid)
  await ensureUser(targetJid)

  return transaction(async client=>{
    const sleeping=await client.query('SELECT ends_at FROM player_sleep WHERE jid=$1 AND ends_at>$2',[targetJid,Math.floor(Date.now()/1000)])
    if(sleeping.rows.length) throw new Error('Essa pessoa está dormindo e não pode ser roubada agora.')
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

async function readDoubleRewardEvent(queryable=db){
  const {rows}=await queryable.query("SELECT value FROM trevo_settings WHERE key='double_reward_event'")
  const raw=rows[0]?.value || {}
  const endsAt=Number(raw?.endsAt||0)
  const moneyMultiplier=Math.max(1,Number(raw?.moneyMultiplier||2))
  const xpMultiplier=Math.max(1,Number(raw?.xpMultiplier||2))
  const now=Date.now()
  return {
    active:endsAt>now,
    endsAt,
    moneyMultiplier,
    xpMultiplier,
    activatedBy:String(raw?.activatedBy||''),
    remainingMs:Math.max(0,endsAt-now)
  }
}

export async function getDoubleRewardEvent(){
  return readDoubleRewardEvent(db)
}

export async function getDoubleEventMultiplier(queryable=db,kind='money'){
  const event=await readDoubleRewardEvent(queryable)
  if(!event.active) return 1
  return kind==='xp' ? event.xpMultiplier : event.moneyMultiplier
}

export async function startDoubleRewardEvent(minutes=20,activatedBy='owner'){
  minutes=Number(minutes)
  if(!Number.isInteger(minutes)||minutes<1||minutes>180) throw new Error('Duração inválida. Use entre 1 e 180 minutos.')
  const state={
    active:true,
    startedAt:Date.now(),
    endsAt:Date.now()+(minutes*60*1000),
    moneyMultiplier:2,
    xpMultiplier:2,
    activatedBy:String(activatedBy||'owner')
  }
  await db.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    VALUES('double_reward_event',$1::jsonb,${nowSql})
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
  `,[JSON.stringify(state)])
  return readDoubleRewardEvent(db)
}

export async function stopDoubleRewardEvent(activatedBy='owner'){
  const state={
    active:false,
    startedAt:0,
    endsAt:0,
    moneyMultiplier:2,
    xpMultiplier:2,
    activatedBy:String(activatedBy||'owner')
  }
  await db.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    VALUES('double_reward_event',$1::jsonb,${nowSql})
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
  `,[JSON.stringify(state)])
  return readDoubleRewardEvent(db)
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
    ALTER TABLE pets ADD COLUMN IF NOT EXISTS hp INTEGER NOT NULL DEFAULT 100;
    ALTER TABLE pets ADD COLUMN IF NOT EXISTS max_hp INTEGER NOT NULL DEFAULT 100;

    CREATE TABLE IF NOT EXISTS pet_collection(
      id BIGSERIAL PRIMARY KEY,
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      species TEXT NOT NULL,name TEXT NOT NULL,level INTEGER NOT NULL DEFAULT 1,xp INTEGER NOT NULL DEFAULT 0,
      hunger INTEGER NOT NULL DEFAULT 100,hygiene INTEGER NOT NULL DEFAULT 100,energy INTEGER NOT NULL DEFAULT 100,
      power INTEGER NOT NULL DEFAULT 10,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,
      last_action BIGINT NOT NULL DEFAULT 0,last_rest BIGINT NOT NULL DEFAULT 0,created_at BIGINT NOT NULL DEFAULT ${nowSql},
      active BOOLEAN NOT NULL DEFAULT FALSE
    );
    ALTER TABLE pet_collection ADD COLUMN IF NOT EXISTS hp INTEGER NOT NULL DEFAULT 100;
    ALTER TABLE pet_collection ADD COLUMN IF NOT EXISTS max_hp INTEGER NOT NULL DEFAULT 100;
    CREATE INDEX IF NOT EXISTS pet_collection_owner_idx ON pet_collection(jid,id);
    CREATE UNIQUE INDEX IF NOT EXISTS pet_collection_one_active_idx ON pet_collection(jid) WHERE active;
    INSERT INTO pet_collection(jid,species,name,level,xp,hunger,hygiene,energy,power,wins,losses,last_action,last_rest,created_at,active)
      SELECT p.jid,p.species,p.name,p.level,p.xp,p.hunger,p.hygiene,p.energy,p.power,p.wins,p.losses,p.last_action,p.last_rest,p.created_at,TRUE FROM pets p
      WHERE NOT EXISTS(SELECT 1 FROM pet_collection pc WHERE pc.jid=p.jid);

    CREATE TABLE IF NOT EXISTS player_sleep(
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      place TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      ends_at BIGINT NOT NULL,
      xp_reward INTEGER NOT NULL,
      fee BIGINT NOT NULL DEFAULT 0
    );

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
    ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS expires_at BIGINT;
    UPDATE market_listings SET expires_at=created_at+3600 WHERE expires_at IS NULL;
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

const SLEEP_PLACES={
  kitnet:{label:'Kitnet',seconds:30*60,xp:30,fee:0},
  casa:{label:'Casa',seconds:60*60,xp:65,fee:0},
  sobrado:{label:'Sobrado',seconds:2*60*60,xp:140,fee:0},
  mansao:{label:'Mansão',seconds:4*60*60,xp:300,fee:0},
  cobertura:{label:'Cobertura',seconds:8*60*60,xp:650,fee:0},
  aluguel:{label:'Quarto alugado',seconds:15*60,xp:15,fee:1000}
}

async function recoverPetEnergyFromSleep(client,jid,startedAt,endedAt){
  const elapsed=Math.max(0,Math.floor((Number(endedAt)-Number(startedAt))/60))
  if(elapsed<1) return {gained:0,current:null,max:null,petHpGained:0,playerHpGained:0}

  const player=(await client.query('SELECT hp,max_hp FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  let playerHpGained=0,playerHp=null,playerMaxHp=null
  if(player){
    playerMaxHp=Number(player.max_hp||100)
    const beforeHp=Number(player.hp||0)
    playerHp=Math.min(playerMaxHp,beforeHp+elapsed)
    playerHpGained=Math.max(0,playerHp-beforeHp)
    if(playerHpGained>0) await client.query('UPDATE stats SET hp=$1,updated_at='+nowSql+' WHERE jid=$2',[playerHp,jid])
  }

  const pet=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(!pet) return {gained:0,current:null,max:null,petHpGained:0,playerHpGained,playerHp,playerMaxHp}

  const max=petMaxEnergy(pet.level,pet.species)
  const before=Number(pet.energy||0)
  const current=Math.min(max,before+elapsed)
  const gained=Math.max(0,current-before)

  const petMax=Math.max(1,Number(pet.max_hp||petMaxHp(pet.level,pet.xp,pet.species)))
  const petBeforeHp=Number(pet.hp??petMax)
  const petHp=Math.min(petMax,petBeforeHp+elapsed)
  const petHpGained=Math.max(0,petHp-petBeforeHp)

  if(gained>0 || petHpGained>0){
    await client.query('UPDATE pets SET energy=$1,hp=$2,max_hp=$3 WHERE jid=$4',[current,petHp,petMax,jid])
    await client.query('UPDATE pet_collection SET energy=$1,hp=$2,max_hp=$3 WHERE jid=$4 AND active=TRUE',[current,petHp,petMax,jid])
  }

  return {gained,current,max,petHpGained,petHp,petMaxHp:petMax,playerHpGained,playerHp,playerMaxHp}
}

export async function resolvePlayerSleep(jid){
  return transaction(async client=>{
    const row=(await client.query('SELECT * FROM player_sleep WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!row) return null
    const now=Math.floor(Date.now()/1000)
    if(Number(row.ends_at)>now) return {active:true,...row,remaining:Number(row.ends_at)-now}
    const level=await applyExp(client,jid,Number(row.xp_reward))
    const petEnergy=await recoverPetEnergyFromSleep(client,jid,row.started_at,row.ends_at)
    await client.query('DELETE FROM player_sleep WHERE jid=$1',[jid])
    return {active:false,woke:true,...row,level,petEnergy}
  })
}

export async function wakePlayerEarly(jid){
  await ensureUser(jid)
  return transaction(async client=>{
    const row=(await client.query('SELECT * FROM player_sleep WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!row) throw new Error('Você não está dormindo.')
    const now=Math.floor(Date.now()/1000)
    const remaining=Math.max(0,Number(row.ends_at)-now)
    if(remaining<=0){
      const level=await applyExp(client,jid,Number(row.xp_reward))
      const petEnergy=await recoverPetEnergyFromSleep(client,jid,row.started_at,row.ends_at)
      await client.query('DELETE FROM player_sleep WHERE jid=$1',[jid])
      return {natural:true,fee:0,xp:Number(row.xp_reward),level,place:row.place,petEnergy}
    }
    const total=Math.max(1,Number(row.ends_at)-Number(row.started_at))
    const ratio=Math.min(1,remaining/total)
    // Acordar cedo é propositalmente caro: R$ 1.500 mínimo e até R$ 15.000 no início do sono.
    const fee=Math.max(1500,Math.ceil((1500+13500*ratio)/100)*100)
    const wallet=(await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const cash=Number(wallet?.cash||0),bank=Number(wallet?.bank||0)
    if(cash+bank<fee) throw new Error(`Acordar agora custa R$ ${fee.toLocaleString('pt-BR')}. Saldo insuficiente.`)
    const fromCash=Math.min(cash,fee)
    await client.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at='+nowSql+' WHERE jid=$3',[fromCash,fee-fromCash,jid])
    // XP proporcional ao tempo efetivamente dormido; não permite pagar para receber o XP integral.
    const elapsed=Math.max(0,now-Number(row.started_at))
    const xp=Math.floor(Number(row.xp_reward)*Math.min(1,elapsed/total))
    let level=null
    if(xp>0) level=await applyExp(client,jid,xp)
    const petEnergy=await recoverPetEnergyFromSleep(client,jid,row.started_at,now)
    await client.query('DELETE FROM player_sleep WHERE jid=$1',[jid])
    await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'system',$2,'wake_early',$3)`,[jid,fee,`Acordou antes: ${remaining}s restantes`])
    return {natural:false,fee,xp,remaining,place:row.place,level,petEnergy}
  })
}

export async function startPlayerSleep(jid){
  await ensureUser(jid)
  return transaction(async client=>{
    const existing=(await client.query('SELECT * FROM player_sleep WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const now=Math.floor(Date.now()/1000)
    if(existing&&Number(existing.ends_at)>now) return {active:true,...existing,remaining:Number(existing.ends_at)-now}
    if(existing){
      const level=await applyExp(client,jid,Number(existing.xp_reward))
      const petEnergy=await recoverPetEnergyFromSleep(client,jid,existing.started_at,existing.ends_at)
      await client.query('DELETE FROM player_sleep WHERE jid=$1',[jid])
      return {active:false,woke:true,...existing,level,petEnergy}
    }
    const home=(await client.query('SELECT house_id FROM user_homes WHERE jid=$1',[jid])).rows[0]?.house_id
    const plan=SLEEP_PLACES[home]||SLEEP_PLACES.aluguel
    if(plan.fee>0){
      const wallet=(await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
      const cash=Number(wallet?.cash||0),bank=Number(wallet?.bank||0)
      if(cash+bank<plan.fee) throw new Error('Sem imóvel, dormir custa R$ 1.000 de aluguel. Saldo insuficiente.')
      const fromCash=Math.min(cash,plan.fee)
      await client.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at='+nowSql+' WHERE jid=$3',[fromCash,plan.fee-fromCash,jid])
      await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES($1,'system',$2,'sleep_rent','Aluguel para dormir')`,[jid,plan.fee])
    }
    const endsAt=now+plan.seconds
    await client.query(`INSERT INTO player_sleep(jid,place,started_at,ends_at,xp_reward,fee)
      VALUES($1,$2,$3,$4,$5,$6)`,[jid,plan.label,now,endsAt,plan.xp,plan.fee])
    return {active:true,place:plan.label,started_at:now,ends_at:endsAt,xp_reward:plan.xp,fee:plan.fee,remaining:plan.seconds,started:true}
  })
}

const PET_BASE_ENERGY={
  cachorro:100,gato:105,coelho:110,papagaio:115,hamster:120,
  tartaruga:130,coruja:140,raposa:150,lobo:165,aguia:180,
  panda:200,tigre:225,leao:250,unicornio:280,dragao:320,
  golem_ancestral:340,urso_runico:345,colosso_cristal:360,
  salamandra_infernal:350,dragao_vulcanico:365,fenix_fogo:390,
  corvo_abissal:350,lobo_abismo:370,fenix_gelo:395,
  rinoceronte_titanico:365,guardiao_obsidiana:380,leviata_gelo:405,
  cerbero_carmesim:380,tigre_lunar:390,imperador_abissal:420,
  leao_solar:390,grifo_celestial:410,fenix_celestial:440,
  serpente_cosmica:420,dragao_corrompido:450,fenix_alpha:500
}
export function petMaxEnergy(level=1,species='cachorro'){
  const base=PET_BASE_ENERGY[String(species||'cachorro').toLowerCase()]||100
  return base+Math.max(0,Number(level||1)-1)*2
}

export const PET_HP_PROFILES={
  cachorro:{base:105,growth:9,type:'Equilibrado'},
  gato:{base:90,growth:7,type:'Ágil'},
  coelho:{base:85,growth:7,type:'Ágil'},
  papagaio:{base:90,growth:7,type:'Suporte'},
  hamster:{base:80,growth:6,type:'Ágil'},
  tartaruga:{base:145,growth:13,type:'Tanque'},
  coruja:{base:100,growth:8,type:'Suporte'},
  raposa:{base:110,growth:9,type:'Ágil'},
  lobo:{base:130,growth:11,type:'Ofensivo'},
  aguia:{base:115,growth:9,type:'Crítico'},
  panda:{base:165,growth:14,type:'Tanque'},
  tigre:{base:150,growth:13,type:'Ofensivo'},
  leao:{base:170,growth:14,type:'Ofensivo'},
  unicornio:{base:190,growth:16,type:'Místico'},
  dragao:{base:230,growth:19,type:'Boss Hunter'},
  golem_ancestral:{base:240,growth:18,type:'Tanque'},
  urso_runico:{base:225,growth:17,type:'Tanque'},
  colosso_cristal:{base:280,growth:21,type:'Tanque'},
  salamandra_infernal:{base:210,growth:16,type:'Ofensivo'},
  dragao_vulcanico:{base:250,growth:19,type:'Ofensivo'},
  fenix_fogo:{base:235,growth:18,type:'Místico'},
  corvo_abissal:{base:200,growth:15,type:'Crítico'},
  lobo_abismo:{base:240,growth:18,type:'Ofensivo'},
  fenix_gelo:{base:240,growth:18,type:'Místico'},
  rinoceronte_titanico:{base:285,growth:22,type:'Tanque'},
  guardiao_obsidiana:{base:300,growth:23,type:'Tanque'},
  leviata_gelo:{base:320,growth:24,type:'Tanque'},
  cerbero_carmesim:{base:270,growth:21,type:'Ofensivo'},
  tigre_lunar:{base:260,growth:20,type:'Ofensivo'},
  imperador_abissal:{base:300,growth:23,type:'Boss Hunter'},
  leao_solar:{base:290,growth:22,type:'Ofensivo'},
  grifo_celestial:{base:275,growth:21,type:'Crítico'},
  fenix_celestial:{base:300,growth:23,type:'Místico'},
  serpente_cosmica:{base:300,growth:23,type:'Místico'},
  dragao_corrompido:{base:340,growth:25,type:'Boss Hunter'},
  fenix_alpha:{base:360,growth:27,type:'Mítico'}
}
export function petMaxHp(level=1,xp=0,species='cachorro'){
  const profile=PET_HP_PROFILES[String(species||'cachorro').toLowerCase()]||PET_HP_PROFILES.cachorro
  const lv=Math.max(1,Number(level)||1)
  const experience=Math.max(0,Number(xp)||0)
  return Math.max(1,Math.floor(profile.base+(lv-1)*profile.growth+Math.floor(experience/100)*2))
}
export function petHpType(species='cachorro'){
  return (PET_HP_PROFILES[String(species||'cachorro').toLowerCase()]||PET_HP_PROFILES.cachorro).type
}
function normalizedPetHp(p){
  if(!p) return p
  const desired=petMaxHp(p.level,p.xp,p.species)
  const oldMax=Math.max(1,Number(p.max_hp||100))
  const oldHp=Math.max(0,Number(p.hp??oldMax))
  const hp=Math.min(desired,Math.max(0,oldHp+(desired-oldMax)))
  return {...p,hp,max_hp:desired}
}

export const LEGENDARY_PET_SUMMONS=[
  {materialId:'nucleo_pedra',materialName:'Núcleo de Pedra',raidLevel:10,pets:[
    {species:'golem_ancestral',name:'🪨 Golem Ancestral',chance:60,power:18},
    {species:'urso_runico',name:'🐻 Urso Rúnico',chance:30,power:21},
    {species:'colosso_cristal',name:'💎 Colosso de Cristal',chance:10,power:26}
  ]},
  {materialId:'escama_vulcanica',materialName:'Escama Vulcânica',raidLevel:15,pets:[
    {species:'salamandra_infernal',name:'🔥 Salamandra Infernal',chance:55,power:22},
    {species:'dragao_vulcanico',name:'🐲 Dragão Vulcânico',chance:30,power:26},
    {species:'fenix_fogo',name:'🔥 Fênix de Fogo',chance:15,power:32}
  ]},
  {materialId:'olho_abissal',materialName:'Olho Abissal',raidLevel:20,pets:[
    {species:'corvo_abissal',name:'👁️ Corvo Abissal',chance:55,power:24},
    {species:'lobo_abismo',name:'🌑 Lobo do Abismo',chance:30,power:28},
    {species:'fenix_gelo',name:'❄️ Fênix de Gelo',chance:15,power:34}
  ]},
  {materialId:'nucleo_titan',materialName:'Núcleo do Titã',raidLevel:25,pets:[
    {species:'rinoceronte_titanico',name:'🦏 Rinoceronte Titânico',chance:55,power:27},
    {species:'guardiao_obsidiana',name:'🗿 Guardião de Obsidiana',chance:30,power:31},
    {species:'leviata_gelo',name:'🌊 Leviatã de Gelo',chance:15,power:36}
  ]},
  {materialId:'essencia_rei_abissal',materialName:'Essência do Rei Abissal',raidLevel:30,pets:[
    {species:'cerbero_carmesim',name:'🩸 Cérbero Carmesim',chance:55,power:30},
    {species:'tigre_lunar',name:'🌙 Tigre Lunar',chance:30,power:34},
    {species:'imperador_abissal',name:'👑 Imperador Abissal',chance:15,power:40}
  ]},
  {materialId:'fragmento_celestial',materialName:'Fragmento Celestial',raidLevel:40,pets:[
    {species:'leao_solar',name:'☀️ Leão Solar',chance:50,power:35},
    {species:'grifo_celestial',name:'✨ Grifo Celestial',chance:35,power:39},
    {species:'fenix_celestial',name:'🌟 Fênix Celestial',chance:15,power:45}
  ]},
  {materialId:'nucleo_alpha_corrompido',materialName:'Núcleo Alpha Corrompido',raidLevel:50,pets:[
    {species:'serpente_cosmica',name:'🌌 Serpente Cósmica',chance:55,power:40},
    {species:'dragao_corrompido',name:'☠️ Dragão Corrompido',chance:35,power:46},
    {species:'fenix_alpha',name:'👑 Fênix Alpha',chance:10,power:55}
  ]}
]

export async function summonLegendaryPet(jid,materialId){
  await ensureUser(jid)
  const altar=LEGENDARY_PET_SUMMONS.find(x=>x.materialId===String(materialId||''))
  if(!altar) throw new Error('Material de invocação inválido.')
  return transaction(async client=>{
    const inv=(await client.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,altar.materialId])).rows[0]
    const owned=Number(inv?.quantity||0)
    if(owned<100) throw new Error(`Você precisa de 100 ${altar.materialName}. Você possui ${owned}.`)
    await client.query('UPDATE inventories SET quantity=quantity-100 WHERE jid=$1 AND item_id=$2',[jid,altar.materialId])

    const roll=Math.random()*100
    let acc=0
    let chosen=altar.pets[altar.pets.length-1]
    for(const pet of altar.pets){
      acc+=Number(pet.chance||0)
      if(roll<acc){ chosen=pet; break }
    }

    const petName=chosen.name.replace(/^[^\p{L}\p{N}]+/u,'').slice(0,24)
    const energy=petMaxEnergy(1,chosen.species)
    const maxHp=petMaxHp(1,0,chosen.species)
    const collected=(await client.query(
      `INSERT INTO pet_collection(jid,species,name,energy,power,hp,max_hp,active)
       VALUES($1,$2,$3,$4,$5,$6,$6,FALSE) RETURNING *`,
      [jid,chosen.species,petName,energy,chosen.power,maxHp]
    )).rows[0]

    return {altar,pet:chosen,collectionId:collected.id,remaining:owned-100}
  })
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
    const changeFee=0
    const total=rule.price
    const wr=(await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0],cash=Number(wr?.cash||0),bank=Number(wr?.bank||0)
    if(cash+bank<total) throw new Error(`Você precisa de R$ ${total.toLocaleString('pt-BR')} (${rule.label}: R$ ${rule.price.toLocaleString('pt-BR')}).`)
    const fromCash=Math.min(cash,total)
    await client.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at='+nowSql+' WHERE jid=$3',[fromCash,total-fromCash,jid])
    const petName=String(name||'Alpha').slice(0,24)
    if(old){
      const active=(await client.query('SELECT id FROM pet_collection WHERE jid=$1 AND active=TRUE FOR UPDATE',[jid])).rows[0]
      if(active) await client.query(`UPDATE pet_collection SET species=$1,name=$2,level=$3,xp=$4,hunger=$5,hygiene=$6,energy=$7,power=$8,wins=$9,losses=$10,last_action=$11,last_rest=$12,created_at=$13,hp=$14,max_hp=$15 WHERE id=$16`,
        [old.species,old.name,old.level,old.xp,old.hunger,old.hygiene,old.energy,old.power,old.wins,old.losses,old.last_action,old.last_rest,old.created_at,old.hp||old.max_hp||100,old.max_hp||petMaxHp(old.level,old.xp,old.species),active.id])
    }
    await client.query('UPDATE pet_collection SET active=FALSE WHERE jid=$1',[jid])
    const maxEnergy=petMaxEnergy(1,species)
    const maxHp=petMaxHp(1,0,species)
    const collected=(await client.query(`INSERT INTO pet_collection(jid,species,name,energy,hp,max_hp,active) VALUES($1,$2,$3,$4,$5,$5,TRUE) RETURNING *`,[jid,species,petName,maxEnergy,maxHp])).rows[0]
    const {rows}=await client.query(`INSERT INTO pets(jid,species,name,energy,hp,max_hp) VALUES($1,$2,$3,$4,$5,$5)
      ON CONFLICT(jid) DO UPDATE SET species=EXCLUDED.species,name=EXCLUDED.name,level=1,xp=0,power=10,hunger=100,hygiene=100,energy=EXCLUDED.energy,hp=EXCLUDED.hp,max_hp=EXCLUDED.max_hp,wins=0,losses=0,last_action=0,last_rest=0 RETURNING *`,[jid,species,petName,maxEnergy,maxHp])
    return {...rows[0],collectionId:collected.id,fee:total,petPrice:rule.price,changeFee:0,replaced:false,added:true}
  })
}
export async function getPet(jid){
  const {rows}=await db.query('SELECT * FROM pets WHERE jid=$1',[jid])
  if(!rows[0]) return null
  const before=rows[0], pet=normalizedPetHp(before)
  if(Number(before.hp)!==Number(pet.hp)||Number(before.max_hp)!==Number(pet.max_hp)){
    await db.query('UPDATE pets SET hp=$1,max_hp=$2 WHERE jid=$3',[pet.hp,pet.max_hp,jid])
    await db.query('UPDATE pet_collection SET hp=$1,max_hp=$2 WHERE jid=$3 AND active=TRUE',[pet.hp,pet.max_hp,jid])
  }
  return pet
}
export async function listPets(jid){
  const active=await getPet(jid)
  const {rows}=await db.query('SELECT * FROM pet_collection WHERE jid=$1 ORDER BY active DESC,id ASC',[jid])
  if(!rows.length&&active) return [{...active,id:null,active:true}]
  return rows.map(normalizedPetHp)
}
export async function selectPet(jid,id){
  id=Number(id); if(!Number.isInteger(id)||id<=0) throw new Error('Use !usarp et ID. Ex.: !usarpet 2')
  return transaction(async client=>{
    const current=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const rawTarget=(await client.query('SELECT * FROM pet_collection WHERE jid=$1 AND id=$2 FOR UPDATE',[jid,id])).rows[0]
    if(!rawTarget) throw new Error('Pet não encontrado. Use !meuspets.')
    const target=normalizedPetHp(rawTarget)
    if(target.active) return {...target,already:true}
    const active=(await client.query('SELECT id FROM pet_collection WHERE jid=$1 AND active=TRUE FOR UPDATE',[jid])).rows[0]
    if(current&&active) await client.query(`UPDATE pet_collection SET species=$1,name=$2,level=$3,xp=$4,hunger=$5,hygiene=$6,energy=$7,power=$8,wins=$9,losses=$10,last_action=$11,last_rest=$12,created_at=$13,hp=$14,max_hp=$15 WHERE id=$16`,
      [current.species,current.name,current.level,current.xp,current.hunger,current.hygiene,current.energy,current.power,current.wins,current.losses,current.last_action,current.last_rest,current.created_at,current.hp||current.max_hp||100,current.max_hp||petMaxHp(current.level,current.xp,current.species),active.id])
    await client.query('UPDATE pet_collection SET active=FALSE WHERE jid=$1',[jid])
    await client.query('UPDATE pet_collection SET active=TRUE WHERE id=$1',[id])
    await client.query(`INSERT INTO pets(jid,species,name,level,xp,hunger,hygiene,energy,power,wins,losses,last_action,last_rest,created_at,hp,max_hp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT(jid) DO UPDATE SET species=EXCLUDED.species,name=EXCLUDED.name,level=EXCLUDED.level,xp=EXCLUDED.xp,hunger=EXCLUDED.hunger,hygiene=EXCLUDED.hygiene,energy=EXCLUDED.energy,power=EXCLUDED.power,wins=EXCLUDED.wins,losses=EXCLUDED.losses,last_action=EXCLUDED.last_action,last_rest=EXCLUDED.last_rest,created_at=EXCLUDED.created_at,hp=EXCLUDED.hp,max_hp=EXCLUDED.max_hp`,
      [jid,target.species,target.name,target.level,target.xp,target.hunger,target.hygiene,target.energy,target.power,target.wins,target.losses,target.last_action,target.last_rest,target.created_at,target.hp,target.max_hp])
    return target
  })
}
export async function renamePet(jid,name){
  const newName=String(name||'').replace(/[\u0000-\u001F\u007F]/g,'').replace(/\s+/g,' ').trim()
  if(newName.length<2||newName.length>24) throw new Error('O nome do pet deve ter entre 2 e 24 caracteres.')
  const fee=1000
  return transaction(async client=>{
    const pet=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!pet) throw new Error('Você ainda não tem pet. Use !adotar.')
    if(pet.name.toLocaleLowerCase('pt-BR')===newName.toLocaleLowerCase('pt-BR')) throw new Error('Esse já é o nome do seu pet.')
    const wallet=(await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const cash=Number(wallet?.cash||0),bank=Number(wallet?.bank||0)
    if(cash+bank<fee) throw new Error('Você precisa de R$ 1.000 para trocar o nome do pet.')
    const fromCash=Math.min(cash,fee)
    await client.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at='+nowSql+' WHERE jid=$3',[fromCash,fee-fromCash,jid])
    const updated=(await client.query('UPDATE pets SET name=$1 WHERE jid=$2 RETURNING *',[newName,jid])).rows[0]
    await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'system',$2,'pet_rename',$3)`,[jid,fee,`${pet.name} -> ${newName}`])
    return {...updated,oldName:pet.name,fee}
  })
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
    const petHp=normalizedPetHp(pet)
    if(Number(petHp.hp)<=0 && !a.rest) throw new Error('Seu pet está sem HP. Use !descansar para recuperá-lo.')
    if(a.rest){
      const restCooldown=30*60
      const remaining=restCooldown-(now-Number(pet.last_rest||0))
      if(remaining>0) throw new Error(`Seu pet poderá descansar novamente em ${Math.ceil(remaining/60)} min.`)
      const maxEnergy=petMaxEnergy(pet.level,pet.species)
      if(Number(pet.energy)>=maxEnergy && Number(petHp.hp)>=Number(petHp.max_hp)) throw new Error(`Seu pet já está com energia e HP cheios.`)
    }
    // !descansar é justamente a ação de recuperação e não deve ser bloqueada
    // pelo cooldown curto deixado por treino, passeio ou aventura.
    if(!a.rest && now-Number(pet.last_action||0)<60) throw new Error('Seu pet precisa descansar um pouco.')
    if(a.energy<0 && Number(pet.energy)<Math.abs(a.energy)) throw new Error(`Energia insuficiente. Esta ação exige ${Math.abs(a.energy)} de energia. Use !descansar.`)
    const oldLevel=Number(pet.level||1)
    const xpMultiplier=await getDoubleEventMultiplier(client,'xp')
    const actionXp=Math.max(0,Number(a.xp||0))*xpMultiplier
    const xp=Number(pet.xp)+actionXp, level=1+Math.floor(xp/100)
    const levelsGained=Math.max(0,level-oldLevel)
    // Progressão natural: cada nível do pet concede +2 de Poder, além do bônus de treino/aventura.
    const powerGain=(a.power||0)+(levelsGained*2)
    const levelEnergyGain=levelsGained*3
    const {rows}=await client.query(`UPDATE pets SET
      hunger=LEAST(100,GREATEST(0,hunger+$1)),hygiene=LEAST(100,GREATEST(0,hygiene+$2)),
      energy=LEAST((CASE species WHEN 'cachorro' THEN 100 WHEN 'gato' THEN 105 WHEN 'coelho' THEN 110 WHEN 'papagaio' THEN 115 WHEN 'hamster' THEN 120 WHEN 'tartaruga' THEN 130 WHEN 'coruja' THEN 140 WHEN 'raposa' THEN 150 WHEN 'lobo' THEN 165 WHEN 'aguia' THEN 180 WHEN 'panda' THEN 200 WHEN 'tigre' THEN 225 WHEN 'leao' THEN 250 WHEN 'unicornio' THEN 280 WHEN 'dragao' THEN 320 ELSE 100 END)+GREATEST(0,$5-1)*2,GREATEST(0,energy+$3+$10)),xp=$4,level=$5,power=power+$6,last_action=$7,
      last_rest=CASE WHEN $8 THEN $7 ELSE last_rest END
      WHERE jid=$9 RETURNING *`,[a.hunger,a.hygiene,a.energy,xp,level,powerGain,now,Boolean(a.rest),jid,levelEnergyGain])
    let updated=rows[0]
    const newMax=petMaxHp(updated.level,updated.xp,updated.species)
    const oldMax=Math.max(1,Number(petHp.max_hp||100))
    const levelHpGain=Math.max(0,newMax-oldMax)
    const restHeal=a.rest?Math.max(1,Math.ceil(newMax*.35)):0
    const newHp=Math.min(newMax,Math.max(0,Number(petHp.hp)+levelHpGain+restHeal))
    updated=(await client.query('UPDATE pets SET hp=$1,max_hp=$2 WHERE jid=$3 RETURNING *',[newHp,newMax,jid])).rows[0]
    await client.query(`UPDATE pet_collection SET level=$1,xp=$2,hunger=$3,hygiene=$4,energy=$5,power=$6,last_action=$7,last_rest=$8,hp=$9,max_hp=$10 WHERE jid=$11 AND active=TRUE`,
      [updated.level,updated.xp,updated.hunger,updated.hygiene,updated.energy,updated.power,updated.last_action,updated.last_rest,updated.hp,updated.max_hp,jid])
    return {...updated,hpRecovered:restHeal}
  })
}
export async function petAdventure(jid){
  return transaction(async client=>{
    const pet=(await client.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!pet) throw new Error('Você ainda não tem pet. Use !adotar.')
    const petHp=normalizedPetHp(pet)
    if(Number(petHp.hp)<=0) throw new Error('Seu pet está sem HP. Use !descansar antes de mandar para aventura.')
    const energy=Number(pet.energy||0)
    if(energy<10) throw new Error(`Seu pet precisa de pelo menos 10 de energia para explorar. Energia atual: ${energy}/${petMaxEnergy(pet.level,pet.species)}. Use !descansar.`)
    const now=Math.floor(Date.now()/1000)
    if(now-Number(pet.last_action||0)<60) throw new Error('Seu pet precisa descansar um pouco antes de sair.')
    const adventureCooldown=await claimCooldown(client,`pet_adventure:${jid}`,30*60)
    if(!adventureCooldown.ok){
      throw new Error(`Seu pet poderá sair em outra aventura em ${Math.ceil(adventureCooldown.remaining/60)} min.`)
    }
    const level=Number(pet.level||1),power=Number(pet.power||10)
    const moneyMultiplier=await getDoubleEventMultiplier(client,'money')
    const xpMultiplier=await getDoubleEventMultiplier(client,'xp')
    // Aventura é progressão de pet, não fonte principal de dinheiro.
    // A curva antiga (R$70-120 por energia) permitia farm excessivo, sobretudo
    // em pets de alta capacidade e durante evento 2x. A nova faixa mantém
    // recompensa crescente por energia/nível/poder, mas torna inviável comprar
    // energético apenas para gerar lucro infinito.
    // Dinheiro da aventura deve acompanhar a energia realmente gasta.
    // Nível/poder só melhoram eficiência, com bônus limitado, para evitar que
    // um pet forte com pouca energia gere dezenas de milhares.
    const progressionBonus=Math.min(
      0.50,
      Math.max(0,level)*0.003 + Math.sqrt(Math.max(0,power))*0.006
    )
    const baseCash=Math.floor(
      energy*(18+Math.random()*12)*(1+progressionBonus)
    )
    const cash=Math.max(100,baseCash)*moneyMultiplier
    // Aventura deve dar progresso relevante, mas não vários níveis de uma vez.
    // Com a progressão atual (100 XP por nível), usar 2 XP por energia fazia
    // pets de alta capacidade subirem 5-7 níveis numa única aventura.
    const baseAdventureXp=Math.max(3,Math.floor(energy*0.35))
    const xpGain=baseAdventureXp*xpMultiplier
    const xp=Number(pet.xp||0)+xpGain
    const nextLevel=1+Math.floor(xp/100)
    const levelsGained=Math.max(0,nextLevel-Number(pet.level||1))
    const powerGain=Math.floor(energy/50)+(levelsGained*2)
    const levelEnergyGain=levelsGained*3
    const {rows}=await client.query(`UPDATE pets SET energy=LEAST((CASE species WHEN 'cachorro' THEN 100 WHEN 'gato' THEN 105 WHEN 'coelho' THEN 110 WHEN 'papagaio' THEN 115 WHEN 'hamster' THEN 120 WHEN 'tartaruga' THEN 130 WHEN 'coruja' THEN 140 WHEN 'raposa' THEN 150 WHEN 'lobo' THEN 165 WHEN 'aguia' THEN 180 WHEN 'panda' THEN 200 WHEN 'tigre' THEN 225 WHEN 'leao' THEN 250 WHEN 'unicornio' THEN 280 WHEN 'dragao' THEN 320 ELSE 100 END)+GREATEST(0,$2-1)*2,$8),xp=$1,level=$2,power=power+$3,
      hunger=GREATEST(0,hunger-$4),hygiene=GREATEST(0,hygiene-$5),last_action=$6
      WHERE jid=$7 RETURNING *`,[xp,nextLevel,powerGain,Math.ceil(energy*.25),Math.ceil(energy*.15),now,jid,levelEnergyGain])
    let updated=rows[0]
    const newMax=petMaxHp(updated.level,updated.xp,updated.species)
    const oldMax=Math.max(1,Number(petHp.max_hp||100))
    const newHp=Math.min(newMax,Math.max(0,Number(petHp.hp)+Math.max(0,newMax-oldMax)))
    updated=(await client.query('UPDATE pets SET hp=$1,max_hp=$2 WHERE jid=$3 RETURNING *',[newHp,newMax,jid])).rows[0]
    await client.query('UPDATE pet_collection SET level=$1,xp=$2,hunger=$3,hygiene=$4,energy=$5,power=$6,last_action=$7,hp=$8,max_hp=$9 WHERE jid=$10 AND active=TRUE',
      [updated.level,updated.xp,updated.hunger,updated.hygiene,updated.energy,updated.power,updated.last_action,updated.hp,updated.max_hp,jid])
    await client.query('UPDATE wallets SET cash=cash+$1,updated_at='+nowSql+' WHERE jid=$2',[cash,jid])
    await client.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'pet_adventure',$3)`,[jid,cash,`${pet.name}: ${energy} energia`])
    return {...updated,cash,xpGain,energySpent:energy,powerGain,eventMultiplier:Math.max(moneyMultiplier,xpMultiplier)}
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
  const sleeping=await db.query('SELECT ends_at FROM player_sleep WHERE jid=$1 AND ends_at>$2',[targetJid,Math.floor(Date.now()/1000)])
  if(sleeping.rows.length) throw new Error('Essa pessoa está dormindo e não pode disputar duelo de pets agora.')
  return transaction(async client=>{
    const rows=(await client.query('SELECT * FROM pets WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',[[challengerJid,targetJid]])).rows
    const a=normalizedPetHp(rows.find(p=>p.jid===challengerJid))
    const b=normalizedPetHp(rows.find(p=>p.jid===targetJid))
    if(!a||!b) throw new Error('Os dois jogadores precisam ter um pet.')
    if(Number(a.hp)<=0) throw new Error(`${a.name} está sem HP. Use !descansar antes do duelo.`)
    if(Number(b.hp)<=0) throw new Error(`${b.name} está sem HP e não pode duelar agora.`)

    let hpA=Number(a.hp),hpB=Number(b.hp),rounds=0
    const hit=p=>Math.max(4,Math.floor((Number(p.power||10)+Number(p.level||1)*2)*(.45+Math.random()*.35)))
    const aFirst=Math.random()<.5
    while(hpA>0&&hpB>0&&rounds<20){
      rounds++
      if(aFirst){
        hpB=Math.max(0,hpB-hit(a))
        if(hpB>0) hpA=Math.max(0,hpA-hit(b))
      }else{
        hpA=Math.max(0,hpA-hit(b))
        if(hpA>0) hpB=Math.max(0,hpB-hit(a))
      }
    }
    let winnerKey
    if(hpA<=0&&hpB<=0) winnerKey=Math.random()<.5?'a':'b'
    else if(hpB<=0) winnerKey='a'
    else if(hpA<=0) winnerKey='b'
    else {
      const ratioA=hpA/Math.max(1,Number(a.max_hp)),ratioB=hpB/Math.max(1,Number(b.max_hp))
      winnerKey=ratioA===ratioB?(Math.random()<.5?'a':'b'):(ratioA>ratioB?'a':'b')
    }

    const evolve=async(p,hpAfter,xpGain,won)=>{
      const oldLevel=Number(p.level||1),xp=Number(p.xp||0)+xpGain
      const level=1+Math.floor(xp/100),levelsGained=Math.max(0,level-oldLevel)
      const power=Number(p.power||10)+levelsGained*2
      const maxHp=petMaxHp(level,xp,p.species)
      const oldMax=Math.max(1,Number(p.max_hp||100))
      const hp=Math.min(maxHp,Math.max(0,hpAfter+Math.max(0,maxHp-oldMax)))
      const updated=(await client.query(
        'UPDATE pets SET xp=$1,level=$2,power=$3,hp=$4,max_hp=$5,wins=wins+$6,losses=losses+$7 WHERE jid=$8 RETURNING *',
        [xp,level,power,hp,maxHp,won?1:0,won?0:1,p.jid]
      )).rows[0]
      await client.query('UPDATE pet_collection SET xp=$1,level=$2,power=$3,hp=$4,max_hp=$5,wins=$6,losses=$7 WHERE jid=$8 AND active=TRUE',
        [updated.xp,updated.level,updated.power,updated.hp,updated.max_hp,updated.wins,updated.losses,p.jid])
      return updated
    }

    const xpMultiplier=await getDoubleEventMultiplier(client,'xp')
    const updatedA=await evolve(a,hpA,(winnerKey==='a'?25:10)*xpMultiplier,winnerKey==='a')
    const updatedB=await evolve(b,hpB,(winnerKey==='b'?25:10)*xpMultiplier,winnerKey==='b')
    const winner=winnerKey==='a'?updatedA:updatedB
    const loser=winnerKey==='a'?updatedB:updatedA
    return {winnerJid:winner.jid,loserJid:loser.jid,winner,loser,rounds}
  })
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

export async function expireMarketListings(){
  return transaction(async client=>{
    const now=Math.floor(Date.now()/1000)
    const {rows}=await client.query(
      "SELECT * FROM market_listings WHERE status='active' AND COALESCE(expires_at,created_at+3600)<=$1 FOR UPDATE",
      [now]
    )
    for(const x of rows){
      await client.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3)
        ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,
        [x.seller_jid,x.item_id,x.quantity])
      await client.query("UPDATE market_listings SET status='expired' WHERE id=$1",[x.id])
    }
    return rows.length
  })
}

export async function createMarketListing(jid,itemId,qty,price){
  qty=Number(qty); price=Number(price)
  if(!Number.isInteger(qty)||qty<1||!Number.isSafeInteger(price)||price<1) throw new Error('Quantidade ou preço inválido.')
  await expireMarketListings()
  return transaction(async client=>{
    const inv=await client.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])
    if(Number(inv.rows[0]?.quantity||0)<qty) throw new Error('Você não possui essa quantidade.')
    const stats=await client.query('SELECT weapon_id,armor_id FROM stats WHERE jid=$1',[jid])
    const equipped=[stats.rows[0]?.weapon_id,stats.rows[0]?.armor_id].includes(itemId)
    if(equipped) throw new Error('Esse item está equipado. Troque ou desequipe antes de anunciar no mercado.')
    await client.query('UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3',[qty,jid,itemId])
    const expiresAt=Math.floor(Date.now()/1000)+3600
    const r=await client.query(
      `INSERT INTO market_listings(seller_jid,item_id,quantity,price,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [jid,itemId,qty,price,expiresAt]
    )
    return r.rows[0]
  })
}
export async function listMarket(limit=15){
  await expireMarketListings()
  const now=Math.floor(Date.now()/1000)
  const {rows}=await db.query(`SELECT m.*,i.name,u.push_name AS seller_name,
    GREATEST(0,COALESCE(m.expires_at,m.created_at+3600)-$2)::bigint AS remaining_seconds
    FROM market_listings m JOIN items i ON i.id=m.item_id LEFT JOIN users u ON u.jid=m.seller_jid
    WHERE m.status='active' AND COALESCE(m.expires_at,m.created_at+3600)>$2
    ORDER BY m.created_at DESC LIMIT $1`,[Math.min(30,Math.max(1,Number(limit)||15)),now])
  return rows
}
export async function buyMarketListing(buyerJid,id){
  await ensureUser(buyerJid)
  await expireMarketListings()
  return transaction(async client=>{
    const r=await client.query(`SELECT m.*,i.name FROM market_listings m JOIN items i ON i.id=m.item_id WHERE m.id=$1 FOR UPDATE`,[Number(id)])
    const x=r.rows[0]; if(!x||x.status!=='active') throw new Error('Anúncio não está mais disponível.')
    if(Number(x.expires_at||Number(x.created_at)+3600)<=Math.floor(Date.now()/1000)) throw new Error('Esse anúncio expirou.')
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
  await expireMarketListings()
  return transaction(async client=>{
    const r=await client.query('SELECT * FROM market_listings WHERE id=$1 AND seller_jid=$2 FOR UPDATE',[Number(id),jid])
    const x=r.rows[0]; if(!x||x.status!=='active') throw new Error('Anúncio ativo não encontrado.')
    await client.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,[jid,x.item_id,x.quantity])
    await client.query(`UPDATE market_listings SET status='cancelled' WHERE id=$1`,[x.id]); return x
  })
}
