import test from 'node:test'
import assert from 'node:assert/strict'
import {Client} from 'pg'
import {initRaidLoteTables,chargeRaidLoteStart} from '../src/neon/raid-lote-ledger.js'
import {raidLoteRoom,raidLoteFee} from '../src/neon/raid-lote-policy.js'

test('PostgreSQL isolated: only started attempts debit fee in same transaction as treasury receipt',async t=>{
 if(!process.env.DATABASE_URL){t.skip('Requires isolated disposable PostgreSQL');return}
 const client=new Client({connectionString:process.env.DATABASE_URL})
 await client.connect()
 const jid='test-player@example.test',batch='batch-20261110-postgres',level=75,price=480000
 const initialWallet=960000
 const state={loteMode:true,loteBatchId:batch,loteChat:raidLoteRoom(jid),
   host:jid,level,players:{[jid]:{jid,alive:true}}}
 try{
  await initRaidLoteTables(client)
  await client.query('CREATE TABLE IF NOT EXISTS wallets(jid text PRIMARY KEY,cash bigint,bank bigint,updated_at bigint)')
  await client.query('CREATE TABLE IF NOT EXISTS transactions(id bigserial PRIMARY KEY,from_jid text,to_jid text,amount bigint,type text,note text)')
  await client.query('DELETE FROM alpha_prefeitura_receipts')
  await client.query('DELETE FROM raid_lote_attempts')
  await client.query('DELETE FROM raid_lote_sessions')
  await client.query('DELETE FROM transactions')
  await client.query('DELETE FROM wallets')
  await client.query('INSERT INTO wallets(jid,cash,bank,updated_at) VALUES($1,$2,0,0)',[jid,initialWallet])
  await client.query("INSERT INTO raid_lote_sessions(jid,batch_id,name,level,requested,created_at_ms,updated_at_ms) VALUES($1,$2,'Test',75,10,1,1)",[jid,batch])
  const check=async()=>({
   wallet:Number((await client.query('SELECT cash+bank AS balance FROM wallets WHERE jid=$1',[jid])).rows[0].balance),
   attempts:Number((await client.query('SELECT COUNT(*) AS c FROM raid_lote_attempts')).rows[0].c),
   fees:Number((await client.query('SELECT COALESCE(SUM(amount),0) AS n FROM alpha_prefeitura_receipts')).rows[0].n),
   transactions:Number((await client.query("SELECT COUNT(*) AS c FROM transactions WHERE type='raid_lote_fee'")).rows[0].c)
  })
  const startMs=Date.now()
  await client.query('BEGIN')
  const first=await chargeRaidLoteStart(client,state,jid,price,startMs)
  assert.deepEqual(first,{attemptNo:1,fee:48000})
  assert.equal((await check()).wallet,initialWallet-48000)
  await client.query('ROLLBACK')
  assert.deepEqual(await check(),{wallet:initialWallet,attempts:0,fees:0,transactions:0},
   'Rollback must restore wallet, counter, receipts and transactions')
  await client.query('BEGIN')
  const successful=await chargeRaidLoteStart(client,state,jid,price,startMs)
  assert.equal(successful.attemptNo,1)
  await client.query('COMMIT')
  assert.deepEqual(await check(),{wallet:initialWallet-48000,attempts:1,fees:48000,transactions:1})
  const s=(await client.query('SELECT attempts_started,current_started_at_ms FROM raid_lote_sessions WHERE jid=$1',[jid])).rows[0]
  assert.equal(Number(s.attempts_started),1)
  assert.equal(Number(s.current_started_at_ms),startMs)
  await client.query('BEGIN')
  const second=await chargeRaidLoteStart(client,state,jid,price,startMs+10000)
  assert.equal(second.attemptNo,2)
  await client.query('COMMIT')
  assert.deepEqual(await check(),{wallet:initialWallet-96000,attempts:2,fees:96000,transactions:2})
  const entries=(await client.query('SELECT source_key FROM alpha_prefeitura_receipts ORDER BY source_key')).rows
  assert.equal(new Set(entries.map(r=>r.source_key)).size,2,'Unique treasury receipts per paid attempt')
  for(let i=1;i<=8;i++){
   await client.query(
    "INSERT INTO raid_lote_attempts(jid,batch_id,attempt_no,level,raid_started_at_ms,started_at_ms,fee,key_price,status) VALUES($1,$2,1,75,$3,$3,48000,480000,'won')",
     [jid,'old-batch-'+i,startMs-i*120000])
  }
  await client.query('BEGIN')
  await assert.rejects(chargeRaidLoteStart(client,state,jid,price,startMs+20000),
    /Limite de 10 Raids automáticas em 24 horas/)
  await client.query('ROLLBACK')
  assert.deepEqual(await check(),{wallet:initialWallet-96000,attempts:10,fees:96000,transactions:2})
  assert.equal(raidLoteFee(price),48000)
  await client.query("DELETE FROM raid_lote_attempts WHERE batch_id LIKE 'old-batch-%'")
  await client.query('UPDATE wallets SET cash=0,bank=0 WHERE jid=$1',[jid])
  await client.query('BEGIN')
  await assert.rejects(chargeRaidLoteStart(client,state,jid,price,startMs+30000),/Saldo insuficiente/)
  await client.query('ROLLBACK')
  assert.equal((await check()).wallet,0)
  assert.equal((await check()).fees,96000)
 }finally{
  try{await client.query('ROLLBACK')}catch{}
  await client.end()
 }
})
