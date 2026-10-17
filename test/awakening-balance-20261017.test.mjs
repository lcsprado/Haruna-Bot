import test from 'node:test'
import assert from 'node:assert/strict'
import {classAttack,classDefense,getAwakeningSkillDescriptions} from '../src/neon/game-catalog.js'

const attack=(classId,stage,index,options={})=>classAttack({
  classId,awakeningStage:stage,context:'raid',damage:1000,
  attackIndex:index,hp:500,maxHp:2000,roll:1,...options
})
const defend=(classId,stage,options={})=>classDefense({
  classId,awakeningStage:stage,context:'raid',
  damage:1000,hp:500,maxHp:2000,roll:1,...options
})

test('todas as dez classes mantêm cinco habilidades de Despertar',()=>{
  for(const id of ['warrior','assassin','mage','archer','paladin','berserker','monk','necromancer','druid','samurai'])
    assert.equal(getAwakeningSkillDescriptions(id).length,5,id)
})

test('Mago carrega mana a cada seis ataques sem depender de proc e descarrega na Explosão',()=>{
  const charged=attack('mage',5,6)
  assert.equal(charged.awakeningState.arcaneCharges,1)
  const burst=attack('mage',5,8,{awakeningState:charged.awakeningState})
  assert.equal(burst.damage,1480)
  assert.equal(burst.awakeningState.arcaneCharges,0)
  assert.equal(burst.awakeningState.awakeningShield,80)
  assert.equal(attack('mage',2,8).damage,1200)
})

test('Monge recebe Chi regular no III, com cura maior no V',()=>{
  const stage2=attack('monk',2,8)
  const stage3=attack('monk',3,8)
  const stage5=attack('monk',5,8)
  assert.equal(stage2.heal,0)
  assert.equal(stage3.heal,40)
  assert.equal(stage5.heal,60)
  assert.equal(stage5.awakeningState.monkChi,0)
})

test('Assassino só executa depois de três críticos; o V aumenta a Execução',()=>{
  let state={}
  for(let index=1;index<=3;index++)
    state=attack('assassin',5,index,{critical:true,awakeningState:state}).awakeningState
  assert.equal(state.finisherReady,true)
  const exec=attack('assassin',5,4,{awakeningState:state})
  assert.equal(exec.damage,1450)
  assert.equal(exec.awakeningState.critsAccumulated,1)
  assert.equal(attack('assassin',5,5,{awakeningState:exec.awakeningState}).damage,1060)
})

test('Necromante cria escudo ósseo de 2,5% do HP máximo na drenagem, somente do IV em diante',()=>{
  const stage3=attack('necromancer',3,4)
  const stage4=attack('necromancer',4,4)
  assert.equal(stage3.awakeningState.awakeningShield,undefined)
  assert.equal(stage4.awakeningState.awakeningShield,50)
})

test('Intervenção Divina salva o Paladino uma única vez e deixa 15% HP e 8% escudo',()=>{
  const saved=defend('paladin',5,{damage:5000,hp:100})
  assert.equal(100-saved.damage+saved.healAfter,300)
  assert.equal(saved.awakeningState.awakeningShield,160)
  assert.equal(saved.awakeningState.paladinMiracleUsed,true)
  const second=defend('paladin',5,{damage:5000,hp:300,awakeningState:saved.awakeningState})
  assert.equal(second.healAfter,0)
  assert.equal(second.awakeningState.paladinMiracleUsed,true)
})

test('habilidades de despertar não afetam PvP',()=>{
  for(const id of ['warrior','assassin','mage','archer','paladin','berserker','monk','necromancer','druid','samurai']){
    const normal=classAttack({classId:id,awakeningStage:0,context:'pvp',damage:1000,hp:500,maxHp:2000,attackIndex:8,roll:1})
    const max=classAttack({classId:id,awakeningStage:5,context:'pvp',damage:1000,hp:500,maxHp:2000,attackIndex:8,roll:1})
    assert.equal(max.damage,normal.damage,id)
    assert.equal(max.heal,normal.heal,id)
  }
})

test('dano, cura e proteção permanecem finitos em todos os Despertares',()=>{
  for(const id of ['warrior','assassin','mage','archer','paladin','berserker','monk','necromancer','druid','samurai']){
    for(let stage=0;stage<=5;stage++){
      let state={},lastProcAttack=0
      for(let index=1;index<=100;index++){
        const a=attack(id,stage,index,{critical:index%4===0,awakeningState:state,lastProcAttack,roll:index%13===0?0:1})
        lastProcAttack=a.lastProcAttack
        const d=defend(id,stage,{damage:100,awakeningState:a.awakeningState,roll:index%20===0?0:1})
        assert.ok(Number.isFinite(a.damage)&&a.damage>=1,id)
        assert.ok(Number.isFinite(a.heal)&&a.heal>=0,id)
        assert.ok(Number.isFinite(d.damage)&&d.damage>=0,id)
        state=d.awakeningState
      }
    }
  }
})
