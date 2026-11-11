import test from 'node:test'
import assert from 'node:assert/strict'
import {createRaidLoteWorker} from '../src/neon/raid-lote-worker.js'

test('feature flag off impede inicializacao do executor',()=>{
  const worker=createRaidLoteWorker({db:{query:async()=>({rows:[]})},
    startRaid:async()=>({}),raidRound:async()=>({})})
  assert.throws(()=>worker.start({enabled:false}),/flag OFF/)
  assert.throws(()=>worker.start({enabled:true,intervalMs:100}),/8 segundos/)
})
test('sem pacotes comprados o executor nao altera nada',async()=>{
  const queries=[]
  const worker=createRaidLoteWorker({db:{query:async(sql)=>{
    queries.push(sql)
    return {rows:[]}
  }},startRaid:async()=>{throw new Error('Nao deveria iniciar')},
  raidRound:async()=>{throw new Error('Nao deveria lutar')}})
  const result=await worker.tickOnce()
  assert.deepEqual(result,{checked:0,started:0,progressed:0,finished:0,paused:0,errors:0})
  assert.equal(queries.length,1)
  assert.match(queries[0],/SELECT id FROM raid_lote_jobs/)
})
test('segundo tick concorrente nao reinicia o mesmo worker',async()=>{
  let release
  const blocked=new Promise(resolve=>{release=resolve})
  let entered=false
  const worker=createRaidLoteWorker({db:{query:async()=>{entered=true;await blocked;return {rows:[]}}},
    startRaid:async()=>({}),raidRound:async()=>({})})
  const running=worker.tickOnce()
  while(!entered)await Promise.resolve()
  assert.deepEqual(await worker.tickOnce(),{status:'already_running'})
  release()
  assert.equal((await running).checked,0)
})
