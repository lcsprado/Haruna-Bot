import test from 'node:test'
import assert from 'node:assert/strict'
import {startRaidBatchAttempt,settleRaidBatchAttempt} from '../src/neon/raid-batch-ledger.js'

test('PostgreSQL 16: transactionally charge exactly one fee, one treasury entry, one key-price reference and discounted rewards',async t=>{
 if(!process.env.DATABASE_URL){t.skip('Disposable CI PostgreSQL service required');return}
 const {Client}=await import('pg')
 const c=new Client({connectionString:process.env.DATABASE_URL})
 await c.connect()
 const jid='dummy-batch-test@s.whatsapp.net'
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL lock_timeout='4s'")
  await c.query("CREATE TEMP TABLE wallets(jid text primary key,cash bigint,bank bigint) ON COMMIT DROP")
  await c.query("CREATE TEMP TABLE raid_batch_jobs(id bigint primary key,jid text,level integer,requested_count integer,started_count integer,completed_count integer,status text,cancel_requested boolean,updated_at_ms bigint,last_start_ms bigint,last_end_ms bigint,total_cash bigint,total_xp bigint,total_pet_xp bigint,total_mastery_xp bigint,total_fragments bigint,total_fee_spend bigint default 0,total_key_spend bigint default 0,finish_reason text) ON COMMIT DROP")
  await c.query("CREATE TEMP TABLE raid_batch_attempts(job_id bigint,ordinal integer,status text,started_at_ms bigint,finished_at_ms bigint,fee_paid integer,key_price integer,key_bought boolean default false,cash bigint,xp bigint,pet_xp bigint,mastery_xp bigint,fragments bigint,reason text,rounds integer,PRIMARY KEY(job_id,ordinal)) ON COMMIT DROP")
  await c.query("CREATE TEMP TABLE transactions(from_jid text,to_jid text,amount bigint,type text,note text) ON COMMIT DROP")
  await c.query("CREATE TEMP TABLE raid_batch_treasury(job_id bigint,ordinal integer,amount bigint,recorded_at_ms bigint,PRIMARY KEY(job_id,ordinal)) ON COMMIT DROP")
  await c.query("INSERT INTO wallets VALUES($1,100000,500000)",[jid])
  await c.query("INSERT INTO raid_batch_jobs(id,jid,level,requested_count,started_count,completed_count,status,cancel_requested,updated_at_ms,total_cash,total_xp,total_pet_xp,total_mastery_xp,total_fragments) VALUES(1,$1,75,2,0,0,'queued',false,0,0,0,0,0,0)",[jid])
  const cfg={level:75,keyPrice:480000}
  const s={host:jid,players:{[jid]:{alive:true}},raidBatch:{jobId:1,ordinal:1},round:16}
  const first=await startRaidBatchAttempt(c,s,cfg)
  assert.equal(first.fee,48000)
  const wallet1=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1',[jid])).rows[0]
  assert.equal(Number(wallet1.cash),52000)
  assert.equal(Number(wallet1.bank),500000)
  const city=(await c.query('SELECT amount FROM raid_batch_treasury')).rows
  assert.deepEqual(city.map(x=>Number(x.amount)),[48000])
  const debit=(await c.query("SELECT type,to_jid,amount FROM transactions WHERE type='raid_batch_fee'")).rows
  assert.equal(debit.length,1)
  assert.equal(debit[0].to_jid,'prefeitura_alpha')
  assert.equal(Number(debit[0].amount),48000)
  await assert.rejects(()=>startRaidBatchAttempt(c,s,cfg),/Lote suspenso|tentativa repetida|Tentativa já faturada/)
  const rewards=[{jid,cash:506880,awardedExp:17400,petXp:1680,
    masteryReport:{earned:45},material:{qty:4}}]
  const won=await settleRaidBatchAttempt(c,s,true,'victory',rewards)
  assert.equal(won.status,'queued')
  assert.equal(won.completed,1)
  await assert.rejects(()=>settleRaidBatchAttempt(c,s,true,'victory',rewards),/Tentativa de Raid já liquidada/)
  const after=(await c.query('SELECT * FROM raid_batch_jobs WHERE id=1')).rows[0]
  assert.equal(after.status,'queued')
  assert.equal(Number(after.total_cash),506880)
  assert.equal(Number(after.total_xp),17400)
  assert.equal(Number(after.total_mastery_xp),45)
  assert.equal(Number(after.total_fragments),4)
  assert.equal(Number(after.total_fee_spend),48000)
  assert.equal(Number(after.total_key_spend),0)
  assert.equal(Number((await c.query('SELECT count(*) AS count FROM raid_batch_attempts WHERE status=$1',['won'])).rows[0].count),1)

  // Second attempt is paid once, lost normally and ends the batch without cash/XP.
  s.raidBatch.ordinal=2
  s.round=201
  const second=await startRaidBatchAttempt(c,s,cfg)
  assert.equal(second.fee,48000)
  const lost=await settleRaidBatchAttempt(c,s,false,'party_wipe')
  assert.equal(lost.status,'failed')
  assert.equal(lost.completed,1)
  const final=(await c.query('SELECT * FROM raid_batch_jobs WHERE id=1')).rows[0]
  assert.equal(final.status,'failed')
  assert.equal(Number(final.started_count),2)
  assert.equal(Number(final.completed_count),1)
  assert.equal(Number(final.total_cash),506880)
  assert.equal(Number(final.total_fee_spend),96000)
  assert.equal(Number((await c.query("SELECT COUNT(*) AS total FROM raid_batch_treasury")).rows[0].total),2)
  const onlyFee=(await c.query("SELECT SUM(amount) AS total FROM transactions WHERE type='raid_batch_fee'")).rows[0]
  assert.equal(Number(onlyFee.total),96000)
  await c.query('ROLLBACK')
 }finally{await c.end()}
})

test('PostgreSQL 16: 10 attempts in rolling 24h block any additional fee, even across jobs',async t=>{
 if(!process.env.DATABASE_URL){t.skip('Disposable CI PostgreSQL service required');return}
 const {Client}=await import('pg')
 const c=new Client({connectionString:process.env.DATABASE_URL})
 await c.connect()
 const jid='limit-test@s.whatsapp.net'
 try{
  await c.query('BEGIN')
  await c.query("CREATE TEMP TABLE wallets(jid text primary key,cash bigint,bank bigint) ON COMMIT DROP")
  await c.query("CREATE TEMP TABLE raid_batch_jobs(id bigint primary key,jid text,level integer,requested_count integer,started_count integer,completed_count integer,status text,cancel_requested boolean,updated_at_ms bigint,last_start_ms bigint,total_fee_spend bigint default 0,total_key_spend bigint default 0) ON COMMIT DROP")
  await c.query("CREATE TEMP TABLE raid_batch_attempts(job_id bigint,ordinal integer,status text,started_at_ms bigint,fee_paid integer,key_price integer,key_bought boolean default false,PRIMARY KEY(job_id,ordinal)) ON COMMIT DROP")
  await c.query("INSERT INTO wallets VALUES($1,1000000,1000000)",[jid])
  await c.query("INSERT INTO raid_batch_jobs(id,jid,level,requested_count,started_count,completed_count,status,cancel_requested,updated_at_ms,last_start_ms) VALUES(1,$1,75,10,10,10,'completed',false,0,0),(2,$1,75,1,0,0,'queued',false,0,0)",[jid])
  for(let i=1;i<=10;i++)await c.query("INSERT INTO raid_batch_attempts(job_id,ordinal,status,started_at_ms,fee_paid,key_price) VALUES(1,$1,'won',$2,48000,480000)",[i,Date.now()-70000])
  await assert.rejects(()=>startRaidBatchAttempt(c,{host:jid,players:{[jid]:{}},raidBatch:{jobId:2,ordinal:1}},{level:75,keyPrice:480000}),/Limite de 10/)
  assert.equal(Number((await c.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0].cash),1000000)
  await c.query('ROLLBACK')
 }finally{await c.end()}
})
