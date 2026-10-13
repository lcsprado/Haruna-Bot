import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {petCombatSpecialty,petPvpSpecialty} from '../src/neon/game-catalog.js'
import {petCollectionDetailText} from '../src/neon/pet-collection-menu.js'

const approx=(value,expected)=>assert.ok(Math.abs(value-expected)<1e-10,`expected ${expected}, got ${value}`)

test('Raid 60 Fera do Caos é ofensiva, sem alterar Dragão comprado por 1 milhão',()=>{
  const fera=petCombatSpecialty('fera_caos')
  const dragao=petCombatSpecialty('dragao')
  assert.equal(fera.damage,.10)
  assert.equal(fera.crit,.07)
  assert.equal(fera.bossDamage,0)
  assert.equal(dragao.damage,0)
  assert.equal(dragao.bossDamage,.10)
  assert.equal(dragao.defense,.04)
  approx(petPvpSpecialty('fera_caos',100).crit,.07*1.25*.30)
})

test('Predadores 60, 65 e 70 preservam progressão de crítico sem escalada de dano',()=>{
  const fera=petCombatSpecialty('fera_caos')
  const pantera=petCombatSpecialty('pantera_profundezas')
  const lobo=petCombatSpecialty('lobo_eclipse')
  assert.deepEqual([fera.damage,pantera.damage,lobo.damage],[.10,.10,.10])
  assert.ok(fera.crit<pantera.crit)
  assert.ok(pantera.crit<lobo.crit)
  approx(petPvpSpecialty('pantera_profundezas',100).crit,.075*1.25*.30)
  approx(petPvpSpecialty('lobo_eclipse',100).crit,.08*1.25*.30)
})

test('Bônus do menu crescem até o nível 100 com mesma regra do combate',()=>{
  const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(source,/const maxGrowth=spec\.raid\?\.25:\.50/)
  assert.match(source,/Number\(p\.level\|\|1\)-1\)\*\(maxGrowth\/99\)/)
  assert.doesNotMatch(source,/Number\(p\.level\|\|1\)-1\)\*\.01/)
})

test('Poder é explicitamente diferenciado do bônus no Boss/Raid',()=>{
  const msg=petCollectionDetailText({id:1,species:'fera_caos',name:'Fera do Caos',level:60,xp:5900,power:305,hp:1200,energy:450})
  assert.match(msg,/Poder serve para duelos de pets/)
  assert.match(msg,/não aumenta o dano no Boss\/Raid/)
  const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(source,/Poder influencia duelos de pets, mas não aumenta o dano no Boss\/Raid/)
})
