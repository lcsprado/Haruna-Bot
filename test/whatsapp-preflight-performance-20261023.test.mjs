import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createKeyedAsyncQueue} from '../src/neon/chat-queue.js'

const progression=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))

test('evento de grupo mantém chance por mensagem e evita transação nos 96,5% sem sorteio',async()=>{
  let transactions=0,queries=0,roll=0
  const math=Object.create(Math);math.random=()=>roll
  const context={Math:math,Date,randomGroupEventCash:()=>10000,
    tx:async fn=>{transactions++;return fn({query:async sql=>{queries++;return {rows:sql.startsWith('SELECT *')?[]:[]}}})}}
  vm.createContext(context)
  vm.runInContext(section(progression,'export async function maybeSpawnGroupEvent','export async function claimGroupEvent').replace('export async function','async function'),context)
  roll=.9
  for(let i=0;i<100;i++)assert.equal(await context.maybeSpawnGroupEvent('group@g.us'),null)
  assert.equal(transactions,0)
  assert.equal(queries,0)
  roll=.01
  const event=await context.maybeSpawnGroupEvent('group@g.us')
  assert.equal(transactions,1)
  assert.equal(queries,3)
  assert.equal(event.reward,10000)
  assert.equal(await context.maybeSpawnGroupEvent('private@s.whatsapp.net'),null)
  assert.equal(transactions,1)
})

test('evento ativo continua protegido pelo lock e pela leitura transacional',async()=>{
  let inserts=0,locks=0
  const math=Object.create(Math);math.random=()=>0
  const context={Math:math,Date,randomGroupEventCash:()=>10000,
    tx:async fn=>fn({query:async sql=>{
      if(sql.includes('pg_advisory_xact_lock'))locks++
      if(sql.startsWith('INSERT'))inserts++
      if(sql.startsWith('SELECT *'))return {rows:[{claimed_by:null,expires_at:Math.floor(Date.now()/1000)+60}]}
      return {rows:[]}
    }})}
  vm.createContext(context)
  vm.runInContext(section(progression,'export async function maybeSpawnGroupEvent','export async function claimGroupEvent').replace('export async function','async function'),context)
  assert.equal(await context.maybeSpawnGroupEvent('group@g.us'),null)
  assert.equal(locks,1)
  assert.equal(inserts,0)
})

test('introdução já enviada usa cache curto e invalida após alteração',async()=>{
  let reads=0,writes=0,clock=1000
  const context={Date:{now:()=>clock},JSON,Map,
    botGroupIntroSentCache:new Map(),BOT_GROUP_INTRO_CACHE_MS:120000,
    botGroupIntroKey:chat=>'bot_group_intro:'+chat,
    db:{query:async sql=>{if(sql.startsWith('SELECT')){reads++;return {rows:[{value:{sent:true}}]}}writes++;return {rows:[]}}}}
  vm.createContext(context)
  vm.runInContext(section(index,'async function getBotGroupIntroState','async function sendBotGroupIntro'),context)
  for(let i=0;i<100;i++)assert.equal((await context.getBotGroupIntroState('group@g.us')).sent,true)
  assert.equal(reads,1)
  clock+=120001
  assert.equal((await context.getBotGroupIntroState('group@g.us')).sent,true)
  assert.equal(reads,2)
  await context.setBotGroupIntroState('group@g.us',{sent:false})
  assert.equal(writes,1)
  await context.getBotGroupIntroState('group@g.us')
  assert.equal(reads,3)
})

test('jogadores e menus seguem independentes durante um evento lento',async()=>{
  const queue=createKeyedAsyncQueue()
  const menus=new Map(),events=[]
  let release
  const raidGate=new Promise(resolve=>release=resolve)
  const raid=queue('group|A',async()=>{events.push('raid A');await raidGate;menus.set('A','confirmado')})
  const nextA=queue('group|A',async()=>{events.push('menu A');assert.equal(menus.get('A'),'confirmado')})
  const pixB=queue('group|B',async()=>{events.push('pix B');menus.set('B','confirmado')})
  await pixB
  assert.deepEqual(events,['raid A','pix B'])
  release()
  await Promise.all([raid,nextA])
  assert.deepEqual(events,['raid A','pix B','menu A'])
  assert.equal(menus.get('B'),'confirmado')
})
