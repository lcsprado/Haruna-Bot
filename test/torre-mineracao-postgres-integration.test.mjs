// Banco PostgreSQL temporário do GitHub Actions; jamais apontar para alpha_prod_v2.
import test from 'node:test'
import assert from 'node:assert/strict'
import {db} from '../src/neon/db.js'
import {initMiningStore,buyMiningPickaxe,repairMiningPickaxe,startMiningExpedition,
  claimMiningExpedition,cancelMiningExpedition,grantMiningPickaxeReward,getMiningPickaxes} from '../src/neon/torre-mineracao-store.js'
import {assertMiningHomologation,miningActivityLock,assertNoActiveMining} from '../src/neon/torre-mineracao-activity.js'

const jid='test-player@local'
const key=(v)=>'homolog-pg-'+v
const getCash=async()=>Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0]?.cash||0)
const uses=async(id)=>Number((await db.query('SELECT uses_remaining FROM mining_pickaxes WHERE jid=$1 AND pickaxe_id=$2',[jid,id])).rows[0]?.uses_remaining??-1)
const committed=async()=>Number((await db.query("SELECT COUNT(*)::int AS n FROM mining_expeditions WHERE jid=$1 AND status='claimed'",[jid])).rows[0].n)
const run=async(fn)=>{const c=await db.connect();try{await c.query('BEGIN');await miningActivityLock(c,jid);const r=await fn(c);await c.query('ROLLBACK');return r}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}

test('homologação PostgreSQL real: dinheiro, tempo, drops, idempotência e bloqueios',async(t)=>{
  assertMiningHomologation()
  try{
    // Fixture exclusiva do banco descartável. Não usar initDatabase nem bancos reais.
    await db.query(`
      CREATE TABLE users (jid text primary key,push_name text not null default '',
        level integer not null default 100, exp integer not null default 0,
        updated_at bigint not null default 0);
      CREATE TABLE wallets (jid text primary key references users(jid),
        cash bigint not null default 0,bank bigint not null default 0,
        updated_at bigint not null default 0);
      CREATE TABLE stats (jid text primary key references users(jid),
        class_id text not null default 'warrior',class_applied boolean not null default false);
      CREATE TABLE alpha_xp_boosts (jid text primary key,bonus_percent integer not null default 0,
        bonus_remaining integer not null default 0,expires_at bigint not null default 0);
      CREATE TABLE player_class_levels (jid text,class_id text,level integer not null default 1,
        xp integer not null default 0, primary key(jid,class_id));
      CREATE TABLE player_hero_mode (jid text primary key,hero_species text);
      CREATE TABLE pet_collection (jid text,species text);
      CREATE TABLE items (id text primary key);
      CREATE TABLE inventories (jid text not null references users(jid),item_id text not null references items(id),
        quantity integer not null default 0,primary key(jid,item_id));
      CREATE TABLE transactions (id bigserial primary key,from_jid text not null,to_jid text not null,
        amount bigint not null,type text not null,note text);
      CREATE TABLE player_sleep (jid text primary key,ends_at bigint not null);
      CREATE TABLE player_carpinar (jid text primary key,ends_at bigint not null);
      CREATE TABLE raid_lote_jobs (jid text,status text not null);
      CREATE TABLE trevo_games (jid text,game_type text,state jsonb);
    `)
    await initMiningStore(db)
    await db.query("INSERT INTO users(jid,push_name,level,exp) VALUES($1,'Teste',100,0)",[jid])
    await db.query("INSERT INTO wallets(jid,cash,bank) VALUES($1,0,0)",[jid])
    await db.query("INSERT INTO stats(jid) VALUES($1)",[jid])
    await db.query(`INSERT INTO items(id) VALUES
      ('pedra_forca_alpha'),('pedra_fortaleza_alpha'),('pedra_agilidade_alpha'),
      ('pedra_precisao_alpha'),('pedra_furia_alpha')`)

    await t.test('não compra sem saldo, sem gerar registros parciais',async()=>{
      await assert.rejects(buyMiningPickaxe(db,{jid,pickaxeId:'madeira',key:key('buy-poor')}),/insuficiente/)
      assert.equal((await getMiningPickaxes(db,jid)).length,0)
    })
    await db.query('UPDATE wallets SET cash=30000 WHERE jid=$1',[jid])

    await t.test('compra e replay debitam uma única vez',async()=>{
      const input={jid,pickaxeId:'madeira',key:key('buy-wood')}
      const bought=await buyMiningPickaxe(db,input)
      assert.equal(bought.status,'bought')
      assert.equal(await getCash(),28000)
      assert.equal((await buyMiningPickaxe(db,input)).repeated,true)
      assert.equal(await getCash(),28000)
      assert.equal(await uses('madeira'),4)
      await assert.rejects(buyMiningPickaxe(db,{...input,pickaxeId:'ferro'}),/divergente/)
      assert.equal(await getCash(),28000)
      await assert.rejects(buyMiningPickaxe(db,{jid,pickaxeId:'diamante',key:key('buy-diamond')}),/nao esta a venda/)
    })

    await t.test('início bloqueia sono, carpinar, raidlote e raid manual',async()=>{
      const start=(v)=>startMiningExpedition(db,{jid,pickaxeId:'madeira',key:key('blocked-'+v)})
      await db.query('INSERT INTO player_sleep(jid,ends_at) VALUES($1,EXTRACT(EPOCH FROM NOW())::bigint+300)',[jid])
      await assert.rejects(start('sleep'),/dormindo/)
      await db.query('DELETE FROM player_sleep WHERE jid=$1',[jid])
      await db.query('INSERT INTO player_carpinar(jid,ends_at) VALUES($1,EXTRACT(EPOCH FROM NOW())::bigint+300)',[jid])
      await assert.rejects(start('carp'),/carpindo/)
      await db.query('DELETE FROM player_carpinar WHERE jid=$1',[jid])
      await db.query("INSERT INTO raid_lote_jobs(jid,status) VALUES($1,'running')",[jid])
      await assert.rejects(start('lote'),/Raidlote/)
      await db.query('DELETE FROM raid_lote_jobs WHERE jid=$1',[jid])
      await db.query("INSERT INTO trevo_games(jid,game_type,state) VALUES($1,'raid',jsonb_build_object('status','active','players',jsonb_build_object($1::text,true)))",[jid])
      await assert.rejects(start('raid'),/Raid/)
      await db.query('DELETE FROM trevo_games WHERE jid=$1',[jid])
      assert.equal(await uses('madeira'),4)
    })

    await t.test('início único, guard recíproco e ausência de resgate antecipado',async()=>{
      const input={jid,pickaxeId:'madeira',key:key('start-wood')}
      const first=await startMiningExpedition(db,input)
      assert.equal(first.usesAfter,3)
      assert.equal(await uses('madeira'),3)
      assert.equal((await startMiningExpedition(db,input)).repeated,true)
      assert.equal(await uses('madeira'),3)
      await assert.rejects(startMiningExpedition(db,{...input,key:key('start-second')}),/anterior/)
      await assert.rejects(run(c=>assertNoActiveMining(c,jid)),/minerando/)
      const early=await claimMiningExpedition(db,jid)
      assert.equal(early.status,'running')
      assert.equal(await getCash(),28000)
    })

    await t.test('um resgate real paga R$ 800, XP base e no máximo uma pedra',async()=>{
      // Simulação de passagem de 4 horas APENAS nos dados efêmeros de homologação.
      await db.query("UPDATE mining_expeditions SET started_at=EXTRACT(EPOCH FROM NOW())::bigint-14410,ends_at=EXTRACT(EPOCH FROM NOW())::bigint-10 WHERE jid=$1 AND status='running'",[jid])
      const claimed=await claimMiningExpedition(db,jid)
      assert.equal(claimed.status,'claimed')
      assert.equal(claimed.cash,800)
      assert.equal(claimed.awardedXp,250)
      assert.equal(await getCash(),28800)
      assert.equal((await db.query('SELECT exp FROM users WHERE jid=$1',[jid])).rows[0].exp,250)
      assert.equal(await committed(),1)
      assert.equal((await claimMiningExpedition(db,jid)).status,'none')
      assert.equal(await getCash(),28800)
      assert.equal((await db.query('SELECT exp FROM users WHERE jid=$1',[jid])).rows[0].exp,250)
      const stones=Number((await db.query('SELECT COALESCE(SUM(quantity),0)::int AS n FROM inventories WHERE jid=$1',[jid])).rows[0].n)
      assert.equal(stones,claimed.stoneId?1:0)
      assert.ok(stones===0||stones===1)
    })

    await t.test('reparo proporcional e replay não cobra novamente',async()=>{
      const input={jid,pickaxeId:'madeira',key:key('repair-wood')}
      const repaired=await repairMiningPickaxe(db,input)
      assert.equal(repaired.costCash,300)
      assert.equal(await getCash(),28500)
      assert.equal(await uses('madeira'),4)
      assert.equal((await repairMiningPickaxe(db,input)).repeated,true)
      assert.equal(await getCash(),28500)
    })

    await t.test('cancelamento não premia nem devolve resistência',async()=>{
      await startMiningExpedition(db,{jid,pickaxeId:'madeira',key:key('start-cancel')})
      assert.equal(await uses('madeira'),3)
      assert.equal((await cancelMiningExpedition(db,jid)).status,'cancelled')
      assert.equal((await claimMiningExpedition(db,jid)).status,'none')
      assert.equal(await getCash(),28500)
      assert.equal(await uses('madeira'),3)
    })

    await t.test('concessão de Ouro Cerco / Diamante Evento sem venda',async()=>{
      const first=await grantMiningPickaxeReward(db,{jid,pickaxeId:'ouro',source:'cerco',key:key('cerco-gold')})
      assert.equal(first.status,'granted')
      assert.equal((await grantMiningPickaxeReward(db,{jid,pickaxeId:'ouro',source:'cerco',key:key('cerco-gold')})).repeated,true)
      assert.equal((await grantMiningPickaxeReward(db,{jid,pickaxeId:'ouro',source:'cerco',key:key('cerco-new')})).status,'already_owned')
      const diamond=await grantMiningPickaxeReward(db,{jid,pickaxeId:'diamante',source:'evento_inaugural',key:key('event-diamond')})
      assert.equal(diamond.status,'granted')
      await assert.rejects(grantMiningPickaxeReward(db,{jid,pickaxeId:'diamante',source:'cerco',key:key('wrong-source')}),/Origem/)
      assert.equal(await uses('ouro'),7)
      assert.equal(await uses('diamante'),8)
    })

    await t.test('concorrência de dois inícios permite uma expedição, não duas',async()=>{
      const reqs=[key('concurrent1'),key('concurrent2')].map(k=>
        startMiningExpedition(db,{jid,pickaxeId:'madeira',key:k}))
      const both=await Promise.allSettled(reqs)
      assert.equal(both.filter(x=>x.status==='fulfilled').length,1)
      assert.equal(both.filter(x=>x.status==='rejected').length,1)
      assert.equal(await uses('madeira'),2)
      assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM mining_expeditions WHERE jid=$1 AND status='running'",[jid])).rows[0].n,1)
    })
  }finally{await db.end()}
})
