import test from 'node:test'
import assert from 'node:assert/strict'
import {reserveNextRaidLoteAttempt} from '../src/neon/raid-lote-store.js'

// Isolamento do banco: não acessa Postgres real nem credita recompensas.
function fakeDb({cash=5000,bank=0,owned=0,expired=false,attemptId=null,activity=null}={}){
  const jid='11999999999@s.whatsapp.net'
  const calls=[]
  const job={id:'11111111-1111-4111-8111-111111111111',jid,status:'queued',
    started:0,won_count:0,requested:1000000,cancel_requested:false,
    level:10,key_price:2000,billing_mode:'per_attempt',duration_hours:4,
    next_attempt_at:new Date(Date.now()-1000),
    session_ends_at:new Date(Date.now()+(expired?-1000:3600000)),
    current_attempt_id:attemptId}
  let walletDebit=0,fees=0,attempts=0
  const db={connect:async()=>({release(){},async query(sql,params=[]){
    calls.push({sql,params})
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]}
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]}
    if(sql.includes('SELECT jid FROM raid_lote_jobs'))return {rows:[{jid}]}
    if(sql.includes('SELECT * FROM raid_lote_jobs WHERE id=$1'))return {rows:[job]}
    if(sql.includes('SELECT 1 FROM trevo_games'))return {rows:[]}
    if(sql.includes('FROM player_sleep'))return {rows:[{activity}]}
    if(sql.includes('SELECT quantity FROM inventories'))return {rows:owned?[{quantity:owned}]:[]}
    if(sql.includes('SELECT cash,bank FROM wallets'))return {rows:[{cash,bank}]}
    if(sql.includes('UPDATE inventories SET quantity=quantity-1'))return {rows:[{quantity:owned-1}],rowCount:1}
    if(sql.includes('UPDATE wallets SET cash=')){walletDebit+=params[0]+params[1];return {rows:[]}}
    if(sql.includes('UPDATE raid_lote_municipality')){fees+=params[0];return {rows:[]}}
    if(sql.includes('INSERT INTO raid_lote_attempts')){attempts++;return {rows:[]}}
    if(sql.includes('INSERT INTO raid_lote_notice_outbox'))return {rows:[]}
    if(sql.includes('INSERT INTO transactions')||sql.includes('UPDATE raid_lote_jobs'))return {rows:[]}
    throw Error('SQL não simulado: '+sql.slice(0,95))
  }})}
  return {db,job,calls,get walletDebit(){return walletDebit},get fees(){return fees},get attempts(){return attempts}}
}

test('V2 cobra uma única Raid ao reservar; não vende três tentativas antecipadas',async()=>{
  const f=fakeDb()
  const result=await reserveNextRaidLoteAttempt(f.db,f.job.id,{getCatalog:()=>[{level:10,keyId:'chave_raid_10'}]})
  assert.equal(result.status,'reserved')
  assert.equal(result.attempt.seq,1)
  assert.equal(f.walletDebit,2200)
  assert.equal(f.fees,200)
  assert.equal(f.attempts,1)
  assert.equal(f.calls.filter(x=>x.sql.includes('INSERT INTO transactions')).length,1)
  assert.ok(f.calls.some(x=>x.sql.includes("next_attempt_at=CASE WHEN billing_mode='per_attempt' THEN NOW()")))
})
test('V2 usa chave do inventário sem recomprar, mas cobra taxa de automação',async()=>{
  const f=fakeDb({cash:500,owned:2})
  const result=await reserveNextRaidLoteAttempt(f.db,f.job.id,{getCatalog:()=>[{level:10,keyId:'chave_raid_10'}]})
  assert.equal(result.status,'reserved')
  assert.equal(f.walletDebit,200)
  assert.equal(f.fees,200)
  assert.equal(f.attempts,1)
  assert.ok(f.calls.some(x=>x.sql.includes('UPDATE inventories SET quantity=quantity-1')))
})
test('V2 sem saldo encerra sem iniciar nem cobrar tentativa',async()=>{
  const f=fakeDb({cash:50})
  const result=await reserveNextRaidLoteAttempt(f.db,f.job.id,{getCatalog:()=>[{level:10,keyId:'chave_raid_10'}]})
  assert.equal(result.status,'funds_exhausted')
  assert.equal(f.walletDebit,0)
  assert.equal(f.attempts,0)
  assert.ok(f.calls.some(x=>x.sql.includes("status='funds_exhausted'")))
})
test('V2 após prazo encerra sem cobrar e sem reservar batalha',async()=>{
  const f=fakeDb({expired:true})
  const result=await reserveNextRaidLoteAttempt(f.db,f.job.id,{getCatalog:()=>[{level:10,keyId:'chave_raid_10'}]})
  assert.equal(result.status,'expired')
  assert.equal(f.walletDebit,0)
  assert.equal(f.attempts,0)
  assert.ok(f.calls.some(x=>x.sql.includes("status='completed'")))
})

test('V2 não reserva nem cobra nova tentativa se sono ou Carpinar antigo coexistir',async()=>{
 for(const activity of ['sleep','carpinar']){
  const f=fakeDb({activity})
  const result=await reserveNextRaidLoteAttempt(f.db,f.job.id,{getCatalog:()=>[{level:10,keyId:'chave_raid_10'}]})
  assert.equal(result.status,'player_busy')
  assert.equal(f.walletDebit,0);assert.equal(f.attempts,0);assert.equal(f.fees,0)
 }
})
