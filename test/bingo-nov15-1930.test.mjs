import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src=fs.readFileSync(new URL('../src/neon/bingo-20261115.js',import.meta.url),'utf8')
const index=fs.readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

function compiled(){
  const a=src.indexOf('async function checkPrizes(s,c){')
  const b=src.indexOf('const welcome=',a)
  assert.ok(a>=0&&b>a,'Winner and draw functions exist')
  const credits=[]
  const fn=new Function('cover','pick','credit','formatMoney','REWARD',src.slice(a,b)+';return {checkPrizes,processBall}')
  const cover=(card,p,s)=>card.map((v,i)=>v===null||(s.drawn||[]).includes(v)||(p.wild||[]).includes(i))
  const play=fn(cover,list=>list[0],async(c,jid,amount,type,note)=>credits.push({jid,amount,type,note}),x=>'R$ '+x.toLocaleString('pt-BR'),{full:5000000})
  return {...play,credits}
}

test('19h30 on 15/11/2026 uses isolated persistent event key',()=>{
  assert.match(src,/bingo_alpha_20261115_1930_v1/)
  assert.match(src,/2026-11-15T19:30:00-03:00/)
  assert.match(src,/startAt:EVENT_START/)
  assert.match(src,/const NUMBER_LIMIT=40/)
  assert.match(src,/const BALL_INTERVAL_MS=25000/)
})
test('one free card per player, without debit or entry payment',()=>{
  assert.doesNotMatch(src,/UPDATE wallets\s+SET cash=cash-LEAST/)
  assert.doesNotMatch(src,/bingo_reboot_card/)
  assert.match(src,/CARTELA GRÁTIS CONFIRMADA/)
  assert.match(src,/if\(me\)\{out=/)
  assert.match(src,/if\(s.phase!=='registration' \|\| now>=Number\(s.startAt\)\)/)
})
test('only first full-card winner receives R$ 5 million exactly once',async()=>{
  const x=compiled()
  const state={players:{
    alice:{name:'Alice',card:[1,2,3,4,null,5,6,7,8],wild:[]},
    bob:{name:'Bob',card:[9,10,11,12,null,13,14,15,16],wild:[]}
  },drawn:[1,2,3,4,5,6,7],prizes:{},queue:[{kind:'number',value:8}],cursor:0}
  const round=await x.processBall(state,{})
  assert.equal(round.finished,true)
  assert.equal(x.credits.length,1)
  assert.deepEqual(x.credits[0],{jid:'alice',amount:5000000,type:'bingo_full_20261115',note:'full_card'})
  assert.equal(state.prizes.full.amount,5000000)
  await x.checkPrizes(state,{})
  assert.equal(x.credits.length,1)
  assert.deepEqual(state.drawn,[1,2,3,4,5,6,7,8])
})
test('no prize for partial line or for purchasing tickets',async()=>{
  const x=compiled()
  const state={players:{alice:{name:'Alice',card:[1,2,3,4,null,5,6,7,8],wild:[]}},drawn:[1,2,3],prizes:{}}
  await x.checkPrizes(state,{})
  assert.equal(x.credits.length,0)
  assert.equal(state.prizes.full,undefined)
})
test('20th random draw remains deterministic in persisted queue; no special cash or trophies',()=>{
  assert.match(src,/shuffle\(Array\.from\(\{length:NUMBER_LIMIT\}/)
  assert.doesNotMatch(src,/kind:'special'/)
  assert.doesNotMatch(src,/bonusPayDone=true/)
  assert.doesNotMatch(src,/INSERT INTO items/)
  assert.doesNotMatch(src,/INSERT INTO inventories/)
})
test('retries announcements per group and deduplicates payout transaction',()=>{
  assert.match(src,/pg_advisory_xact_lock/)
  assert.match(src,/s\.prizes\.full\)return/)
  assert.match(src,/notice\.delivered\?\.\[jid\]/)
  assert.match(src,/queueNotice\(s,'registration'/)
  assert.match(src,/queueNotice\(s,'start'/)
  assert.match(src,/queueNotice\(s,isFinal\?'final'/)
  assert.match(src,/\[BINGO 15\/11\] aviso aceito/)
})
test('WhatsApp scheduler and commands are connected',()=>{
  assert.match(index,/startBingoNov15Scheduler\(sock\)/)
  assert.match(index,/handleBingoNov15Command\(\{cmd,sender/)
  assert.match(src,/cmd!=='bingo' && cmd!=='cartela'/)
})
