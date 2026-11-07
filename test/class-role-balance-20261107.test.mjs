import test from 'node:test'
import assert from 'node:assert/strict'
import {classCombatGrowth,classCombatStats,CLASS_ROLE_GROWTH} from '../src/neon/class-combat-balance.js'
import {auditSeventeen,buildFairFighter} from '../src/neon/pvp-balance-simulator.js'

test('growth is capped and does not mutate permanent attributes',()=>{
 const st={max_hp:4000,atk:900,def:500,spd:480}
 const original={...st}
 assert.deepEqual(classCombatGrowth('samurai',1),{hp:0,atk:0,def:0,spd:0})
 assert.deepEqual(classCombatGrowth('samurai',100),CLASS_ROLE_GROWTH.samurai)
 assert.deepEqual(classCombatGrowth('samurai',9999),CLASS_ROLE_GROWTH.samurai)
 assert.deepEqual(classCombatGrowth('samurai',-20),{hp:0,atk:0,def:0,spd:0})
 assert.deepEqual(classCombatStats(st,'samurai',100,false).bonus,{hp:0,atk:0,def:0,spd:0})
 assert.deepEqual(st,original)
})
test('class roles: berserker attack, paladin tank, samurai speed, necromancer sustain',()=>{
 const cl=Object.fromEntries(['paladin','berserker','samurai','necromancer'].map(id=>[id,buildFairFighter(id,{gear:false})]))
 assert.ok(cl.paladin.maxHp>cl.berserker.maxHp)
 assert.ok(cl.paladin.def>cl.berserker.def)
 assert.ok(cl.berserker.atk>cl.paladin.atk)
 assert.ok(cl.samurai.spd>cl.berserker.spd)
 assert.ok(cl.necromancer.atk>cl.paladin.atk)
})
test('heroes retain aggregate superiority at equal gear, max level and awakening',()=>{
 const r=auditSeventeen({duelsPerOrder:100,gear:true,awakening:5,mastery:5})
 const classes=['paladin','berserker','samurai','necromancer']
 const heroPairs=r.pairs.filter(x=>x.a.startsWith('pecado_')&&classes.includes(x.b))
 assert.equal(heroPairs.length,28)
 const heroWins=heroPairs.reduce((n,x)=>n+x.aWins,0)
 const heroFights=heroPairs.reduce((n,x)=>n+x.fights,0)
 assert.ok(heroWins/heroFights>.55,'heroes must win more than 55% on average, actual '+(heroWins/heroFights))
 const sorted=r.ranking.filter(x=>x.id.startsWith('pecado_')||classes.includes(x.id))
 assert.ok(sorted[0].id.startsWith('pecado_'),'best overall must be a hero: '+sorted[0].id)
})
