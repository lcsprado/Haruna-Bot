import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {retryBossDeadlock} from '../src/neon/boss-deadlock-retry.js'

const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const start=source.indexOf('export async function attackBoss(')
const end=source.indexOf('\nexport ',start+30)
const boss=source.slice(start,end<0?undefined:end)

test('retry apenas em PostgreSQL 40P01, depois de rollback confirmado pelo chamador',async()=>{
 let attempts=0,rollbacks=0,commits=0
 const waits=[],warnings=[]
 const result=await retryBossDeadlock(async()=>{
  attempts++
  try{
   if(attempts<3)throw Object.assign(new Error('deadlock detected'),{code:'40P01'})
   commits++
   return 'OK'
  }catch(error){rollbacks++;throw error}
 },{maxRetries:5,sleep:async ms=>waits.push(ms),random:()=>0,onRetry:x=>warnings.push(x)})
 assert.equal(result,'OK')
 assert.equal(attempts,3)
 assert.equal(rollbacks,2)
 assert.equal(commits,1)
 assert.deepEqual(waits,[150,300])
 assert.deepEqual(warnings.map(x=>x.attempt),[1,2])
})

test('erro de negocio, limite ou autenticacao não pode ser reexecutado',async()=>{
 let attempts=0
 const error=Object.assign(new Error('saldo insuficiente'),{code:'P0001'})
 await assert.rejects(retryBossDeadlock(async()=>{attempts++;throw error},{
  sleep:async()=>{throw Error('não deveria aguardar')}
 }),err=>err===error)
 assert.equal(attempts,1)
})

test('deadlock permanente respeita numero máximo e propaga a ultima falha',async()=>{
 let attempts=0,waits=0
 await assert.rejects(retryBossDeadlock(async()=>{
  attempts++
  throw Object.assign(new Error('deadlock'),{code:'40P01'})
 },{maxRetries:2,sleep:async()=>waits++,random:()=>0}),/deadlock/)
 assert.equal(attempts,3)
 assert.equal(waits,2)
})

test('Boss Web envolve toda a transação no retry, sem duplicar confirmação externa',()=>{
 assert.ok(start>=0)
 assert.match(boss,/return retryBossDeadlock\(\(\)=>tx\(async c=>\{/)
 assert.match(boss,/\}\),\{onRetry:\(\{attempt,waitMs\}\)=>console\.warn/)
 assert.match(source,/await c\.query\('ROLLBACK'\)/)
 assert.equal((boss.match(/return retryBossDeadlock\(/g)||[]).length,1)
 assert.equal((source.match(/import \{retryBossDeadlock\}/g)||[]).length,1)
})
