import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const store=readFileSync(new URL('../src/neon/raid-lote-store.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const source=store.slice(store.indexOf('export async function startTimedRaidLoteSession('),store.indexOf('export async function getRaidLoteJob(')).replace('export async','async')
function fixture(old=null){
  const writes=[]
  const c={query:async(sql,args)=>{
    if(sql.includes('SELECT * FROM raid_lote_jobs WHERE jid'))return {rows:old?[old]:[]}
    if(sql.includes('SELECT level FROM users'))return {rows:[{level:100}]}
    if(sql.includes('SELECT hp FROM stats'))return {rows:[{hp:100}]}
    if(sql.includes('COUNT(*)'))return {rows:[{n:3}]}
    if(sql.includes('SELECT cash,bank'))return {rows:[{cash:100000,bank:0}]}
    if(sql.includes('INSERT INTO raid_lote_jobs'))writes.push({sql,args})
    return {rows:[]}
  }}
  const start=vm.runInNewContext(source+'\nstartTimedRaidLoteSession',{
    validateRequestKey:()=>{},classesOnlyRebootEnabled:()=>true,
    raidLoteDurationPlan:hours=>({hours}),assertRaid70V2Start:()=>{},
    inTransaction:async(db,fn)=>fn(c),RAID_LOTE_V1:{minimumManualWins:3},
    RAID_LOTE_V2_MAX_ATTEMPTS:1000000,raidLoteQuote:()=>({totalPrice:100}),
    crypto:{randomUUID:()=> 'job'}
  })
  return {writes,run:(opts={})=>start({},{
    jid:'player',level:50,durationHours:8,requestKey:'valid-key',confirmed:true,...opts
  },{getCatalog:()=>[{level:50,keyId:'key',keyPrice:100}]})}
}
test('continuous session persists explicit false and default true',async()=>{
  for(const usePet of [false,true,undefined]){
    const f=fixture()
    const result=await f.run(usePet===undefined?{}:{usePet})
    assert.equal(f.writes.length,1)
    assert.match(f.writes[0].sql,/next_attempt_at,use_pet/)
    assert.equal(f.writes[0].args[7],usePet!==false)
    assert.equal(result.job.use_pet,usePet!==false)
  }
})
test('duplicate confirmations cannot change the persisted mode',async()=>{
  const f=fixture({billing_mode:'per_attempt',level:50,duration_hours:8,use_pet:false})
  assert.equal((await f.run({usePet:false})).alreadyPurchased,true)
  await assert.rejects(f.run({usePet:true}),/parâmetros divergentes/)
  assert.equal(f.writes.length,0)
})
test('migration and combat use durable job mode, not transient command options',()=>{
  assert.match(store,/ADD COLUMN IF NOT EXISTS use_pet BOOLEAN NOT NULL DEFAULT TRUE/)
  assert.match(games,/j\.auction_pass_manual_rewards,j\.use_pet/)
  assert.match(games,/row\.use_pet===false\?\{usePet:false\}/)
  assert.match(wa,/level,hours:durationPlan\.hours,usePet,/)
  assert.match(wa,/usePet:flow\.data\?\.usePet!==false/)
  assert.match(wa,/job\.use_pet===false/)
})
