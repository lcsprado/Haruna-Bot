import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PECADOS_HEROES} from '../src/neon/sete-pecados-catalog.js'
import {heroCombatStats,heroPvpAttack,heroPvpDefense,heroEffectiveCombatHp,heroHpToPersistent} from '../src/neon/playable-heroes-core.js'
const code=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const start=code.indexOf('export async function battle(')
const end=code.indexOf('\nexport ',start+16)
const battle=start<0?'':code.slice(start,end<0?code.length:end)
const base={hp:5071,max_hp:3071,atk:1000,def:800,spd:420,equipment_hp:2000,class_hp_bonus:0,class_atk_bonus:0,class_def_bonus:0,class_spd_bonus:0}

test('seven heroes have bounded pure offensive and defensive techniques',()=>{
 assert.equal(PECADOS_HEROES.length,7)
 for(const hero of PECADOS_HEROES){
  const stats=heroCombatStats(base,hero.species,100)
  assert.ok(stats?.maxHp>0,hero.species)
  const hp=heroEffectiveCombatHp(base,stats,2000)
  assert.equal(hp,stats.maxHp+2000)
  for(const stage of [1,3,5]){
   const attack=heroPvpAttack({heroId:hero.species,damage:500,attackIndex:3,masteryStage:stage,state:{},hp,maxHp:stats.maxHp+2000,gear:{}})
   assert.ok(Number.isFinite(attack.damage)&&attack.damage>=0,hero.species)
   const defended=heroPvpDefense({heroId:hero.species,damage:attack.damage,state:{},gear:{}})
   assert.ok(Number.isFinite(defended.damage)&&defended.damage>=0,hero.species)
  }
 }
 assert.equal(heroHpToPersistent(5131,5131,5071),5071)
})
test('BLOCKER A03: Web PvP engine must read active hero and mastery from database',()=>{
 assert.match(battle,/FROM player_hero_mode m/)
 assert.match(battle,/player_hero_mastery_unlocks/)
 assert.match(battle,/heroCombatStats/)
})
test('BLOCKER A03: Web PvP uses skills, equipment, class substitution and correct persistence',()=>{
 assert.match(battle,/heroPvpAttack/)
 assert.match(battle,/heroPvpDefense/)
 assert.match(battle,/heroCollabGearBonus/)
 assert.match(battle,/heroEffectiveCombatHp/)
 assert.match(battle,/heroHpToPersistent/)
 assert.match(battle,/heroPersistentMaxHp/)
})
