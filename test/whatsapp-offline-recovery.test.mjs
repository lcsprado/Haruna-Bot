import test from 'node:test'
import assert from 'node:assert/strict'
import {createWhatsAppOfflineRecovery} from '../src/neon/whatsapp-offline-recovery.js'

function fakeTimers(){
  let now=0,id=0,timers=[]
  return {
    schedule:(fn,delay)=>{const key=++id;timers.push({key,time:now+delay,fn});return key},
    cancel:key=>{timers=timers.filter(x=>x.key!==key)},
    run:async(ms=1000)=>{
      const until=now+ms
      let count=0
      while(timers.length&&count++<1000){
        timers.sort((a,b)=>a.time-b.time)
        if(timers[0].time>until)break
        const next=timers.shift()
        now=next.time
        await next.fn()
      }
      now=until
    },
    pending:()=>timers.length
  }
}

test('backlog incompleto continua pedindo lotes mesmo apos messages.upsert',async()=>{
  const t=fakeTimers(),sent=[],actions=[]
  let buffering=true
  const recovery=createWhatsAppOfflineRecovery({
    socket:{
      sendNode:async node=>sent.push(node),
      ev:{isBuffering:()=>buffering,flush:()=>{buffering=false;return true}}
    },
    isOpen:()=>true,
    onAction:(...a)=>actions.push(a),
    schedule:t.schedule,cancel:t.cancel,batchDelayMs:10,flushDelayMs:20,maxBatchRequests:4
  })
  recovery.onOpen()
  recovery.onPreview()
  recovery.onMessage()
  await t.run(100)
  assert.equal(sent.length,4)
  assert.deepEqual(actions.filter(x=>x[0]==='cap'),[['cap',4]])
  assert.equal(recovery.snapshot().batches,4)
})

test('ib offline de conclusao cancela pedidos e liberacao forçada',async()=>{
  const t=fakeTimers(),sent=[]
  const recovery=createWhatsAppOfflineRecovery({
    socket:{sendNode:async node=>sent.push(node)},isOpen:()=>true,
    schedule:t.schedule,cancel:t.cancel,batchDelayMs:10,flushDelayMs:20
  })
  recovery.onOpen()
  recovery.onPreview()
  await t.run(15)
  recovery.onComplete()
  await t.run(100)
  assert.equal(sent.length,1)
  assert.equal(t.pending(),0)
  assert.equal(recovery.snapshot().completed,true)
})

test('sem preview, o recebimento normal cancela recuperacao desnecessaria',async()=>{
  const t=fakeTimers(),sent=[]
  const recovery=createWhatsAppOfflineRecovery({
    socket:{sendNode:async node=>sent.push(node)},isOpen:()=>true,
    schedule:t.schedule,cancel:t.cancel,batchDelayMs:10,flushDelayMs:20
  })
  recovery.onOpen()
  recovery.onMessage()
  await t.run(100)
  assert.equal(sent.length,0)
  assert.equal(t.pending(),0)
})

test('fila offline com milhares de eventos aumenta teto sem ultrapassar limite absoluto',async()=>{
  const t=fakeTimers(),requests=[],actions=[]
  const recovery=createWhatsAppOfflineRecovery({
    socket:{sendNode:async node=>requests.push(node),ev:{flush:()=>true}},isOpen:()=>true,
    schedule:t.schedule,cancel:t.cancel,batchDelayMs:10,flushDelayMs:500,
    maxBatchRequests:4,maxBatchRequestsLimit:12,
    onAction:(...args)=>actions.push(args)
  })
  recovery.onOpen()
  recovery.onPreview(1000)
  assert.equal(recovery.snapshot().batchLimit,12)
  await t.run(150)
  assert.equal(requests.length,12)
  assert.deepEqual(actions.filter(a=>a[0]==='cap'),[['cap',12]])
})

test('o fim da fila cancela requisicoes mesmo com teto expandido',async()=>{
  const t=fakeTimers(),requests=[]
  const recovery=createWhatsAppOfflineRecovery({
    socket:{sendNode:async node=>requests.push(node)},isOpen:()=>true,
    schedule:t.schedule,cancel:t.cancel,batchDelayMs:10,flushDelayMs:500,
    maxBatchRequests:4,maxBatchRequestsLimit:12
  })
  recovery.onOpen()
  recovery.onPreview(1000)
  await t.run(20)
  recovery.onComplete()
  await t.run(200)
  assert.equal(requests.length,2)
  assert.equal(recovery.snapshot().completed,true)
  assert.equal(t.pending(),0)
})

test('terminador libera buffer que continuou preso no Baileys',async()=>{
  const t=fakeTimers(),actions=[]
  let buffering=true,flushes=0
  const recovery=createWhatsAppOfflineRecovery({
    socket:{sendNode:async()=>{},ev:{
      isBuffering:()=>buffering,
      flush:()=>{buffering=false;flushes++;return true}
    }},isOpen:()=>true,
    schedule:t.schedule,cancel:t.cancel,batchDelayMs:10,flushDelayMs:1000,
    onAction:(...a)=>actions.push(a)
  })
  recovery.onOpen()
  recovery.onPreview()
  await t.run(25)
  recovery.onComplete()
  assert.equal(flushes,1)
  assert.deepEqual(actions.filter(a=>a[0]==='flush-complete'),[['flush-complete',1]])
  assert.equal(recovery.snapshot().completed,true)
  assert.equal(t.pending(),0)
})
