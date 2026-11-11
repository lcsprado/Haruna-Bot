// Regressões de catálogo dos equipamentos/pets históricos; sem inicializar evento encerrado.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname,resolve} from 'node:path'
import {PET_STATUS_SPECIALTIES,petCombatSpecialty} from '../src/neon/game-catalog.js'
const base=dirname(fileURLToPath(import.meta.url))
const read=name=>readFileSync(resolve(base,'../'+name),'utf8')
const legacyEvent=read('src/neon/auction-eclipse-20261030.js')
const db=read('src/neon/db.js')


test('pet único usa apenas estatísticas existentes, com sinergia Predador',()=>{
  const sp=PET_STATUS_SPECIALTIES.manticora_eclipse_20261030
  assert.ok(sp)
  assert.deepEqual(sp.stats,{damage:10.5,crit:7,speed:5})
  assert.equal(sp.raid,true)
  assert.equal(petCombatSpecialty('manticora_eclipse_20261030').damage,.105)
  assert.match(db,/manticora_eclipse_20261030:'predador'/)
  assert.match(db,/manticora_eclipse_20261030:\{base:310,growth:23,type:'Ofensivo — Lendário Místico'\}/)
  assert.match(db,/PET_SPEED_BASE=\{[^\n]*manticora_eclipse_20261030:5/)
  assert.doesNotMatch(sp.label,/Coringa|veneno|sangramento/i)
})

test('Foice tem atributos que o motor realmente calcula e é equipável',()=>{
  assert.match(db,/foice_eclipse_mistico_20261030:\s*\{category:'weapon',atk:140,def:0,hp:0,spd:10,crit:\.04/)
  assert.match(legacyEvent,/\['foice_eclipse_mistico_20261030','Foice do Eclipse'/)
  assert.match(legacyEvent,/\['helmet','boots','weapon'\]\.includes\(category\)/)
})

