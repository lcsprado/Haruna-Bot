import test from 'node:test'
import assert from 'node:assert/strict'
import {raidPetDamageMultiplier,mitigateRaidPetDamage,estimatedRaidPetHit,raidPlayerDefenseCoefficient} from '../src/neon/raid-pet-mitigation.js'

test('V2 pet sustain is reduced only in raids 40 and 50',()=>{
 const tiers=[10,15,20,25,30,40,50,60,65,70,75]
 assert.deepEqual(tiers.map(l=>raidPetDamageMultiplier(l,{enabled:true})),[1,1,1,1,1,.35,.30,1,1,.08,.7])
 assert.deepEqual(tiers.map(l=>raidPetDamageMultiplier(l,{enabled:false})),[1,1,1,1,1,1,1,1,1,.7,.7])
 for(const l of [40,50]){
  assert.equal(raidPlayerDefenseCoefficient(l,{enabled:true}),.22)
  assert.equal(mitigateRaidPetDamage(l,0,{enabled:true}),0)
  assert.equal(mitigateRaidPetDamage(l,1,{enabled:true}),1)
 }
 assert.equal(mitigateRaidPetDamage(40,100,{enabled:true}),35)
 assert.equal(mitigateRaidPetDamage(50,100,{enabled:true}),30)
 assert.equal(estimatedRaidPetHit(40,75,{enabled:true}),16)
 assert.equal(estimatedRaidPetHit(50,108,{enabled:true}),20)
})
