import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {weeklyGolemPayoutIncrease} from '../src/neon/weekly-golem-payouts.js'

const week='2026-10-30'
const bonus=(position,damage,weekendKey=week)=>weeklyGolemPayoutIncrease({position,damage,weekendKey})

test('Golem 30/10: top five get significant extra cash and XP without changing old base',()=>{
  assert.deepEqual(bonus(1,1_000_000),{cash:4_000_000,xp:68_000})
  assert.deepEqual(bonus(2,800_000),{cash:3_250_000,xp:56_000})
  assert.deepEqual(bonus(3,700_000),{cash:2_475_000,xp:43_500})
  assert.deepEqual(bonus(4,500_000),{cash:1_650_000,xp:35_500})
  assert.deepEqual(bonus(5,400_000),{cash:1_275_000,xp:27_000})
  // Incluindo as bases existentes (sem participação proporcional ou eventos):
  assert.equal(1_000_000+bonus(1,1_000_000).cash,5_000_000)
  assert.equal(12_000+bonus(1,1_000_000).xp,80_000)
  assert.equal(750_000+bonus(2,800_000).cash,4_000_000)
  assert.equal(9_000+bonus(2,800_000).xp,65_000)
  assert.equal(525_000+bonus(3,700_000).cash,3_000_000)
  assert.equal(6_500+bonus(3,700_000).xp,50_000)
  assert.equal(350_000+bonus(4,500_000).cash,2_000_000)
  assert.equal(4_500+bonus(4,500_000).xp,40_000)
  assert.equal(225_000+bonus(5,400_000).cash,1_500_000)
  assert.equal(3_000+bonus(5,400_000).xp,30_000)
})
test('outside top five, reward depends on useful actual damage',()=>{
  assert.deepEqual(bonus(6,9999),{cash:0,xp:0})
  assert.deepEqual(bonus(6,10000),{cash:250_000,xp:5_000})
  assert.deepEqual(bonus(8,99_999),{cash:250_000,xp:5_000})
  assert.deepEqual(bonus(8,100_000),{cash:600_000,xp:12_000})
  assert.deepEqual(bonus(11,250_000),{cash:900_000,xp:20_000})
  assert.deepEqual(bonus(20,8_000_000),{cash:900_000,xp:20_000})
})
test('anti free-rider and previously closed editions receive no extra payments',()=>{
  assert.deepEqual(bonus(1,9999),{cash:0,xp:0})
  assert.deepEqual(bonus(1,10000,'2026-10-23'),{cash:0,xp:0})
  assert.deepEqual(bonus(1,10000,'unknown'),{cash:0,xp:0})
  assert.deepEqual(bonus(1,-1),{cash:0,xp:0})
  assert.deepEqual(bonus(0,1_000_000),{cash:0,xp:0})
  assert.deepEqual(bonus(7,Number.POSITIVE_INFINITY),{cash:0,xp:0})
  assert.deepEqual(bonus(7,10_000,'2026-11-06'),{cash:250_000,xp:5_000})
})
test('extra prizes are applied only on weekly boss victory (not Raid, common or event)',()=>{
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(games,/const golemBonus=weekly\?weeklyGolemPayoutIncrease/)
  assert.match(games,/tier\.cash\+golemBonus\.cash:150\+Math\.floor\(2500\*share\)/)
  assert.match(games,/tier\.xp\+golemBonus\.xp:10\+35\*share/)
  assert.match(games,/if\(s\.hp<=0\)\{\s*const entries=Object\.entries\(s\.participants\)/)
  assert.match(games,/cash:1000000,xp:12000,epicBoxes:15/)
  assert.match(games,/if\(weekly&&Number\(p\.damage\|\|0\)>?=/)
})
