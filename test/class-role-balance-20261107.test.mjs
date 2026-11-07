import test from 'node:test'
import assert from 'node:assert/strict'
import {classCombatGrowth,classCombatStats,classCombatHp,classPersistentHp,CLASS_ROLE_GROWTH} from '../src/neon/class-combat-balance.js'
import {auditSeventeen,buildFairFighter,PVP_EQUAL_GEAR} from '../src/neon/pvp-balance-simulator.js'

const CLASS_IDS=['paladin','berserker','samurai','necromancer']

test('class progression is bounded, without mutating permanent user stats',()=>{
 const st={max_hp:4000,atk:900,def:500,spd:480}
 const original={...st}
 for(const id of CLASS_IDS){
   assert.deepEqual(classCombatGrowth(id,1),{hp:0,atk:0,def:0,spd:0})
   assert.deepEqual(classCombatGrowth(id,100),CLASS_ROLE_GROWTH[id])
   assert.deepEqual(classCombatGrowth(id,9999),CLASS_ROLE_GROWTH[id])
   assert.deepEqual(classCombatGrowth(id,-20),{hp:0,atk:0,def:0,spd:0})
   assert.deepEqual(classCombatStats(st,id,100,false).bonus,{hp:0,atk:0,def:0,spd:0})
 }
 assert.deepEqual(st,original)
})
test('base class roles: tank defense, brute attack, duelist speed, necromancer recovery',()=>{
 const cl=Object.fromEntries(CLASS_IDS.map(id=>[id,buildFairFighter(id,{gear:false})]))
 assert.ok(cl.paladin.maxHp>cl.necromancer.maxHp)
 assert.ok(cl.paladin.def>cl.necromancer.def)
 assert.ok(cl.paladin.def>cl.samurai.def)
 assert.ok(cl.berserker.atk>cl.necromancer.atk)
 assert.ok(cl.berserker.atk>cl.samurai.atk)
 assert.ok(cl.samurai.spd>cl.berserker.spd)
 assert.ok(cl.necromancer.atk>cl.paladin.atk)
})
test('equipment is independent of character base growth',()=>{
 for(const id of [...CLASS_IDS,'pecado_diane','pecado_meliodas']){
   const base=buildFairFighter(id,{gear:false})
   const geared=buildFairFighter(id,{gear:true})
   assert.equal(geared.maxHp-base.maxHp,PVP_EQUAL_GEAR.hp)
   assert.equal(geared.atk-base.atk,PVP_EQUAL_GEAR.atk)
   assert.equal(geared.def-base.def,PVP_EQUAL_GEAR.def)
   assert.equal(geared.spd-base.spd,PVP_EQUAL_GEAR.spd)
   assert.equal(geared.crit-base.crit,PVP_EQUAL_GEAR.crit)
 }
})
test('class HP projection uses only percentage and round-trips',()=>{
 for(const base of [100,800,3500,6000]){
   for(const bonus of [0,200,300]){
     for(const hp of [0,Math.floor(base*.25),Math.floor(base*.6),base]){
       const combat=classCombatHp(hp,base,base+bonus)
       const persisted=classPersistentHp(combat,base+bonus,base)
       assert.ok(Math.abs(persisted-hp)<=1,JSON.stringify({base,bonus,hp,combat,persisted}))
     }
   }
 }
})
test('all seven heroes win 55-65% of role-class duels on un-geared equal base',()=>{
 const r=auditSeventeen({duelsPerOrder:100,gear:false,awakening:5,mastery:5})
 const pairs=r.pairs.filter(x=>x.a.startsWith('pecado_')&&CLASS_IDS.includes(x.b))
 assert.equal(pairs.length,28)
 const wins=pairs.reduce((n,x)=>n+x.aWins,0)
 const games=pairs.reduce((n,x)=>n+x.fights,0)
 const winPct=wins/games*100
 assert.ok(winPct>=55&&winPct<=65,'hero average '+winPct.toFixed(2)+'%')
 const byClass=Object.fromEntries(CLASS_IDS.map(id=>[id,pairs.filter(x=>x.b===id)]))
 for(const [id,duels] of Object.entries(byClass)){
   const clsWinPct=duels.reduce((n,x)=>n+x.bWins,0)/duels.reduce((n,x)=>n+x.fights,0)*100
   assert.ok(clsWinPct>=30&&clsWinPct<=48,id+' class average '+clsWinPct.toFixed(2)+'%')
 }
 // Hero progress and class awakening are both capped; gear is deliberately ignored.
 assert.equal(r.combatants,17)
 assert.equal(r.pairs,136)
})
