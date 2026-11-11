import test from 'node:test'
import assert from 'node:assert/strict'

test('Postgres 16: feature flag off, schema on, manual victory gate, 24h capacity, cancel without charge',async t=>{
 if(!process.env.DATABASE_URL){t.skip('Disposable CI database required');return}
 const {db}=await import('../src/neon/db.js')
 const {initRaidBatch,queueRaidBatch,cancelRaidBatch,raidBatchStatus,raidBatchHistory}=await import('../src/neon/raid-batch.js')
 const oldFlag=process.env.ALPHA_RAID_BATCH_ENABLED
 const jid='batch-schema-test@s.whatsapp.net'
 try{
  process.env.ALPHA_RAID_BATCH_ENABLED='0'
  assert.equal(await initRaidBatch(),false)
  process.env.ALPHA_RAID_BATCH_ENABLED='1'
  assert.equal(await initRaidBatch(),true)
  const names=(await db.query("SELECT to_regclass('public.raid_batch_jobs') AS jobs,to_regclass('public.raid_batch_attempts') AS attempts,to_regclass('public.raid_batch_treasury') AS city")).rows[0]
  assert.equal(names.jobs,'raid_batch_jobs')
  assert.equal(names.attempts,'raid_batch_attempts')
  assert.equal(names.city,'raid_batch_treasury')
  await db.query("CREATE TABLE IF NOT EXISTS users(jid text primary key,level integer,push_name text)")
  await db.query("CREATE TABLE IF NOT EXISTS stats(jid text primary key,hp integer)")
  await db.query("CREATE TABLE IF NOT EXISTS wallets(jid text primary key,cash bigint,bank bigint)")
  await db.query("CREATE TABLE IF NOT EXISTS inventories(jid text,item_id text,quantity integer,PRIMARY KEY(jid,item_id))")
  await db.query("CREATE TABLE IF NOT EXISTS transactions(to_jid text,type text,note text)")
  await db.query("CREATE TABLE IF NOT EXISTS trevo_games(chat_jid text,game_type text,state jsonb)")
  await db.query("INSERT INTO users VALUES($1,500,'Testador')",[jid])
  await db.query("INSERT INTO stats VALUES($1,6500)",[jid])
  await db.query("INSERT INTO wallets VALUES($1,800000,0)",[jid])
  await db.query("INSERT INTO inventories VALUES($1,'chave_raid_75',2)",[jid])
  await assert.rejects(queueRaidBatch(jid,75,2),/Conquiste 3 vitórias/)
  for(let i=0;i<3;i++)await db.query("INSERT INTO transactions VALUES($1,'minigame','raid_75')",[jid])
  const plan=await queueRaidBatch(jid,75,2)
  assert.equal(plan.level,75)
  assert.equal(plan.plan.buyKeys,0)
  assert.equal(plan.plan.automationSpend,96000)
  assert.equal(Number((await raidBatchStatus(jid)).requested_count),2)
  await assert.rejects(queueRaidBatch(jid,75,2),/já possui lote/)
  const cancelled=await cancelRaidBatch(jid)
  assert.equal(cancelled.status,'cancelled')
  const history=await raidBatchHistory(jid)
  assert.equal(history[0].status,'cancelled')
  const balances=(await db.query('SELECT cash,bank FROM wallets WHERE jid=$1',[jid])).rows[0]
  assert.equal(Number(balances.cash),800000)
  assert.equal(Number((await db.query('SELECT count(*) AS total FROM raid_batch_treasury')).rows[0].total),0)
  assert.equal(Number((await db.query('SELECT count(*) AS total FROM raid_batch_attempts')).rows[0].total),0)
  const second=await queueRaidBatch(jid,75,10)
  assert.equal(second.plan.automationSpend,480000)
  assert.equal(second.plan.maximumSpend,4320000)
  const paused=await cancelRaidBatch(jid)
  assert.equal(paused.status,'cancelled')
 }finally{
  if(oldFlag===undefined)delete process.env.ALPHA_RAID_BATCH_ENABLED
  else process.env.ALPHA_RAID_BATCH_ENABLED=oldFlag
  await db.end()
 }
})
