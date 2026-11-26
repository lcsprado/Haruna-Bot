import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {inboundRejection} from '../src/neon/whatsapp-inbound-freshness.js'
const now=1800000000000
const message=(age,fromMe=false)=>({key:{id:'test',fromMe},message:{conversation:'!ping'},messageTimestamp:(now-age)/1000})
test('stale history is rejected without entering the RPG queue',()=>{
 assert.equal(inboundRejection(message(600000),'append',now),'staleAppend')
 assert.equal(inboundRejection(message(600000),'notify',now),'staleNotify')
 assert.equal(inboundRejection(message(46000),'append',now),'staleAppend')
 assert.equal(inboundRejection(message(-61000),'notify',now),'staleNotify')
})
test('fresh commands and short offline recovery continue unchanged',()=>{
 assert.equal(inboundRejection(message(0),'notify',now),null)
 assert.equal(inboundRejection(message(30000),'append',now),null)
 assert.equal(inboundRejection(message(120000),'notify',now),null)
 assert.equal(inboundRejection(message(0,true),'notify',now),'selfMessage')
 assert.equal(inboundRejection({key:{id:'test'}},'notify',now),'emptyMessage')
})
test('explicitly disable history sync while preserving existing freshness guard and auth',()=>{
 const s=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.ok(s.includes('shouldSyncHistoryMessage:()=>false'))
 assert.ok(s.includes("if(requestId){tally('onDemandHistory');return}"))
 assert.ok(s.includes('groupIncomingByPlayer(fresh)'))
 assert.ok(s.includes("if(!ts || Math.abs(receivedAt-ts)>45000)"))
 assert.ok(s.includes('makeCacheableSignalKeyStore(state.keys'))
})
