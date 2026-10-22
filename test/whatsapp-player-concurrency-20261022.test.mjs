import test from 'node:test'
import assert from 'node:assert/strict'
import {createKeyedAsyncQueue} from '../src/neon/chat-queue.js'
import {groupIncomingByPlayer,playerQueueKey,createBoundedOutboundScheduler} from '../src/neon/whatsapp-concurrency.js'

const msg=(participant,id)=>({key:{remoteJid:'group@g.us',participant,id}})

test('um grupo distribui comandos por jogador sem misturar seus menus',()=>{
 const groups=groupIncomingByPlayer([msg('LP',1),msg('JP',2),msg('LP',3)])
 assert.equal(groups.size,2)
 assert.deepEqual(groups.get('group@g.us|LP').map(m=>m.key.id),[1,3])
 assert.deepEqual(groups.get('group@g.us|JP').map(m=>m.key.id),[2])
 assert.notEqual(playerQueueKey(msg('LP',1)),playerQueueKey(msg('JP',2)))
})

test('dois jogadores do mesmo grupo executam em paralelo; mesmo jogador mantém fila',async()=>{
 const queue=createKeyedAsyncQueue()
 let release
 const gate=new Promise(resolve=>release=resolve),events=[]
 const a=queue(playerQueueKey(msg('LP',1)),async()=>{events.push('LP1');await gate})
 const b=queue(playerQueueKey(msg('LP',2)),async()=>{events.push('LP2')})
 const c=queue(playerQueueKey(msg('JP',3)),async()=>{events.push('JP')})
 await c
 assert.deepEqual(events,['LP1','JP'])
 release();await Promise.all([a,b])
 assert.deepEqual(events,['LP1','JP','LP2'])
})

test('o limite de duas mensagens em voo por grupo não trava jogador independente',async()=>{
 const scheduler=createBoundedOutboundScheduler({maxConcurrentPerChat:2})
 const gates=[0,1,2].map(()=>{let release;const wait=new Promise(resolve=>release=resolve);return {wait,release}})
 let active=0,maximum=0
 const started=[]
 const tasks=gates.map((gate,i)=>scheduler('group@g.us',{quoted:msg('player'+i,i)},async()=>{
   active++;maximum=Math.max(maximum,active);started.push(i)
   await gate.wait
   active--
 }))
 for(let i=0;i<8;i++)await Promise.resolve()
 assert.equal(active,2)
 assert.equal(started.length,2)
 gates[0].release();await tasks[0]
 for(let i=0;i<8;i++)await Promise.resolve()
 assert.equal(started.length,3)
 gates[1].release();gates[2].release();await Promise.all(tasks)
 assert.equal(maximum,2)
})

test('envios do mesmo jogador permanecem ordenados e falha libera a fila',async()=>{
 const scheduler=createBoundedOutboundScheduler()
 let release
 const gate=new Promise(resolve=>release=resolve),events=[]
 const a=scheduler('g',{quoted:msg('LP',1)},async()=>{events.push('primeiro');await gate})
 const b=scheduler('g',{quoted:msg('LP',2)},async()=>events.push('segundo'))
 for(let i=0;i<8;i++)await Promise.resolve()
 assert.deepEqual(events,['primeiro'])
 release();await Promise.all([a,b])
 assert.deepEqual(events,['primeiro','segundo'])
 await assert.rejects(scheduler('g',{},async()=>{throw new Error('falha')}),/falha/)
 assert.equal(await scheduler('g',{},async()=>42),42)
})
