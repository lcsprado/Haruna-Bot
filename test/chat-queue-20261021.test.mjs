import test from 'node:test'
import assert from 'node:assert/strict'
import {createKeyedAsyncQueue} from '../src/neon/chat-queue.js'

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}

test('dois comandos do mesmo grupo são executados na ordem, sem perder resposta',async()=>{
  const enqueue=createKeyedAsyncQueue(),gate=deferred(),sent=[]
  const first=enqueue('grupo',async()=>{sent.push('inicia trabalho');await gate.promise;sent.push('responde trabalho')})
  const second=enqueue('grupo',async()=>{sent.push('inicia dungeon');sent.push('responde dungeon')})
  await Promise.resolve();await Promise.resolve()
  assert.deepEqual(sent,['inicia trabalho'])
  gate.resolve();await Promise.all([first,second])
  assert.deepEqual(sent,['inicia trabalho','responde trabalho','inicia dungeon','responde dungeon'])
})

test('grupos distintos prosseguem em paralelo',async()=>{
 const enqueue=createKeyedAsyncQueue(),gate=deferred(),sent=[]
 const slow=enqueue('grupo A',async()=>{await gate.promise;sent.push('A')})
 const fast=enqueue('grupo B',async()=>{sent.push('B')})
 await fast
 assert.deepEqual(sent,['B'])
 gate.resolve();await slow
 assert.deepEqual(sent,['B','A'])
})

test('falha de envio libera a próxima resposta sem repetir a anterior',async()=>{
 const enqueue=createKeyedAsyncQueue(),calls=[]
 const broken=enqueue('grupo',()=>{calls.push('venda');throw new Error('WhatsApp indisponível')})
 const next=enqueue('grupo',()=>{calls.push('inventario');return 'ok'})
 await assert.rejects(broken,/WhatsApp indisponível/)
 assert.equal(await next,'ok')
 assert.deepEqual(calls,['venda','inventario'])
})
