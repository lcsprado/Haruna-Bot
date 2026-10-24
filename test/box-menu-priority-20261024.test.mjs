import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {shouldRouteQuizContinuation} from '../src/neon/menu-routing.js'
import {createKeyedAsyncQueue} from '../src/neon/chat-queue.js'
import {groupIncomingByPlayer,playerQueueKey} from '../src/neon/whatsapp-concurrency.js'

const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const m=(participant,participantAlt,id)=>({key:{remoteJid:'g@g.us',participant,participantAlt,id}})

test('caixa do jogador não é interceptada pelo quiz global',()=>{
  assert.equal(shouldRouteQuizContinuation({body:'1',hasPlayerMenu:true,quizPending:true}),false)
  assert.equal(shouldRouteQuizContinuation({body:'2',hasPlayerMenu:true,quizPending:true}),false)
  assert.equal(shouldRouteQuizContinuation({body:'1',hasPlayerMenu:false,quizPending:true}),true)
  assert.equal(shouldRouteQuizContinuation({body:'2',hasPlayerMenu:false,quizPending:true}),true)
  assert.equal(shouldRouteQuizContinuation({body:'1',hasPlayerMenu:false,quizPending:false}),false)
  assert.equal(shouldRouteQuizContinuation({body:'!1',hasPlayerMenu:false,quizPending:true}),false)
  assert.equal(shouldRouteQuizContinuation({body:'3',hasPlayerMenu:false,quizPending:true}),false)
})
test('menu persistido é recuperado antes de aceitar um atalho de quiz',()=>{
  const index=source.indexOf('const activeNumericMenu=possibleQuizChoice')
  const quiz=source.indexOf('if(shouldRouteQuizContinuation(')
  assert.ok(index>=0&&quiz>index)
  assert.match(source.slice(index,quiz),/recoverQuickFlow\(chat,sender\)/)
  assert.match(source,/let flow=activeNumericMenu\|\|getQuickFlow\(chat,sender\)/)
})
test('LID e PN simultâneos do mesmo jogador preservam a mesma fila',async()=>{
 const first=m('101010@lid','5511999999999@s.whatsapp.net','menu')
 const second=m('5511999999999@s.whatsapp.net',null,'choose1')
 assert.equal(playerQueueKey(first),playerQueueKey(second))
 const other=m('5511888888888@s.whatsapp.net',null,'independent')
 assert.notEqual(playerQueueKey(first),playerQueueKey(other))
 const queue=createKeyedAsyncQueue()
 let release
 const pending=new Promise(resolve=>release=resolve)
 const steps=[]
 const p1=queue(playerQueueKey(first),async()=>{steps.push('menu');await pending})
 const p2=queue(playerQueueKey(second),async()=>steps.push('open'))
 const p3=queue(playerQueueKey(other),async()=>steps.push('other'))
 await p3
 assert.deepEqual(steps,['menu','other'])
 release();await Promise.all([p1,p2])
 assert.deepEqual(steps,['menu','other','open'])
 assert.equal(groupIncomingByPlayer([first,second,other]).size,2)
})
test('loot opening is transactional and records item rewards for independent audit',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const start=db.indexOf('export async function openLootBoxes(')
 const end=db.indexOf('export async function openLuckyBoxes(',start)
 const body=db.slice(start,end)
 assert.match(body,/return transaction\(async client=>/)
 assert.match(body,/UPDATE inventories SET quantity=quantity-\$1/)
 assert.match(body,/INSERT INTO transactions\(from_jid,to_jid,amount,type,note\)/)
 assert.match(body,/loot_item/)
 assert.match(body,/abertura revertida/)
})
