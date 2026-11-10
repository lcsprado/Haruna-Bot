import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {activeOwnerMultiplier,readOwnerRewardMultipliers} from '../src/neon/owner-event-readonly.js'
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const from=games.indexOf('async function finishRaidRewards(')
const end=games.indexOf('\nexport ',from+20)
assert.ok(from>=0&&end>from)
const rewards=games.slice(from,end)

const NOW=Date.parse('2026-11-10T18:10:00Z')
const event=(a=NOW-300000,b=NOW+600000,m=2)=>({startsAt:a,endsAt:b,multiplier:m})
test('AB-01: only active owner events affect rewards, with exact caps',()=>{
 for(const type of ['raid','drop','fragmentos','dinheiro','pet','corre','sorte']){
  assert.equal(activeOwnerMultiplier(type,event(),NOW),2)
  assert.equal(activeOwnerMultiplier(type,event(NOW+1000,NOW+600000),NOW),1)
  assert.equal(activeOwnerMultiplier(type,event(NOW-300000,NOW),NOW),1)
  assert.equal(activeOwnerMultiplier(type,event(NOW-300000,NOW+600000,15),NOW),2)
 }
 assert.equal(activeOwnerMultiplier('xp',event(NOW-300000,NOW+600000,3),NOW),3)
 assert.equal(activeOwnerMultiplier('xp',event(NOW-300000,NOW+600000,15),NOW),3)
 assert.equal(activeOwnerMultiplier('raid',event(NOW-300000,NOW+600000,NaN),NOW),1)
 assert.equal(activeOwnerMultiplier('raid',event(0,0),NOW),1)
 assert.equal(activeOwnerMultiplier('raid',null,NOW),1)
 assert.equal(activeOwnerMultiplier('unknown',event(),NOW),1)
})
test('AB-01: Web reads event settings in one read-only SELECT and defaults missing to 1x',async()=>{
 const queries=[]
 const client={query:async(sql,params)=>{
  queries.push({sql,params})
  return {rows:[
   {key:'owner_event_center:raid',value:event()},
   {key:'owner_event_center:drop',value:event(NOW-300000,NOW-1000)},
   {key:'owner_event_center:fragmentos',value:event(NOW-300000,NOW+600000,2)},
   {key:'owner_event_center:xp',value:event(NOW-300000,NOW+600000,3)}
  ]}
 }}
 const r=await readOwnerRewardMultipliers(client,['raid','drop','fragmentos','xp','dinheiro'],NOW)
 assert.deepEqual(r,{raid:2,drop:1,fragmentos:2,xp:3,dinheiro:1})
 assert.equal(queries.length,1)
 assert.match(queries[0].sql,/^SELECT key,value FROM trevo_settings WHERE key=ANY\(\$1::text\[\]\)$/)
 assert.equal(queries[0].params[0].length,5)
 assert.ok(queries[0].params[0].every(x=>x.startsWith('owner_event_center:')))
 await assert.rejects(readOwnerRewardMultipliers(client,['admin'],NOW),/Tipo de evento inválido/)
})
test('AB-01: Raid Web payout consults the same owner event dimensions as WhatsApp',()=>{
 assert.match(games,/import \{readOwnerRewardMultipliers\} from '\.\/owner-event-readonly\.js'/)
 assert.match(rewards,/readOwnerRewardMultipliers\(\s*c,\['raid','drop','fragmentos','xp','dinheiro'\],now\)/)
 assert.match(rewards,/moneyMultiplier=Math\.max\([^\n]*ownerEvents\.dinheiro\)/)
 assert.match(rewards,/ownerEvents\.raid,ownerEvents\.xp\)/)
 assert.match(rewards,/petXpMultiplier=Math\.max\([^;]*ownerEvents\.raid,effectivePetXp\)\/effectivePetXp/)
 assert.match(rewards,/qty=baseQty\*Math\.max\([^;]*ownerEvents\.fragmentos\)/)
 assert.match(rewards,/boxChance=Math\.min\(\.85,boxChance\*ownerEvents\.drop\)/)
 assert.match(rewards,/chance=Math\.min\(\.12,[^\n]*ownerEvents\.drop\)/)
})
test('AB-01: no event active means identical old base multipliers; bonuses never stack twice',()=>{
 function simulate({raidGoldHour=false,cacada=false,raidEvent=false,events={raid:1,drop:1,fragmentos:1,xp:1,dinheiro:1},petMultiplier=1}={}){
  const money=Math.max(raidGoldHour?2:(cacada?1.25:1),events.dinheiro)
  const xp=Math.max(raidGoldHour?2:(raidEvent?1.5:(cacada?1.5:1)),events.raid,events.xp)
  const pet=Math.max(raidEvent?1.5:(cacada?1.25:1),events.raid,petMultiplier)/petMultiplier
  return {money,xp,pet,drop:events.drop,fragments:events.fragmentos}
 }
 assert.deepEqual(simulate(),{money:1,xp:1,pet:1,drop:1,fragments:1})
 const boosted=simulate({raidGoldHour:true,raidEvent:true,events:{raid:2,drop:2,fragmentos:2,xp:3,dinheiro:2},petMultiplier:2})
 assert.deepEqual(boosted,{money:2,xp:3,pet:1,drop:2,fragments:2})
 assert.equal(simulate({raidEvent:true,events:{raid:2,drop:1,fragmentos:1,xp:1,dinheiro:1}}).xp,2)
})
