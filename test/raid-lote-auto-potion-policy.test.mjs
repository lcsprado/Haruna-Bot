import test from 'node:test'
import assert from 'node:assert/strict'
import {
  raidLoteAutoPotionNeeded,raidLoteAutoPotionTargetHeal,
  RAID_LOTE_AUTO_POTION_TRIGGER_PCT,RAID_LOTE_AUTO_POTION_TARGET_PCT
} from '../src/neon/raid-lote-auto-potion-policy.js'

test('Raidlote aciona cura preventiva aos 40% HP ou abaixo, sem esperar HP zerar',()=>{
  assert.equal(RAID_LOTE_AUTO_POTION_TRIGGER_PCT,40)
  assert.equal(raidLoteAutoPotionNeeded({mode:'lote',hp:400,maxHp:1000}),true)
  assert.equal(raidLoteAutoPotionNeeded({mode:'lote',hp:399,maxHp:1000}),true)
  assert.equal(raidLoteAutoPotionNeeded({mode:'lote',hp:401,maxHp:1000}),false)
  assert.equal(raidLoteAutoPotionNeeded({mode:'lote',hp:0,maxHp:1000}),false)
})

test('Raid manual nao recebe a nova cura preventiva',()=>{
  assert.equal(raidLoteAutoPotionNeeded({mode:'manual',hp:100,maxHp:1000}),false)
  assert.equal(raidLoteAutoPotionNeeded({mode:undefined,hp:100,maxHp:1000}),false)
})

test('cura Raidlote busca a menor poção suficiente para sair de 40% e chegar a 55%',()=>{
  assert.equal(RAID_LOTE_AUTO_POTION_TARGET_PCT,55)
  assert.equal(raidLoteAutoPotionTargetHeal({hp:350,maxHp:1000}),200)
  assert.equal(raidLoteAutoPotionTargetHeal({hp:207,maxHp:657}),155)
  assert.equal(raidLoteAutoPotionTargetHeal({hp:0,maxHp:1000}),550)
})

test('nao aciona automacao com HP invalido e preserva alvo seguro',()=>{
  for(const pair of [{hp:Infinity,maxHp:1000},{hp:1,maxHp:0},{hp:NaN,maxHp:1000},{hp:100,maxHp:Infinity}]){
    assert.equal(raidLoteAutoPotionNeeded({mode:'lote',...pair}),false)
  }
  assert.equal(raidLoteAutoPotionTargetHeal({hp:100,maxHp:0}),0)
})
