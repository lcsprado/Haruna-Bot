import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {businessIntervalGross} from '../src/neon/business-profit.js'

process.env.DATABASE_URL ||= 'postgresql://test@127.0.0.1:1/no_network'
const {db}=await import('../src/neon/db.js')
const {buyBusiness,upgradeBusiness,collectBusinesses}=await import('../src/neon/progression.js')

const JID='business-test@s.whatsapp.net'
const start=1_792_500_000

async function withLedger(state,run){
  const originalQuery=db.query,originalConnect=db.connect,originalNow=Date.now
  let clock=start,savepoint
  Date.now=()=>clock*1000
  db.query=async()=>({rows:[],rowCount:0}) // ensureUser against the isolated ledger
  const client={release(){},async query(sql,args=[]){
    const q=sql.replace(/\s+/g,' ').trim()
    if(q==='BEGIN'){savepoint=structuredClone(state);return {rows:[]}}
    if(q==='COMMIT'){savepoint=null;return {rows:[]}}
    if(q==='ROLLBACK'){Object.assign(state,savepoint);savepoint=null;return {rows:[]}}
    if(q.startsWith('SELECT 1 FROM user_businesses')) return {rows:state.business?[{one:1}]:[]}
    if(q.startsWith('SELECT * FROM user_businesses WHERE jid=$1 AND business_id=$2')) return {rows:state.business?[structuredClone(state.business)]:[]}
    if(q.startsWith('SELECT * FROM user_businesses WHERE jid=$1 FOR UPDATE')) return {rows:state.business?[structuredClone(state.business)]:[]}
    if(q.startsWith('SELECT cash FROM wallets')) return {rows:[{cash:state.cash}]}
    if(q.startsWith('SELECT MAX(created_at)')) return {rows:[{last_claim:Math.max(0,...state.transactions.filter(t=>t.type==='business_profit').map(t=>t.at))}]}
    if(q.startsWith('SELECT value FROM trevo_settings')) return {rows:[]}
    if(q.startsWith('UPDATE wallets SET cash=cash-$1')){state.cash-=args[0];return {rows:[]}}
    if(q.startsWith('UPDATE wallets SET cash=cash+$1')){state.cash+=args[0];return {rows:[]}}
    if(q.startsWith('INSERT INTO user_businesses')){
      state.business={id:1,jid:JID,business_id:args[1],price_paid:args[2],level:1,last_collected_at:args[3],accrued_gross:0}
      return {rows:[]}
    }
    if(q.startsWith('UPDATE user_businesses SET level=$1')){
      state.business.level=args[0]
      state.business.accrued_gross+=args[1]
      state.business.last_collected_at=args[2]
      return {rows:[]}
    }
    if(q.startsWith('UPDATE user_businesses SET last_collected_at=$1')){
      state.business.last_collected_at=args[0]
      state.business.accrued_gross=0
      return {rows:[]}
    }
    if(q.startsWith('INSERT INTO transactions')){
      if(state.failTransactions) throw new Error('ledger unavailable')
      const type=['business_purchase','business_upgrade','business_profit','income_tax'].find(t=>q.includes("'"+t+"'"))
      state.transactions.push({type,amount:args[1],at:clock})
      return {rows:[]}
    }
    throw new Error('Unexpected query: '+q)
  }}
  db.connect=async()=>client
  try{return await run({advance:seconds=>{clock+=seconds}})}
  finally{db.query=originalQuery;db.connect=originalConnect;Date.now=originalNow}
}

test('purchase is charged once and survives a repeated request',async()=>{
  const state={cash:10_000_000,business:null,transactions:[]}
  await withLedger(state,async()=>{
    await buyBusiness(JID,'hotel')
    await assert.rejects(buyBusiness(JID,'hotel'),/já possui/)
  })
  assert.equal(state.cash,5_500_000)
  assert.equal(state.business.business_id,'hotel')
  assert.equal(state.transactions.filter(t=>t.type==='business_purchase').length,1)
})

test('upgrade preserves pre-upgrade profit and replay cannot buy another level',async()=>{
  const state={cash:10_000_000,business:{id:1,jid:JID,business_id:'hotel',level:1,last_collected_at:start-3600,accrued_gross:0},transactions:[]}
  await withLedger(state,async({advance})=>{
    await upgradeBusiness(JID,'hotel',2)
    assert.equal(state.business.accrued_gross,55_000)
    await assert.rejects(upgradeBusiness(JID,'hotel',2),/nível final/)
    assert.equal(state.cash,9_100_000)
    advance(3600)
    const payout=await collectBusinesses(JID)
    assert.equal(payout.gross,123_750)
    assert.equal(payout.tax,12_375)
    assert.equal(payout.total,111_375)
    assert.equal(state.business.accrued_gross,0)
  })
  await withLedger(state,async()=>{
    const repeated=await collectBusinesses(JID)
    assert.equal(repeated.total,0)
    assert.ok(repeated.cooldownRemaining>0)
  })
  assert.equal(state.cash,9_211_375)
  assert.equal(state.transactions.filter(t=>t.type==='business_profit').length,1)
})

test('failed ledger write rolls back wallet, level and accrued profit',async()=>{
  const state={cash:10_000_000,business:{id:1,jid:JID,business_id:'hotel',level:1,last_collected_at:start-3600,accrued_gross:0},transactions:[],failTransactions:true}
  await withLedger(state,async()=>await assert.rejects(upgradeBusiness(JID,'hotel',2),/ledger unavailable/))
  assert.equal(state.cash,10_000_000)
  assert.equal(state.business.level,1)
  assert.equal(state.business.accrued_gross,0)
})

test('failed collection rolls back cash, timestamp and pending profit',async()=>{
  const state={cash:10_000_000,business:{id:1,jid:JID,business_id:'hotel',level:2,last_collected_at:start-3600,accrued_gross:55_000},transactions:[],failTransactions:true}
  await withLedger(state,async()=>await assert.rejects(collectBusinesses(JID),/ledger unavailable/))
  assert.equal(state.cash,10_000_000)
  assert.equal(state.business.last_collected_at,start-3600)
  assert.equal(state.business.accrued_gross,55_000)
})

test('web upgrade sends a fixed target level through the API',()=>{
  const ui=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
  const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.match(ui,/data-business-target-level/)
  assert.match(ui,/targetLevel:Number\(x\.dataset\.businessTargetLevel\)/)
  assert.match(api,/upgradeBusiness\(jid,String\(body\.id\|\|body\.input\|\|''\),body\.targetLevel\)/)
})

test('old level profit is capped before upgrade',()=>{
  const hotel={profitHour:55_000,capacityHours:16}
  assert.equal(businessIntervalGross(hotel,{level:1,last_collected_at:start-24*3600},start),880_000)
})
