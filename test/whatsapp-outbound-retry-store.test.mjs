import test from 'node:test'
import assert from 'node:assert/strict'
import {createOutboundRetryStore} from '../src/neon/whatsapp-outbound-retry-store.js'

test('retains original outbound content for Baileys decryption retry',()=>{
  let clock=1000
  const store=createOutboundRetryStore({maxMessages:2,ttlMs:2000,now:()=>clock})
  const first={key:{id:'m1'},message:{conversation:'Primeira mensagem'}}
  assert.equal(store.remember(first),true)
  assert.deepEqual(store.getMessage({id:'m1'}),first.message)
  assert.equal(store.getMessage({id:'unknown'}),undefined)
  assert.equal(store.remember({key:{id:'empty'},message:null}),false)
  clock=1500
  store.remember({key:{id:'m2'},message:{conversation:'Segunda'}})
  store.remember({key:{id:'m3'},message:{conversation:'Terceira'}})
  assert.equal(store.getMessage({id:'m1'}),undefined)
  assert.equal(store.size(),2)
  clock=4001
  assert.equal(store.getMessage({id:'m2'}),undefined)
  assert.equal(store.size(),0)
})
