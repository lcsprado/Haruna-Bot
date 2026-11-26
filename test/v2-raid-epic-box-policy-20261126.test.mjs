import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {v2EpicRaidBoxChance,V2_EPIC_BOX_FIRST_CHANCE} from '../src/neon/v2-raid-epic-box-policy.js'
import {raidLoteGearChance} from '../src/neon/raid-lote-policy.js'
test('approved epic box progression and quarter RaidLote probability',()=>{
 const expected={30:.20,40:.30,50:.40,60:.50,65:.55,70:.65}
 assert.deepEqual(V2_EPIC_BOX_FIRST_CHANCE,expected)
 for(const [level,base] of Object.entries(expected)){
  assert.equal(v2EpicRaidBoxChance({level,rankIndex:0,share:1,enabled:true}),base)
  assert.equal(raidLoteGearChance(base),base*.25)
  assert.ok(v2EpicRaidBoxChance({level,rankIndex:0,petDrop:1,enabled:true})<=base+.10)
  for(const share of [0,.1,.5,1])for(const petDrop of [0,.05,.2,1]){
   const other=v2EpicRaidBoxChance({level,rankIndex:1,share,petDrop,enabled:true})
   assert.ok(other>=0&&other<base)
  }
 }
})
test('legacy and common/rare raid levels keep original behavior',()=>{
 for(const level of [10,15,20,25,30,40,50,60,65,70]){
  assert.equal(v2EpicRaidBoxChance({level,rankIndex:0,enabled:false}),null)
 }
 for(const level of [10,15,20,25])assert.equal(v2EpicRaidBoxChance({level,rankIndex:0,enabled:true}),null)
})
test('integration preserves direct equipment odds, owner bonuses and RaidLote discount',()=>{
 const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 assert.ok(games.includes("enabled:rebootEconomyEnabled()&&cfg.box==='caixa_epica'"))
 assert.ok(games.includes('boxChance=Math.min(.85,loteReduced?raidLoteGearChance(boxChance):(lote?boxChance:boxChance*ownerDrop))'))
 assert.ok(games.includes('const chance=expandedV2GearChance(cfg,loteReduced?raidLoteGearChance(normalChance):normalChance)'))
})
