import test from 'node:test'
import assert from 'node:assert/strict'
import {persistHeroHpDelta} from '../src/neon/playable-heroes-core.js'

const onePointHits=()=>{
 let hp=5200,combat=7000,remainder=0
 for(let i=0;i<10;i++){
  const next=persistHeroHpDelta({previousPersistentHp:hp,previousCombatHp:combat,currentCombatHp:combat-1,
   combatMaxHp:7000,persistentMaxHp:5200,remainder})
  hp=next.hp;remainder=next.remainder;combat--
 }
 return {hp,combat,remainder}
}
test('dez golpes de 1 no heroi cheio custam 7 HP persistido; nao sao gratuitos',()=>{
 const result=onePointHits()
 assert.equal(result.hp,5193)
 assert.equal(result.combat,6990)
 assert.ok(result.remainder<0)
})
test('dano parcelado e golpe unico convertem HP em mesma escala',()=>{
 const multi=onePointHits()
 const single=persistHeroHpDelta({previousPersistentHp:5200,previousCombatHp:7000,currentCombatHp:6990,
 combatMaxHp:7000,persistentMaxHp:5200,remainder:0})
 assert.equal(multi.hp,single.hp)
 assert.ok(Math.abs(multi.remainder-single.remainder)<1e-9)
})
test('cura que atinge HP total nao carrega credito para ataques posteriores',()=>{
 const r=persistHeroHpDelta({previousPersistentHp:5000,previousCombatHp:6800,currentCombatHp:7000,
 combatMaxHp:7000,persistentMaxHp:5200,remainder:-.25})
 assert.equal(r.hp,5200); assert.equal(r.remainder,0)
 const hit=persistHeroHpDelta({previousPersistentHp:r.hp,previousCombatHp:7000,currentCombatHp:6999,
 combatMaxHp:7000,persistentMaxHp:5200,remainder:r.remainder})
 assert.ok(hit.remainder<0)
})
test('morte zera HP e resto fracionario; dano zero nao retira HP',()=>{
 const a=persistHeroHpDelta({previousPersistentHp:2,previousCombatHp:3,currentCombatHp:0,
 combatMaxHp:7000,persistentMaxHp:5200,remainder:-.4})
 assert.deepEqual(a,{hp:0,remainder:0})
 const b=persistHeroHpDelta({previousPersistentHp:2000,previousCombatHp:3000,currentCombatHp:3000,
 combatMaxHp:7000,persistentMaxHp:5200,remainder:0})
 assert.deepEqual(b,{hp:2000,remainder:0})
})
