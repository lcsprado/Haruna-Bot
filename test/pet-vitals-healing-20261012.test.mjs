import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PET_STATUS_SPECIALTIES} from '../src/neon/game-catalog.js'
import {PECADOS_HEROES} from '../src/neon/sete-pecados-catalog.js'

const dbText=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const botText=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const vitalsCode=dbText.slice(dbText.indexOf('const PET_BASE_ENERGY='),dbText.indexOf('function normalizedPetHp(')).replace(/^export /gm,'')
const {PET_BASE_ENERGY,PET_HP_PROFILES,petMaxEnergy,petMaxHp}=new Function('PECADOS_HEROES',vitalsCode+';return {PET_BASE_ENERGY,PET_HP_PROFILES,petMaxEnergy,petMaxHp}')(PECADOS_HEROES)
const statusText=botText.slice(botText.indexOf('function petStatusBonus(p){'),botText.indexOf('async function start()'))
const petStatusBonus=new Function('PET_STATUS_SPECIALTIES','petSpeedBonus',statusText+';return petStatusBonus')(PET_STATUS_SPECIALTIES,()=>0)

const repaired={
  oraculo_pedra:[1987,533],
  pantera_vulcanica:[2101,553],
  espectro_abissal:[2106,563],
  kraken_aco:[2666,573],
  esfinge_titanica:[2438,583],
  quimera_abissal:[2443,583],
  paladino_astral:[2661,598],
  lince_celestial:[2547,598],
  arcanjo_eclipse:[2666,618],
  morcego_madrugada:[2661,628],
  camaleao_lendario:[2666,623]
}

test('Todas as espécies cadastradas possuem perfil próprio de HP e energia',()=>{
  for(const species of Object.keys(PET_STATUS_SPECIALTIES)){
    assert.ok(Object.hasOwn(PET_HP_PROFILES,species),'HP ausente: '+species)
    assert.ok(Object.hasOwn(PET_BASE_ENERGY,species),'energia ausente: '+species)
  }
})

test('11 pets corrigidos têm vitalidade esperada no Nv.100 e no Nv.1',()=>{
  for(const [species,[hp,energy]] of Object.entries(repaired)){
    assert.equal(petMaxHp(100,9900,species),hp,'HP '+species)
    assert.equal(petMaxEnergy(100,species),energy,'energia '+species)
    assert.equal(petMaxHp(1,0,species),PET_HP_PROFILES[species].base,species)
    assert.equal(petMaxEnergy(1,species),PET_BASE_ENERGY[species],species)
    assert.ok(petMaxHp(100,9900,species)>1194,'não herda Cachorro: '+species)
  }
})

test('Pets existentes não sofrem alteração nas fichas',()=>{
  assert.equal(petMaxHp(100,9900,'dragao'),2309)
  assert.equal(petMaxEnergy(100,'dragao'),518)
  assert.equal(petMaxHp(100,9900,'fenix_alpha'),3231)
  assert.equal(petMaxEnergy(100,'fenix_alpha'),698)
})

test('Menu mostra a cura efetiva por nível, sem alterar o efeito real',()=>{
  assert.match(petStatusBonus({species:'fenix_celestial',level:1}).text,/cura 8% HP/)
  assert.match(petStatusBonus({species:'fenix_celestial',level:100}).text,/cura 10% HP/)
  assert.match(petStatusBonus({species:'unicornio',level:100}).text,/cura 9% HP/)
  assert.match(petStatusBonus({species:'fenix_eclipse',level:100}).text,/cura 11,3% HP/)
  assert.match(petStatusBonus({species:'arcanjo_eclipse',level:100}).text,/cura 6,3% HP/)
})

test('Reparação do banco só executa uma vez por ficha e preserva pets derrotados',()=>{
  assert.match(dbText,/await fixLegacyPetVitals\(\)/)
  assert.match(dbText,/p\.max_hp IS DISTINCT FROM \$\{expectedHp\}/)
  assert.match(dbText,/CASE WHEN COALESCE\(p\.hp,0\)<=0 THEN 0/)
  assert.match(dbText,/for\(const table of \['pet_collection','pets'\]\)/)
})
