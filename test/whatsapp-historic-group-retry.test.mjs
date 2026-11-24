import test from 'node:test'
import assert from 'node:assert/strict'
import {createOutboundRetryStore} from '../src/neon/whatsapp-outbound-retry-store.js'
import {createDurableOutboundRetry} from '../src/neon/whatsapp-outbound-durable-retry.js'

test('retentativa de grupo recupera apenas mensagens recentes',async()=>{
 let now=1000000
 const memory=createOutboundRetryStore({now:()=>now})
 const queries=[]
 const db={
   query:async(sql,params=[])=>{
     queries.push({sql,params})
     if(sql.includes('SELECT payload'))return {rows:[{payload:{conversation:'teste'}}]}
     return {rows:[]}
   }
 }
 const store=createDurableOutboundRetry({db,memory})
 await store.init()
 const groupKey={id:'msg_antiga',remoteJid:'120363000000001@g.us'}
 const result=await store.lookup(groupKey)
 assert.equal(result.source,'database')
 assert.equal(queries.at(-1).params[1],true)
 assert.equal(queries.at(-1).params[2],groupKey.remoteJid)
 assert.match(queries.at(-1).sql,/created_at\s*>=\s*NOW\(\)\s*-\s*INTERVAL '10 minutes'/)
 const privateKey={id:'msg_privada',remoteJid:'5511999999999@s.whatsapp.net'}
 await store.lookup(privateKey)
 assert.equal(queries.at(-1).params[1],false)
})

test('cache local obedece a janela de 10 minutos do grupo',()=>{
 let now=1000000
 const memory=createOutboundRetryStore({now:()=>now})
 const key={id:'m1'}
 memory.remember({key,message:{conversation:'teste'}})
 assert.deepEqual(memory.getMessage(key,{maxAgeMs:10*60*1000}),{conversation:'teste'})
 now+=11*60*1000
 assert.equal(memory.getMessage(key,{maxAgeMs:10*60*1000}),undefined)
 assert.deepEqual(memory.getMessage(key),{conversation:'teste'})
})
