import test from 'node:test'
import assert from 'node:assert/strict'
import {petPvpSpecialty,petCombatSpecialty} from '../src/neon/game-catalog.js'

test('Fênix Celestial cura o jogador com metade da cura escalada e preserva Boss/Raid',()=>{
  const raid=petCombatSpecialty('fenix_celestial')
  const pvp=petPvpSpecialty('fenix_celestial',49)
  assert.equal(raid.healPct,.08)
  assert.equal(pvp.healCooldown,4)
  assert.ok(pvp.healPct>.04 && pvp.healPct<.05)
  assert.ok(pvp.defense>.03 && pvp.defense<.04)
  assert.ok(pvp.dodge>0 && pvp.dodge<=.05)
})
test('Pet de dano não ganha cura e respeita bônus reduzidos',()=>{
  const pet=petPvpSpecialty('leao_solar',100)
  assert.equal(pet.healPct,0)
  assert.equal(pet.healCooldown,0)
  assert.ok(pet.damage>0 && pet.damage<=.045)
  assert.ok(pet.crit>0 && pet.crit<=.045)
})
test('Cervo e Unicórnio preservam intervalos distintos',()=>{
  assert.equal(petPvpSpecialty('cervo_mistico',100).healCooldown,5)
  assert.equal(petPvpSpecialty('unicornio',100).healCooldown,4)
})
test('Esquiva de PvP tem teto absoluto de 5%',()=>{
  for(const species of ['fenix_celestial','grifo_celestial','fenix_eclipse']){
    assert.ok(petPvpSpecialty(species,100).dodge<=.05)
  }
})
test('Bônus de drop, XP e dano Boss não vazam para PvP',()=>{
  const pet=petPvpSpecialty('dragao',100)
  assert.equal(pet.damage,0)
  assert.equal(pet.healPct,0)
  assert.equal(pet.dodge,0)
})
