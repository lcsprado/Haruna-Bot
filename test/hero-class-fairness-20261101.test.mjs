import test from 'node:test'
import assert from 'node:assert/strict'
import {PLAYER_CLASSES,SELECTABLE_PLAYER_CLASS_IDS,classCritBonus,classAttack,classDefense} from '../src/neon/game-catalog.js'
import {HERO_COMBAT_PROFILES,heroCombatStats,heroCollabGearBonus,heroPvpAttack,heroPvpDefense,heroAttack,heroDefense,PLAYABLE_HERO_IDS} from '../src/neon/playable-heroes-core.js'
import {PECADOS_EQUIPMENT,PECADOS_WEAPONS,PECADOS_ARMORS} from '../src/neon/sete-pecados-catalog.js'

const heroBasics={
  pecado_meliodas:[770,93,110,38],pecado_ban:[800,89,111,40],
  pecado_escanor:[785,96,110,32],pecado_king:[800,86,117,35],
  pecado_diane:[830,87,122,30],pecado_gowther:[760,90,109,39],
  pecado_merlin:[770,93,109,38]
}
test('todos os heróis Nv.100 usam a MESMA progressão, sem vantagens extras no nível',()=>{
  const sample={hp:3000,max_hp:3000,atk:600,def:400,spd:300,
    class_hp_bonus:0,class_atk_bonus:0,class_def_bonus:0,class_spd_bonus:0}
  assert.equal(PLAYABLE_HERO_IDS.length,7)
  for(const id of PLAYABLE_HERO_IDS){
    const h=heroCombatStats(sample,id,100),p=HERO_COMBAT_PROFILES[id],b=heroBasics[id]
    assert.ok(b,id+' precisa de um baseline revisado')
    assert.deepEqual(h.breakdown.training,{hp:700,atk:75,def:100,spd:25})
    assert.deepEqual([h.maxHp-3000,h.atk-600,h.def-400,h.spd-300],b)
    assert.deepEqual([b[0]-700,b[1]-75,b[2]-100,b[3]-25],[p.hp,p.atk,p.def,p.spd])
  }
})
test('4 classes selecionáveis têm bônus-base únicos e não recebem maestria de colaboração',()=>{
  assert.deepEqual(SELECTABLE_PLAYER_CLASS_IDS,['paladin','necromancer','samurai','berserker'])
  for(const id of SELECTABLE_PLAYER_CLASS_IDS){
    const c=PLAYER_CLASSES[id]
    assert.ok(c&&c.hp>0&&c.atk>0&&c.def>0&&c.spd>0,id)
    assert.equal(PLAYABLE_HERO_IDS.includes(id),false)
    const normal=classAttack({classId:id,damage:1000,critical:false,context:'pvp',awakeningStage:1,roll:1})
    const full=classAttack({classId:id,damage:1000,critical:false,context:'pvp',awakeningStage:5,roll:1})
    assert.equal(full.damage,normal.damage,'Despertar de classe não modifica a fórmula de PvP')
    assert.equal(classDefense({classId:id,damage:1000,context:'pvp',awakeningStage:5,roll:1}).damage,
      classDefense({classId:id,damage:1000,context:'pvp',awakeningStage:1,roll:1}).damage)
  }
  assert.equal(classCritBonus('samurai',true,5,'pvp'),0)
  assert.equal(classCritBonus('samurai',true,5,'raid'),.02)
})
test('cada arma/armadura da collab recebe bônus EXCLUSIVO somente com herói correspondente',()=>{
  assert.equal(PECADOS_EQUIPMENT.length,14)
  for(let index=0;index<7;index++){
    const id=PLAYABLE_HERO_IDS[index]
    const weapon=PECADOS_WEAPONS[index]?.id,armor=PECADOS_ARMORS[index]?.id
    assert.ok(weapon&&armor,id)
    const raid=heroCollabGearBonus(id,weapon,armor,'raid')
    const pvp=heroCollabGearBonus(id,weapon,armor,'pvp')
    assert.deepEqual([raid.weapon,raid.armor,raid.attack,raid.defense],[true,true,.04,.04],id)
    assert.deepEqual([pvp.weapon,pvp.armor,pvp.attack,pvp.defense],[true,true,.015,.02],id)
    const mismatched=heroCollabGearBonus(id,PECADOS_WEAPONS[(index+1)%7].id,PECADOS_ARMORS[(index+1)%7].id,'raid')
    assert.deepEqual([mismatched.weapon,mismatched.armor,mismatched.attack,mismatched.defense],[false,false,0,0],id)
  }
})
test('DEF do conjunto Ban, King e Gowther soma a passiva com a armadura no Boss/Raid',()=>{
  const expected={
    pecado_meliodas:[1000,960],pecado_ban:[980,940],pecado_escanor:[1000,960],
    pecado_king:[970,930],pecado_diane:[960,920],pecado_gowther:[970,930],pecado_merlin:[1000,960]
  }
  for(const [id,[naked,armored]] of Object.entries(expected)){
    const alone=heroDefense({heroId:id,damage:1000}).damage
    const equipped=heroDefense({heroId:id,damage:1000,gear:{defense:.04}}).damage
    assert.equal(alone,naked,id+' natural')
    assert.equal(equipped,armored,id+' armored')
    assert.equal(alone-equipped,40,id+' deve conservar integralmente +4 p.p. da armadura')
  }
})
test('PvP não herda redução PvE e respeita limite de 10% e incremento de maestria',()=>{
  for(const id of PLAYABLE_HERO_IDS){
    const naked=heroPvpDefense({heroId:id,damage:1000}).damage
    const armored=heroPvpDefense({heroId:id,damage:1000,gear:{defense:.02}}).damage
    assert.ok(naked>=900&&naked<=1000,id+' unarmored')
    assert.equal(naked-armored,20,id+' matching armor should add 2pp PvP')
    const hit=heroPvpAttack({heroId:id,damage:1000,masteryStage:5})
    assert.ok(hit.damage>=1000&&hit.damage<=1080,id+' has capped offensive passive')
    const raid=heroAttack({heroId:id,damage:1000,masteryStage:5})
    assert.ok(raid.damage>=1000&&raid.damage<=1350,id+' has capped PvE offensive passive')
  }
})
