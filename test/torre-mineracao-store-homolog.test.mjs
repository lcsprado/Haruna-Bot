import test from 'node:test'
import assert from 'node:assert/strict'
import {miningHomologationEnabled,assertMiningHomologation,miningActivityLock,assertNoActiveMining} from '../src/neon/torre-mineracao-activity.js'
import {initMiningStore} from '../src/neon/torre-mineracao-store.js'

const env=Object.freeze({
 ALPHA_MINING_MODE:'homologation',ALPHA_MINING_DB_CONFIRMED:'test-only',
 DATABASE_URL:'postgresql://fake:fake@localhost/alpha_homolog_mining'
})

test('mineração permanece desligada por padrão e recusa alpha_prod_v2',()=>{
 assert.equal(miningHomologationEnabled({}),false)
 assert.equal(miningHomologationEnabled({...env,DATABASE_URL:'postgresql://fake:fake@localhost/alpha_prod_v2'}),false)
 assert.equal(miningHomologationEnabled({...env,ALPHA_MINING_DB_CONFIRMED:'wrong'}),false)
 assert.equal(miningHomologationEnabled({...env,ALPHA_MINING_MODE:'production'}),false)
 assert.equal(miningHomologationEnabled(env),true)
 assert.doesNotThrow(()=>assertMiningHomologation(env))
 assert.throws(()=>assertMiningHomologation({...env,DATABASE_URL:'postgresql://fake:fake@localhost/alpha_prod_v2'}),/Mineração/)
})

test('migration só é emitida após confirmar banco exclusivo de teste',async()=>{
 const queries=[]
 const fakeDb={query:async(q)=>{queries.push(q);return {rows:[],rowCount:0}}}
 await assert.rejects(initMiningStore(fakeDb,{...env,DATABASE_URL:'postgresql://fake:fake@localhost/alpha_prod_v2'}),/Mineração/)
 assert.equal(queries.length,0)
 await initMiningStore(fakeDb,env)
 assert.equal(queries.length,1)
 assert.match(queries[0],/CREATE TABLE IF NOT EXISTS mining_pickaxes/)
 assert.match(queries[0],/CREATE TABLE IF NOT EXISTS mining_expeditions/)
 assert.match(queries[0],/CREATE UNIQUE INDEX IF NOT EXISTS mining_one_running_per_player/)
 assert.match(queries[0],/CREATE TABLE IF NOT EXISTS mining_action_receipts/)
})

test('lock de atividades usa a mesma chave de serialização do Raidlote',async()=>{
 const inputs=[]
 const c={query:async(sql,args)=>{inputs.push({sql,args});return {rows:[],rowCount:0}}}
 await miningActivityLock(c,'jogador-test')
 assert.match(inputs[0].sql,/pg_advisory_xact_lock/)
 assert.deepEqual(inputs[0].args,['raid-membership:jogador-test'])
})

test('no ambiente de produção o guard não consulta tabelas de mineração',async()=>{
 const original={...process.env}
 try{
   process.env.ALPHA_MINING_MODE='off'
   let hits=0
   await assertNoActiveMining({query:async()=>{hits++;throw new Error('não deveria consultar')}},'jogador-test',1000)
   assert.equal(hits,0)
 }finally{
   process.env.ALPHA_MINING_MODE=original.ALPHA_MINING_MODE
   if(original.ALPHA_MINING_MODE===undefined)delete process.env.ALPHA_MINING_MODE
 }
})

test('guard protege atividade simultânea apenas durante a expedição',async()=>{
 const original={...process.env}
 try{
   Object.assign(process.env,env)
   const used=[]
   const c={query:async(sql,args)=>{
      used.push(args)
      return {rows:[{ends_at:1500}],rowCount:1}
   }}
   await assert.rejects(assertNoActiveMining(c,'jogador-test',1000),/está minerando/)
   assert.equal(used.length,1)
   assert.deepEqual(used[0],['jogador-test',1000])
   await assertNoActiveMining({query:async()=>({rows:[],rowCount:0})},'jogador-test',1500)
 }finally{
   for(const key of Object.keys(env)){
     if(original[key]===undefined)delete process.env[key]
     else process.env[key]=original[key]
   }
 }
})
