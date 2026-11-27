import test from 'node:test'
import assert from 'node:assert/strict'
import {raidPetDamageMultiplier,mitigateRaidPetDamage,estimatedRaidPetHit} from '../src/neon/raid-pet-mitigation.js'

test('V2 raid 40 automatic pet damage and healing estimate are reduced together',()=>{
  const automatic={enabled:true,mode:'lote'}
  const manual={enabled:true,mode:'manual'}
  assert.equal(raidPetDamageMultiplier(40,automatic),.15)
  assert.equal(mitigateRaidPetDamage(40,30,automatic),5)
  assert.equal(estimatedRaidPetHit(40,75,automatic),7)
  assert.equal(mitigateRaidPetDamage(40,30,manual),11)
  assert.equal(estimatedRaidPetHit(40,75,manual),16)
  assert.equal(mitigateRaidPetDamage(40,0,automatic),0)
  assert.equal(mitigateRaidPetDamage(40,1,automatic),1)
})
test('other raids and legacy rules are unchanged',()=>{
  for(const level of [10,15,20,25,30,50,60,65,70,75]){
    assert.equal(raidPetDamageMultiplier(level,{enabled:true,mode:'lote'}),raidPetDamageMultiplier(level,{enabled:true,mode:'manual'}))
  }
  assert.equal(raidPetDamageMultiplier(40,{enabled:false,mode:'lote'}),1)
  assert.equal(raidPetDamageMultiplier(40,{enabled:true}),.35)
})
