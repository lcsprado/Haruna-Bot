import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 HALLOWEEN_BOSSES,halloweenBoss,halloweenRebalanceBossState,
 halloweenMinimumDamage,halloweenSoulMultiplier
} from '../src/neon/halloween-rules.js'

const bossFor=day=>HALLOWEEN_BOSSES.find(b=>b.day===day)

test('final two bosses farmable without changing earlier days',()=>{
 assert.equal(bossFor('2026-10-30').hp,11000000)
 assert.equal(bossFor('2026-10-31').hp,1800000)
 assert.equal(bossFor('2026-11-01').hp,2100000)
 assert.equal(halloweenBoss(Date.parse('2026-11-01T12:59:59-03:00')),null)
 assert.equal(halloweenBoss(Date.parse('2026-11-01T13:00:00-03:00')).hp,2100000)
 assert.equal(halloweenSoulMultiplier(Date.parse('2026-10-31T01:00:00-03:00')),2)
 assert.equal(halloweenSoulMultiplier(Date.parse('2026-11-01T14:00:00-03:00')),2)
})

test('live first cycle keeps fraction of HP and does not modify its other state',()=>{
 const persisted={day:'2026-10-31',cycle:1,hp:'11780748',max_hp:'13500000',revive_at:0}
 const result=halloweenRebalanceBossState(persisted,1800000)
 assert.deepEqual(result,{
  hp:Math.ceil(11780748*1800000/13500000),
  maxHp:1800000
 })
 assert.equal(persisted.hp,'11780748')
 assert.equal(persisted.max_hp,'13500000')
 assert.equal(persisted.cycle,1)
 assert.equal(persisted.revive_at,0)
})

test('zero HP remains zero; boss is never accidentally defeated by the rebalance',()=>{
 assert.deepEqual(halloweenRebalanceBossState({hp:0,max_hp:13500000},1800000),{hp:0,maxHp:1800000})
 assert.deepEqual(halloweenRebalanceBossState({hp:1,max_hp:13500000},1800000),{hp:1,maxHp:1800000})
 assert.deepEqual(halloweenRebalanceBossState({hp:13500000,max_hp:13500000},1800000),{hp:1800000,maxHp:1800000})
 assert.equal(halloweenRebalanceBossState({hp:150000,max_hp:1800000},1800000),null)
 assert.equal(halloweenRebalanceBossState({hp:0,max_hp:0},1800000),null)
})

test('all soul payout protections, cycles and respawns remain untouched',()=>{
 const source=readFileSync(new URL('../src/neon/halloween-alpha.js',import.meta.url),'utf8')
 assert.match(source,/SELECT \* FROM halloween_boss_days_2026 WHERE day=\$1 FOR UPDATE/)
 assert.match(source,/halloweenRebalanceBossState\(saved,boss\.hp\)/)
 assert.match(source,/UPDATE halloween_boss_days_2026 SET hp=\$2,max_hp=\$3,updated_at=\$4 WHERE day=\$1/)
 assert.match(source,/PRIMARY KEY\(day,cycle,jid,milestone\)/)
 assert.match(source,/if\(!inserted\.rowCount\)return null/)
 assert.match(source,/const qty=\(kind==='kill'\?8:4\)\*halloweenSoulMultiplier\(\)/)
 assert.match(source,/if\(now<Number\(state\.revive_at\|\|0\)\)return alerts/)
 assert.equal(halloweenMinimumDamage(1800000),15000)
 assert.equal(halloweenMinimumDamage(2100000),15000)
})
