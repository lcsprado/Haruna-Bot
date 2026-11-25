import test from 'node:test'
import assert from 'node:assert/strict'
import {STONE_UPGRADE_RATES,stoneLevels,stoneLevelValue,stoneRowValue,stoneUpgradeQuote,stoneUpgradeOutcome} from '../src/neon/stone-upgrade-policy.js'
import {STONES} from '../src/neon/enchantment-stones-catalog.js'
import {gearStatsWithEnchants} from '../src/neon/equipment-enchant-view.js'
test('todas as faixas têm exatamente as chances aprovadas e custo crescente',()=>{
 const stone=STONES.pedra_forca_lendaria_alpha
 for(let lv=1;lv<10;lv++){
  const q=stoneUpgradeQuote(stone,lv),counts={success:0,failure:0,breakage:0}
  for(let roll=0;roll<100;roll++)counts[stoneUpgradeOutcome(q,roll)]++
  assert.deepEqual(Object.values(counts),STONE_UPGRADE_RATES[lv-1])
  assert.equal(q.cost,1800*lv)
  assert.ok(q.after>q.before)
 }
 assert.throws(()=>stoneUpgradeQuote(stone,10),/Lv.10/)
})
test('pedras antigas mantêm valores; duas pedras iguais evoluem independentemente',()=>{
 assert.deepEqual(stoneLevels({quantity:3}),[1,1,1])
 assert.deepEqual(stoneLevels({quantity:3,upgrade_levels:[10,4]}),[10,4,1])
 assert.equal(stoneRowValue(35,{quantity:2,upgrade_levels:[10,1]}),84)
 assert.ok(Math.abs(stoneLevelValue(.1,10)-.14)<1e-10)
 const r=gearStatsWithEnchants({atk:100},[{stone_id:'pedra_forca_lendaria_alpha',quantity:2,upgrade_levels:[10,1]}],STONES)
 assert.equal(r.atk,184)
})
