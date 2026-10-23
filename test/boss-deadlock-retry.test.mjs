import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {retryBossDeadlock} from '../src/neon/boss-deadlock-retry.js'

const deadlock=()=>Object.assign(new Error('deadlock detected'),{code:'40P01'})
test('retryBossDeadlock retries a rolled-back transaction and returns its sole committed result',async()=>{
 let attempts=0,committed=0,waits=[]
 const value=await retryBossDeadlock(async()=>{
  attempts++
  if(attempts<=2)throw deadlock()
  committed++
  return {damage:415}
 },{sleep:async ms=>{waits.push(ms)},random:()=>0})
 assert.equal(attempts,3)
 assert.equal(committed,1)
 assert.deepEqual(value,{damage:415})
 assert.deepEqual(waits,[150,300])
})
test('retryBossDeadlock never retries ordinary errors',async()=>{
 let attempts=0
 await assert.rejects(
  retryBossDeadlock(async()=>{attempts++;throw Object.assign(new Error('insufficient HP'),{code:'P0001'})},{sleep:async()=>{}}),
  /insufficient HP/
 )
 assert.equal(attempts,1)
})
test('retryBossDeadlock bounds persistent deadlocks',async()=>{
 let attempts=0
 await assert.rejects(retryBossDeadlock(async()=>{attempts++;throw deadlock()},{maxRetries:3,sleep:async()=>{},random:()=>0}),{code:'40P01'})
 assert.equal(attempts,4)
})
test('Boss attack retry wraps the complete transaction; auto-runner resumes if exhausted',()=>{
 const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(games,/return retryBossDeadlock\(\(\)=>tx\(async c=>\{/)
 assert.match(games,/\}\),\{onRetry:/)
 assert.match(index,/if\(err\?\.code!=='40P01'\) throw err/)
 assert.match(index,/deadlock persistente após retries; mantendo sessão ativa/)
})
