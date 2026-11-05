import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {VITAL_PETS} from '../src/neon/vital-pets.js'
import {PET_STATUS_SPECIALTIES} from '../src/neon/game-catalog.js'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const block=db.slice(db.indexOf('export const LEGENDARY_PET_SUMMONS=['),db.indexOf('export async function raid50DragonGuaranteeStatus(jid)'))
const altarRows=[...block.matchAll(/\{materialId:'([^']+)',[^\n]+pets:\[([\s\S]*?)\n\]\}/g)]

test('API knows the same five Vital species and stat profiles as WhatsApp',()=>{
  assert.equal(VITAL_PETS.length,5)
  assert.equal(new Set(VITAL_PETS.map(p=>p.species)).size,5)
  assert.match(db,/Object\.fromEntries\(VITAL_PETS\.map\(p=>\[p\.species,\{base:p\.hpBase,growth:p\.hpGrowth,type:p\.type\}\]\)\)/)
  for(const pet of VITAL_PETS){
    assert.equal(pet.chance,8)
    assert.equal(PET_STATUS_SPECIALTIES[pet.species]?.raid,true)
    const altar=altarRows.find(([,material])=>material===pet.materialId)
    assert.ok(altar,'Expected raid altar for '+pet.species)
    assert.match(altar[2],new RegExp("species:'"+pet.species+"',name:'[^']+',chance:8,power:"+pet.power))
  }
})

test('all ten raid altars preserve 100% total summon odds',()=>{
  assert.equal(altarRows.length,10)
  for(const [,material,body] of altarRows){
    const odds=[...body.matchAll(/\{species:'[^']+',name:'[^']+',chance:(\d+),power:\d+\}/g)].map(x=>Number(x[1]))
    assert.equal(odds.reduce((a,b)=>a+b,0),100,material)
  }
})

test('Seven Sins remain playable heroes but do not leak through pet catalog or bootstrap',()=>{
  assert.match(api,/PECADOS_HERO_IDS\.includes\(String\(p\.species\|\|''\)\)/)
  assert.match(api,/pets:visiblePets,petTeam:visibleTeam/)
  assert.ok(!Object.keys(PET_STATUS_SPECIALTIES).some(x=>x.startsWith('pecado_')))
})
