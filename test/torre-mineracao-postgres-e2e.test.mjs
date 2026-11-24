// PostgreSQL real E2E, only in an ephemeral alpha_homolog/alpha_test database.
// To avoid touching production, the test is DISABLED without explicit CI flags.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

const enabled=process.env.ALPHA_MINING_E2E_PG==='1'
const safe=(()=>{
 try {
  const u=new URL(process.env.DATABASE_URL||'')
  return /^(alpha_test|alpha_homolog)(?:_[a-z0-9_]+)?$/.test(u.pathname.slice(1)) &&
     process.env.ALPHA_MINING_MODE==='homologation' &&
     process.env.ALPHA_MINING_DB_CONFIRMED==='test-only' &&
     ['127.0.0.1','localhost','::1'].includes(u.hostname)
 }catch{return false}
})()

test('mineração: PostgreSQL REAL em banco efêmero e privado', {skip:!enabled}, async t=>{
 assert.equal(safe,true,'ABORTADO: só permite PostgreSQL local com database alpha_homolog/alpha_test e flags de teste')
 const [{db,ensureUser,startPlayerSleep,startPlayerCarpinar},
   {initEnchantments},store,{handleMiningCommand}] = await Promise.all([
   import('../src/neon/db.js'),
   import('../src/neon/enchantments-alpha.js'),
   import('../src/neon/torre-mineracao-store.js'),
   import('../src/neon/torre-mineracao-whatsapp.js')
 ])
 const jid='mining-homolog-'+randomUUID()+'@s.whatsapp.net'
 // Esquema mínimo real do Alpha Bot, sem executar migrações históricas sobre DB vazio.
 // O initDatabase() geral tem dependências de pet_collection anteriores a initCommunityPack().
 // Aqui testamos as transações da mineração e seu encaixe no motor XP sem alterar esse fluxo legado.
 await db.query(`
 CREATE TABLE users (
   jid TEXT PRIMARY KEY, push_name TEXT NOT NULL DEFAULT '', level INT NOT NULL DEFAULT 1,
   exp INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL DEFAULT 0
 );
 CREATE TABLE wallets(
   jid TEXT PRIMARY KEY REFERENCES users(jid), cash BIGINT NOT NULL DEFAULT 0,
   bank BIGINT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL DEFAULT 0
 );
 CREATE TABLE stats (
   jid TEXT PRIMARY KEY REFERENCES users(jid),
   class_id TEXT NOT NULL DEFAULT 'warrior', class_applied BOOLEAN NOT NULL DEFAULT FALSE
 );
 CREATE TABLE items(
   id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
   category TEXT NOT NULL DEFAULT 'misc', price BIGINT NOT NULL DEFAULT 0,
   rarity TEXT NOT NULL DEFAULT 'common', sellable BOOLEAN NOT NULL DEFAULT TRUE,
   stackable BOOLEAN NOT NULL DEFAULT TRUE
 );
 CREATE TABLE inventories(
   jid TEXT NOT NULL REFERENCES users(jid), item_id TEXT NOT NULL REFERENCES items(id),
   quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0), PRIMARY KEY(jid,item_id)
 );
 CREATE TABLE transactions (
   id BIGSERIAL PRIMARY KEY, from_jid TEXT NOT NULL, to_jid TEXT NOT NULL,
   amount BIGINT NOT NULL DEFAULT 0, type TEXT NOT NULL, note TEXT
 );
 CREATE TABLE alpha_xp_boosts (
   jid TEXT PRIMARY KEY REFERENCES users(jid),bonus_percent INT NOT NULL,
   bonus_remaining INT NOT NULL DEFAULT 0,expires_at BIGINT NOT NULL
 );
 CREATE TABLE player_class_levels (
   jid TEXT NOT NULL REFERENCES users(jid), class_id TEXT NOT NULL,
   level INT NOT NULL DEFAULT 1,xp INT NOT NULL DEFAULT 0,
   PRIMARY KEY(jid,class_id)
 );
 CREATE TABLE player_hero_mode(jid TEXT PRIMARY KEY REFERENCES users(jid),hero_species TEXT);
 CREATE TABLE pet_collection(jid TEXT NOT NULL REFERENCES users(jid),species TEXT NOT NULL);
 CREATE TABLE trevo_settings(key TEXT PRIMARY KEY,value JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at BIGINT NOT NULL DEFAULT 0);
 CREATE TABLE player_sleep(jid TEXT PRIMARY KEY REFERENCES users(jid),ends_at BIGINT NOT NULL);
 CREATE TABLE player_carpinar(jid TEXT PRIMARY KEY REFERENCES users(jid),ends_at BIGINT NOT NULL);
 CREATE TABLE raid_lote_jobs(jid TEXT NOT NULL REFERENCES users(jid),status TEXT NOT NULL);
 CREATE TABLE trevo_games(game_type TEXT NOT NULL,state JSONB NOT NULL DEFAULT '{}'::jsonb);
 `)
 await initEnchantments()
 await store.initMiningStore(db)
 await ensureUser(jid,'Homologação Mineração')
 // Evita evolução de nível durante teste de idempotência de XP (o XP real é creditado).
 await db.query('UPDATE users SET level=40,exp=0 WHERE jid=$1',[jid])
 await db.query('UPDATE wallets SET cash=50000 WHERE jid=$1',[jid])

 try{
   const money=async()=>Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0].cash)
   const uses=async(id)=>Number((await db.query('SELECT uses_remaining FROM mining_pickaxes WHERE jid=$1 AND pickaxe_id=$2',[jid,id])).rows[0].uses_remaining)
   await t.test('compra Madeira e não cobra em replay; Ouro não pode ser comprado',async()=>{
     const data={jid,pickaxeId:'madeira',key:'test-buy-00000001'}
     const first=await store.buyMiningPickaxe(db,data)
     assert.equal(first.priceCash,2000)
     assert.equal(await money(),48000)
     assert.equal(await uses('madeira'),4)
     const repeat=await store.buyMiningPickaxe(db,data)
     assert.equal(repeat.repeated,true)
     assert.equal(await money(),48000)
     await assert.rejects(store.buyMiningPickaxe(db,{jid,pickaxeId:'ouro',key:'test-buy-00000002'}),/exclusiva/)
     await assert.rejects(store.buyMiningPickaxe(db,{jid,pickaxeId:'aco',key:'test-buy-00000001'}),/divergente/)
   })
   await t.test('Raidade, Carpinar, Dormir não podem coexistir com mineração',async()=>{
     const started=await store.startMiningExpedition(db,{jid,pickaxeId:'madeira',key:'test-start-00000001'})
     assert.ok(started.id)
     assert.equal(await uses('madeira'),3)
     const status=await store.getMiningStatus(db,jid)
     assert.equal(status.ready,false)
     await assert.rejects(startPlayerSleep(jid,1),/minerando/)
     await assert.rejects(startPlayerCarpinar(jid,1),/minerando/)
     await assert.rejects(store.startMiningExpedition(db,{jid,pickaxeId:'madeira',key:'test-start-00000002'}),/expedição anterior/)
     const replay=await store.startMiningExpedition(db,{jid,pickaxeId:'madeira',key:'test-start-00000001'})
     assert.equal(replay.repeated,true)
     assert.equal(await uses('madeira'),3)
   })
   await t.test('resgate antecipado não paga, 4h completadas pagam uma única vez',async()=>{
     const early=await store.claimMiningExpedition(db,jid)
     assert.equal(early.status,'running')
     assert.equal(await money(),48000)
     const active=await store.getMiningStatus(db,jid)
     await db.query("UPDATE mining_expeditions SET started_at=EXTRACT(EPOCH FROM NOW())::bigint-14405, ends_at=EXTRACT(EPOCH FROM NOW())::bigint-5 WHERE id=$1",[active.id])
     const ready=await store.getMiningStatus(db,jid)
     assert.equal(ready.ready,true)
     const first=await store.claimMiningExpedition(db,jid)
     assert.equal(first.status,'claimed')
     assert.equal(first.cash,800)
     assert.equal(await money(),48800)
     const xpBefore=Number((await db.query('SELECT exp FROM users WHERE jid=$1',[jid])).rows[0].exp)
     assert.ok(xpBefore>=0)
     const stonesBefore=(await db.query("SELECT COALESCE(SUM(quantity),0)::int AS n FROM inventories WHERE jid=$1 AND item_id LIKE 'pedra_%_alpha'",[jid])).rows[0].n
     const second=await store.claimMiningExpedition(db,jid)
     assert.equal(second.status,'none')
     assert.equal(await money(),48800)
     const xpAfter=Number((await db.query('SELECT exp FROM users WHERE jid=$1',[jid])).rows[0].exp)
     assert.equal(xpAfter,xpBefore)
     const stonesAfter=(await db.query("SELECT COALESCE(SUM(quantity),0)::int AS n FROM inventories WHERE jid=$1 AND item_id LIKE 'pedra_%_alpha'",[jid])).rows[0].n
     assert.equal(stonesAfter,stonesBefore)
     const rewards=(await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE to_jid=$1 AND type='mining_reward'",[jid])).rows[0]
     assert.equal(rewards.n,1)
   })
   await t.test('reparo Madeira 1 uso R$ 300; replay não cobra duas vezes',async()=>{
     const data={jid,pickaxeId:'madeira',key:'test-repair-000001'}
     const r=await store.repairMiningPickaxe(db,data)
     assert.equal(r.costCash,300)
     assert.equal(await money(),48500)
     assert.equal(await uses('madeira'),4)
     const retry=await store.repairMiningPickaxe(db,data)
     assert.equal(retry.repeated,true)
     assert.equal(await money(),48500)
   })
   await t.test('Cerco Ouro e Evento Diamante exclusivos, idempotentes',async()=>{
     const gold=await store.grantMiningPickaxeReward(db,{jid,pickaxeId:'ouro',source:'cerco',key:'test-cerco-000001'})
     assert.equal(gold.status,'granted')
     const again=await store.grantMiningPickaxeReward(db,{jid,pickaxeId:'ouro',source:'cerco',key:'test-cerco-000001'})
     assert.equal(again.repeated,true)
     const diamond=await store.grantMiningPickaxeReward(db,{jid,pickaxeId:'diamante',source:'evento_inaugural',key:'test-event-000001'})
     assert.equal(diamond.status,'granted')
     assert.equal(await uses('diamante'),8)
     await assert.rejects(store.grantMiningPickaxeReward(db,{jid,pickaxeId:'diamante',source:'cerco',key:'test-event-000002'}),/Origem/)
   })
   await t.test('resultado registrado do Cerco/Evento concede tipo certo uma vez no PostgreSQL',async()=>{
     const eventId='cerco_cla_teste_20261124'
     const r=await store.awardMiningFromFinalEvent(db,{eventId,source:'cerco',jid})
     assert.equal(r.status,'registered_already_owned')
     assert.equal(r.pickaxeId,'ouro')
     const again=await store.awardMiningFromFinalEvent(db,{eventId,source:'cerco',jid})
     assert.equal(again.status,'repeated')
     const records=await db.query('SELECT COUNT(*)::int AS n FROM mining_event_awards WHERE event_id=$1 AND jid=$2',[eventId,jid])
     assert.equal(records.rows[0].n,1)
     await assert.rejects(store.awardMiningFromFinalEvent(db,{eventId,source:'evento_inaugural',jid}),/categoria diferente/)
     await assert.rejects(store.awardMiningFromFinalEvent(db,{eventId:'event-invalido',source:'outro',jid}),/elegível/)
     const diamond=await store.awardMiningFromFinalEvent(db,{eventId:'mining_inaugural_20261124',source:'evento_inaugural',jid})
     assert.equal(diamond.pickaxeId,'diamante')
     assert.equal(await uses('diamante'),8)
   })
   await t.test('concorrência: duas mensagens de iniciar geram apenas uma jornada',async()=>{
     const a=store.startMiningExpedition(db,{jid,pickaxeId:'madeira',key:'test-start-conc-00001'})
     const b=store.startMiningExpedition(db,{jid,pickaxeId:'madeira',key:'test-start-conc-00002'})
     const results=await Promise.allSettled([a,b])
     assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
     assert.equal(results.filter(x=>x.status==='rejected').length,1)
     assert.equal(await uses('madeira'),3)
     const cancelled=await store.cancelMiningExpedition(db,jid)
     assert.equal(cancelled.status,'cancelled')
     assert.equal(await uses('madeira'),3)
     const noReward=await store.claimMiningExpedition(db,jid)
     assert.equal(noReward.status,'none')
   })
   await t.test('WhatsApp handler testado sem parear WhatsApp real',async()=>{
     const messages=[]
     const handled=await handleMiningCommand({db,cmd:'picaretas',args:[],sender:jid,chat:'test-group',
       messageId:'test-msg-001',reply:async text=>messages.push(text)})
     assert.equal(handled,true)
     assert.match(messages[0],/Madeira/)
     assert.match(messages[0],/Diamante/)
     assert.match(messages[0],/Cerco/)
   })
 }finally{
   // Não removemos schema/banco; runner e container PostgreSQL são descartados ao final do job.
   await db.end()
 }
})
