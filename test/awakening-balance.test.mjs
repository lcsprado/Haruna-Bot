import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAYER_CLASSES, AWAKENING_CLASS_SKILLS, classAttack, classDefense,
  classCritBonus, getAwakeningSkillDescriptions
} from '../src/neon/game-catalog.js'

const boss=(classId,stage,params={})=>classAttack({
  classId,awakeningStage:stage,context:'boss',damage:500,attackIndex:8,
  hp:350,maxHp:1000,roll:.999,critical:false,...params
})
const defense=(classId,stage,params={})=>classDefense({
  classId,awakeningStage:stage,context:'raid',damage:100,hp:350,maxHp:1000,
  roll:.999,...params
})
test('as dez classes têm tres habilidades e passivas anteriores preservadas',()=>{
  assert.equal(Object.keys(PLAYER_CLASSES).length,10)
  for(const id of Object.keys(PLAYER_CLASSES)){
    assert.equal(getAwakeningSkillDescriptions(id).length,3)
    assert.ok(AWAKENING_CLASS_SKILLS[id].every(Boolean))
  }
})
test('nenhum Despertar é ativado no PvP nem sem aplicar classe',()=>{
  for(const classId of Object.keys(PLAYER_CLASSES)){
    const args={classId,damage:500,critical:true,hp:350,maxHp:1000,attackIndex:8,
      context:'pvp',roll:.999,lastProcAttack:0}
    const a=classAttack({...args,awakeningStage:0})
    const b=classAttack({...args,awakeningStage:5})
    assert.equal(a.damage,b.damage,classId)
    assert.equal(a.heal,b.heal,classId)
    assert.equal(classCritBonus(classId,true,0,'pvp'),classCritBonus(classId,true,5,'pvp'))
    assert.equal(defense(classId,0,{context:'pvp'}).damage,
                 defense(classId,5,{context:'pvp'}).damage,classId)
    assert.equal(boss(classId,3,{applied:false}).damage,boss(classId,0,{applied:false}).damage)
  }
})
test('Paladino cura apenas abaixo de 50% e somente a cada 8 golpes',()=>{
  assert.equal(boss('paladin',0).heal,0)
  assert.equal(boss('paladin',1).heal,30)
  assert.equal(boss('paladin',1,{hp:600}).heal,0)
  assert.equal(boss('paladin',1,{hp:0}).heal,0)
  assert.equal(boss('paladin',1,{attackIndex:7}).heal,0)
  assert.equal(boss('paladin',2).damage,600)
  assert.ok(defense('paladin',3).damage<defense('paladin',0).damage)
  assert.equal(defense('paladin',3,{hp:900}).damage,defense('paladin',0,{hp:900}).damage)
})
test('Necromante não acumula roubo de vida e Druida regenera com teto',()=>{
  const base=boss('necromancer',0,{attackIndex:4,damage:900,hp:200})
  const first=boss('necromancer',1,{attackIndex:4,damage:900,hp:200})
  const third=boss('necromancer',3,{attackIndex:4,damage:900,hp:200})
  assert.deepEqual([base.heal,first.heal,third.heal],[18,27,36])
  assert.equal(boss('druid',0,{attackIndex:8}).heal,0)
  assert.equal(boss('druid',1,{attackIndex:8}).heal,20)
  assert.equal(boss('druid',3,{attackIndex:8}).heal,30)
  assert.equal(boss('druid',3,{attackIndex:8,hp:997}).heal,3)
})
test('Assassino acumula críticos até uma única Execução e Monge contra-ataca depois de esquiva',()=>{
  let state={}
  for(let i=1;i<=3;i++){
    const r=boss('assassin',2,{attackIndex:i,critical:true,awakeningState:state})
    state=r.awakeningState
  }
  assert.equal(state.finisherReady,true)
  const last=boss('assassin',2,{attackIndex:4,awakeningState:state})
  assert.equal(last.damage,600)
  assert.equal(last.awakeningState.finisherReady,false)

  const blocked=defense('monk',2,{roll:.04})
  assert.equal(blocked.damage,0)
  assert.equal(blocked.awakeningState.counterReady,true)
  const reply=boss('monk',2,{awakeningState:blocked.awakeningState})
  assert.equal(reply.damage,560)
  assert.equal(reply.awakeningState.counterReady,false)
})
test('Berserker tem limite condicional: não multiplica dano com HP alto',()=>{
  assert.equal(boss('berserker',3,{hp:900}).damage,boss('berserker',0,{hp:900}).damage)
  const low=boss('berserker',3,{hp:200}).damage
  const unawakened=boss('berserker',0,{hp:200}).damage
  assert.ok(low>unawakened)
  assert.ok(low<=Math.round(unawakened*1.25))
})
function rng(seed){return ()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296}}
function simulate(classId,stage,count,ratio,context='raid'){
  const rollCrit=rng(911),rollBase=rng(1231),rollProc=rng(4321),rollDodge=rng(891)
  let damage=0,received=0,healed=0,lastProcAttack=0,state={}
  for(let i=1;i<=count;i++){
    const crit=rollCrit()<Math.min(.45,.20+classCritBonus(classId,true,stage,context))
    const base=Math.round(500*(.8+rollBase()*.4)*(crit?1.5:1))
    const hit=classAttack({classId,awakeningStage:stage,context,damage:base,
      critical:crit,hp:1500*ratio,maxHp:1500,attackIndex:i,
      lastProcAttack,awakeningState:state,roll:rollProc()})
    lastProcAttack=hit.lastProcAttack
    damage+=hit.damage
    healed+=hit.heal
    const def=classDefense({classId,awakeningStage:stage,context,
      damage:100,hp:1500*ratio,maxHp:1500,roll:rollDodge(),
      awakeningState:hit.awakeningState})
    state=def.awakeningState
    received+=def.damage
  }
  return {damage,received,healed}
}
test('simulação com 100/300/1000 golpes: dano e defesa limitados; sem efeitos no PvP',()=>{
  for(const classId of Object.keys(PLAYER_CLASSES)){
    for(const count of [100,300,1000]){
      for(const ratio of [.9,.35,.2]){
        const before=simulate(classId,0,count,ratio),after=simulate(classId,3,count,ratio)
        assert.ok(after.damage>=before.damage*.97,`${classId}: queda anormal no dano`)
        assert.ok(after.damage<=before.damage*1.15,`${classId}: aumento ofensivo excessivo`)
        assert.ok(after.received>=before.received*.85,`${classId}: defesa excessiva`)
        assert.ok(after.healed>=before.healed,`${classId}: regeneração inferior`)
        assert.deepEqual(simulate(classId,0,count,ratio,'pvp'),
                         simulate(classId,3,count,ratio,'pvp'),`${classId}: PvP alterado`)
      }
    }
  }
})
