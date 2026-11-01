import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {heroCombatSheetFromProfile,heroEffectiveCombatHp,heroCombatStats,heroHpToPersistent} from '../src/neon/playable-heroes-core.js'
import {PECADOS_HERO_IDS} from '../src/neon/sete-pecados-catalog.js'

const profile={max_hp:3071,hp:5071,equipment_hp:2000,atk:1200,def:980,spd:420,level:340}
test('all seven playable heroes show full HP when persistent player is full with gear',()=>{
 for(const hero of PECADOS_HERO_IDS){
  const sheet=heroCombatSheetFromProfile(profile,hero,100)
  assert.ok(sheet,hero+' sheet missing')
  assert.equal(sheet.hp,sheet.maxHp,hero+' must start fully healed')
 }
})
test('the reported Diane synthetic case has a 100% HP ratio, not 3131/5131',()=>{
 const stats={maxHp:3131}
 assert.equal(heroEffectiveCombatHp(profile,stats,2000),5131)
 const sheet=heroCombatSheetFromProfile(profile,'pecado_diane',100)
 assert.equal(sheet.hp,sheet.maxHp)
})
test('zero, partial, full, overheal, negative, and equipment-free HP stay in legal bounds',()=>{
 const cases=[{hp:0,ratio:0},{hp:2535,ratio:.5},{hp:5071,ratio:1},{hp:8000,ratio:1},{hp:-100,ratio:0}]
 for(const c of cases){
  const value=heroEffectiveCombatHp({...profile,hp:c.hp},{maxHp:3131},2000)
  assert.ok(value>=0&&value<=5131)
  assert.ok(Math.abs(value/5131-c.ratio)<.002,JSON.stringify({c,value}))
 }
 assert.equal(heroEffectiveCombatHp({hp:3071,max_hp:3071},{maxHp:3131},0),3131)
 assert.equal(heroEffectiveCombatHp({hp:0,max_hp:3071},{maxHp:3131},0),0)
})
test('sheet remains an immutable display projection and supports different hero levels',()=>{
 for(const lv of [1,50,70,100]){
  const source={...profile}
  const sheet=heroCombatSheetFromProfile(source,'pecado_ban',lv)
  assert.equal(sheet.hp,sheet.maxHp)
  assert.deepEqual(source,profile)
 }
 assert.equal(heroCombatSheetFromProfile(profile,'invalid_hero',100),null)
 assert.equal(heroHpToPersistent(0,5131,5071),0)
})
test('Web character snapshot and Combat Sheet use same helper',()=>{
 const source=readFileSync(new URL('../src/neon/playable-heroes-core.js',import.meta.url),'utf8')
 const compat=readFileSync(new URL('../src/neon/web-playable-heroes-compat.js',import.meta.url),'utf8')
 assert.match(source,/hp:heroEffectiveCombatHp\(profile,h,profile\.equipment_hp\)/)
 assert.match(compat,/heroCombatSheetFromProfile\(combatProfile,active\.id,active\.petLevel\)/)
})
