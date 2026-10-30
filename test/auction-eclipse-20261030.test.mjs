import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname,resolve} from 'node:path'
import {PET_STATUS_SPECIALTIES,petCombatSpecialty} from '../src/neon/game-catalog.js'
import {PECADOS_ESSENCES} from '../src/neon/sete-pecados-catalog.js'
const base=dirname(fileURLToPath(import.meta.url))
const read=name=>readFileSync(resolve(base,'../'+name),'utf8')
const auction=read('src/neon/auction-eclipse-20261030.js')
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
  assert.match(auction,/\['foice_eclipse_mistico_20261030','Foice do Eclipse'/)
  assert.match(auction,/\['helmet','boots','weapon'\]\.includes\(category\)/)
})

test('leilão público de 14h em quatro lotes de 2 minutos, sem pré-anúncio',()=>{
  assert.match(auction,/const START=Date\.parse\('2026-10-30T14:00:00-03:00'\)/)
  assert.match(auction,/const DURATION=LOT_DURATION_MS/)
  assert.match(auction,/const LOT_OPENINGS=\[10000000,6000000,12000000,8000000\]/)
  assert.match(auction,/prizesPublic:true/)
  assert.match(auction,/publicCatalog\(createPublicLots\(\)\)/)
  assert.doesNotMatch(auction,/if\(now>=START-10\*60\*1000/)
  assert.match(auction,/const STEP=500000/)
  assert.match(auction,/const KEY='leilao_eclipse_pecados_20261030_1400_v1'/)
})

test('ordem dos lotes e sete essências distintas respeitadas',()=>{
  const posPet=auction.indexOf("[{pet:'manticora_eclipse_20261030'")
  const posCofre=auction.indexOf("[{id:'caixa_lendaria',qty:4}")
  const posArma=auction.indexOf("[{id:'foice_eclipse_mistico_20261030',qty:1}]")
  const posCollab=auction.indexOf("PECADOS_ESSENCES.map(id=>({id,qty:1}))")
  assert.ok(posPet>=0&&posPet<posCofre&&posCofre<posArma&&posArma<posCollab)
  assert.equal(PECADOS_ESSENCES.length,7)
  assert.equal(new Set(PECADOS_ESSENCES).size,7)
  assert.match(auction,/every\(id=>items\.some\(x=>x\.id===id&&x\.qty===1\)\)/)
  assert.match(read('src/neon/index.js'),/from '\.\/auction-eclipse-20261030\.js'/)
  assert.match(read('src/neon/web-api.js'),/from '\.\/auction-eclipse-20261030\.js'/)
})
