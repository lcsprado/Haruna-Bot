import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {V2_WEEKLY_BOSS,V2_COMMON_BOSS,commonBossRewardV2,dungeonCashV2,dungeonAwakeningEnabled} from '../src/neon/reboot-pve-policy.js'
const read=p=>readFileSync(new URL('../src/neon/'+p,import.meta.url),'utf8')
test('Boss comum V2: sem prêmio fixo por presença ou multiplicador, teto coletivo',()=>{
 for(const shares of [[100],[50,50],[40,30,20,9,1],[97,1,1,1]]){
  const r=shares.map(d=>commonBossRewardV2(d,100))
  assert.ok(r.reduce((s,x)=>s+x.cash,0)<=V2_COMMON_BOSS.cashPool)
  assert.ok(r.reduce((s,x)=>s+x.xp,0)<=V2_COMMON_BOSS.xpPool)
 }
 assert.deepEqual(commonBossRewardV2(1,100),{cash:0,xp:0,boxChance:0})
 assert.deepEqual(commonBossRewardV2(101,100),{cash:0,xp:0,boxChance:0})
 assert.deepEqual(commonBossRewardV2(100,100),{cash:2500,xp:120,boxChance:.03})
})
test('Dungeon V2: emissão máxima de 1000 por vitória, despertar isolado',()=>{
 for(const mult of [1,1.2,1.5,2]){
  assert.equal(dungeonCashV2(mult,0),Math.floor(250*mult))
  assert.equal(dungeonCashV2(mult,.999999),Math.floor(500*mult))
 }
 assert.throws(()=>dungeonCashV2(3,.5),RangeError)
 assert.equal(dungeonAwakeningEnabled('dungeon',{enabled:false}),false)
 assert.equal(dungeonAwakeningEnabled('dungeon',{enabled:true}),true)
 for(const context of ['boss','raid','pvp'])assert.equal(dungeonAwakeningEnabled(context,{enabled:true}),dungeonAwakeningEnabled(context,{enabled:false}))
 const d=read('db.js')
 assert.match(d,/const cash=classesOnlyRebootEnabled\(\)\?dungeonCashV2\(m.mult,Math.random\(\)\)/)
 assert.match(d,/context:'dungeon',lastProcAttack,awakeningStage,awakeningState/)
})
test('Superboss usa HP e ATK V2, não importa salas históricas e registra dano efetivo',()=>{
 assert.deepEqual(V2_WEEKLY_BOSS,{hp:150000,atk:45})
 const g=read('games.js')
 assert.match(g,/const maxHp=rebootEconomyEnabled\(\)\?V2_WEEKLY_BOSS.hp:/)
 assert.match(g,/atk:rebootEconomyEnabled\(\)\?V2_WEEKLY_BOSS.atk:200/)
 assert.match(g,/const rows=rebootEconomyEnabled\(\)\?\[\]:\(await c.query/)
 assert.match(g,/event\.eventId==='eclipse'/)
 assert.match(g,/if\(eventMode&&!rebootEconomyEnabled\(\)\)/)
 assert.match(g,/else if\(rebootEconomyEnabled\(\)\|\|s.eventId==='sete_pecados'/)
 assert.match(g,/if\(commonV2\)\{cash=commonV2.cash;exp=commonV2.xp\}/)
})

test('Superboss V2 não reabre depois da vitória nem liquida edição histórica',()=>{
 const g=read('games.js')
 assert.match(g,/current\?\.weekendKey===weekend.weekendKey&&\(!rebootEconomyEnabled\(\)\|\|current.rebootV2===true\)/)
 assert.equal(g.split('...(s.rebootV2===true?{rebootV2:true}:{})').length-1,2)
 assert.match(g,/nowMs<=Number\(s.endsAt\|\|0\)\|\|\(rebootEconomyEnabled\(\)&&s.rebootV2!==true\)/)
})
