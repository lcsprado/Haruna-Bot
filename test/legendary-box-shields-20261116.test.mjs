import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ANTI_CRIT_SHIELDS,LEGENDARY_BOX_SHIELD_IDS,antiCritShieldStats,shieldForgeCost} from '../src/neon/anti-crit-shields.js'
import {LEGENDARY_BOX_GEAR,pickLegendaryBoxGear} from '../src/neon/legendary-box-gear.js'
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const original=['excalibur','katana_divina','armadura_titan','armadura_divina','bota_celestial']
const expected=[
  ['escudo_monarca_caido_20261116','Escudo do Monarca Caído',.09,.15],
  ['muralha_abismo_imperial_20261116','Muralha do Abismo Imperial',.105,.125],
  ['baluarte_trovao_eterno_20261116','Baluarte do Trovão Eterno',.10,.14]
]
test('três escudos têm nomes aprovados, atributos anti-crítico e raridade lendária',()=>{
 assert.deepEqual([...LEGENDARY_BOX_SHIELD_IDS],expected.map(x=>x[0]))
 assert.equal(new Set(ANTI_CRIT_SHIELDS.map(s=>s.id)).size,ANTI_CRIT_SHIELDS.length)
 for(const [id,name,resist,guard] of expected){
   const s=ANTI_CRIT_SHIELDS.find(x=>x.id===id)
   assert.ok(s,id)
   assert.equal(s.name,name)
   assert.equal(s.category,'shield')
   assert.equal(s.rarity,'legendary')
   assert.equal(s.price,0)
   assert.equal(s.critResist,resist)
   assert.equal(s.critGuard,guard)
   assert.equal(s.atk,undefined)
   assert.equal(s.def,undefined)
   assert.equal(shieldForgeCost(id,1),80000)
   assert.equal(shieldForgeCost(id,4),320000)
   assert.equal(shieldForgeCost(id,5),null)
   assert.equal(antiCritShieldStats(id,1,1).critResist,resist)
   assert.ok(antiCritShieldStats(id,10,5).critResist>=resist)
   assert.ok(antiCritShieldStats(id,10,5).critResist<=.20)
   assert.ok(antiCritShieldStats(id,10,5).critGuard<=.30)
   assert.doesNotMatch(name,/fênix|fenix/i)
 }
})
test('Caixa Lendária: vinte possibilidades iguais, três escudos com 15% total',()=>{
 assert.equal(LEGENDARY_BOX_GEAR.length,12)
 const ids=[...original,...LEGENDARY_BOX_GEAR.map(x=>x.id),...LEGENDARY_BOX_SHIELD_IDS]
 assert.equal(ids.length,20)
 assert.equal(new Set(ids).size,20)
 for(let i=0;i<20;i++)assert.equal(pickLegendaryBoxGear(original,()=>(i+.5)/20,{includeShields:true}),ids[i])
 assert.equal(LEGENDARY_BOX_SHIELD_IDS.length/ids.length,.15)
})
test('Caixa Épica continua com os 17 antigos, sem os novos escudos',()=>{
 const ids=[...original,...LEGENDARY_BOX_GEAR.map(x=>x.id)]
 for(let i=0;i<17;i++){
   const roll=()=>(i+.5)/17
   assert.equal(pickLegendaryBoxGear(original,roll),ids[i])
   assert.equal(pickLegendaryBoxGear(original,roll,{includeShields:false}),ids[i])
 }
 assert.match(db,/includeShields:boxId==='caixa_lendaria'/)
 assert.match(db,/caixa_lendaria: \{\s*label:'Caixa Lendária',minRarity:'legendary',legendary:1/)
 assert.match(db,/starterItems\.push\(\.\.\.ANTI_CRIT_SHIELDS\.map\(g=>\[g\.id,g\.name,g\.description,'shield',g\.price,g\.rarity\]\)\)/)
 assert.match(db,/Object\.fromEntries\(ANTI_CRIT_SHIELDS\.map/)
 assert.match(db,/\[\.\.\.Object\.keys\(RAID_GEAR_FORGE_ORIGINS\),\.\.\.ANTI_CRIT_SHIELDS\.map\(g=>g\.id\)\]/)
})
