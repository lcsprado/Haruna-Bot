import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname,resolve} from 'node:path'
import {LEGENDARY_BOX_GEAR,LEGENDARY_BOX_WEIGHTS,pickLegendaryBoxGear} from '../src/neon/legendary-box-gear.js'
import {PECADOS_WEAPONS,PECADOS_ARMORS} from '../src/neon/sete-pecados-catalog.js'
const base=dirname(fileURLToPath(import.meta.url))
const db=readFileSync(resolve(base,'../src/neon/db.js'),'utf8')
const original=['excalibur','katana_divina','armadura_titan','armadura_divina','bota_celestial']

test('adiciona exatamente três itens por slot e 12 IDs novos',()=>{
  assert.equal(LEGENDARY_BOX_GEAR.length,12)
  assert.equal(new Set(LEGENDARY_BOX_GEAR.map(g=>g.id)).size,12)
  for(const category of ['weapon','armor','helmet','boots']){
    assert.equal(LEGENDARY_BOX_GEAR.filter(g=>g.category===category).length,3)
  }
  for(const item of LEGENDARY_BOX_GEAR){
    assert.ok(item.name&&item.description)
    assert.ok(item.id.endsWith('20261030'))
    assert.ok(item.crit>=0&&item.crit<=.07)
  }
})

test('novas armas e armaduras são superiores às comuns, inferiores aos equipamentos da collab',()=>{
  const weapons=LEGENDARY_BOX_GEAR.filter(g=>g.category==='weapon')
  const armors=LEGENDARY_BOX_GEAR.filter(g=>g.category==='armor')
  assert.ok(weapons.every(x=>x.atk>135))
  assert.ok(armors.every(x=>x.def>135))
  assert.ok(weapons.every(x=>x.atk<Math.max(...PECADOS_WEAPONS.map(w=>w.atk))))
  assert.ok(armors.every(x=>x.def<Math.min(...PECADOS_ARMORS.map(a=>a.def))))
  assert.ok(LEGENDARY_BOX_GEAR.filter(g=>g.category==='helmet').every(x=>x.def>112))
  assert.ok(LEGENDARY_BOX_GEAR.filter(g=>g.category==='boots').every(x=>x.spd>10))
})

test('registro de catálogo e combate usa mecanismo de equipamentos existente',()=>{
  assert.match(db,/import \{LEGENDARY_BOX_GEAR,pickLegendaryBoxGear\} from '\.\/legendary-box-gear\.js'/)
  assert.match(db,/starterItems\.push\(\.\.\.LEGENDARY_BOX_GEAR\.map\(g=>\[g\.id,g\.name,g\.description,g\.category,0,'legendary'\]\)\)/)
  assert.match(db,/Object\.fromEntries\(LEGENDARY_BOX_GEAR\.map\(\(\{id,description,\.\.\.gear\}\)=>\[id,gear\]\)\)/)
  assert.match(db,/export function getEquipmentInfo\(itemId\)/)
  assert.match(db,/export function equipmentStatsAtLevel\(itemId,level=1,stars=1\)/)
})

test('garantia lendária e chances de caixas não lendárias preservadas',()=>{
  assert.match(db,/caixa_lendaria: \{\s*label:'Caixa Lendária',minRarity:'legendary',legendary:1/)
  assert.match(db,/const itemId=rarity==='legendary'&&\(boxId==='caixa_lendaria'\|\|boxId==='caixa_epica'\)/)
  assert.match(db,/\?pickLegendaryBoxGear\(LOOT_POOLS\.legendary\)\s*:pick\(LOOT_POOLS\[rarity\]\)/)
  assert.match(db,/legendary:\['excalibur','katana_divina','armadura_titan','armadura_divina','bota_celestial'\]/)
  for(const item of LEGENDARY_BOX_GEAR)assert.ok(!original.includes(item.id))
})

test('todos os 17 equipamentos têm a mesma chance individual por Caixa Lendária',()=>{
  assert.deepEqual(LEGENDARY_BOX_WEIGHTS,{existing:1,new:1})
  const all=[...original,...LEGENDARY_BOX_GEAR.map(item=>item.id)]
  const total=all.length
  assert.equal(total,17)
  assert.equal(new Set(all).size,17)
  assert.equal(LEGENDARY_BOX_WEIGHTS.existing/total,LEGENDARY_BOX_WEIGHTS.new/total)
  assert.equal(1/total,1/17)
  for(let i=0;i<total;i++){
    assert.equal(pickLegendaryBoxGear(original,()=>(i+.5)/total),all[i],
      'faixa equiprovável '+i+' corresponde ao equipamento '+all[i])
  }
  assert.equal(pickLegendaryBoxGear(original,()=>0),all[0])
  assert.equal(pickLegendaryBoxGear(original,()=>.999999),all[16])
  assert.throws(()=>pickLegendaryBoxGear(original,()=>1))
})

test('Caixa Épica mantém chance mínima lendária e sorteia os mesmos 17 equipamentos',()=>{
  assert.match(db,/caixa_epica: \{\s*label:'Caixa Épica',\s*minRarity:'rare',\s*legendary:0\.01/)
  assert.match(db,/cashChance:0\.12,\s*expChance:0\.08/)
  assert.match(db,/const itemId=rarity==='legendary'&&\(boxId==='caixa_lendaria'\|\|boxId==='caixa_epica'\)/)
  assert.match(db,/\?pickLegendaryBoxGear\(LOOT_POOLS\.legendary\)\s*:pick\(LOOT_POOLS\[rarity\]\)/)
  const rawLegendaryChance=0.01
  const itemPathProbability=1-0.12-0.08
  const oddsAnyLegendary=itemPathProbability*rawLegendaryChance
  const oddsEach=oddsAnyLegendary/(original.length+LEGENDARY_BOX_GEAR.length)
  assert.ok(Math.abs(oddsAnyLegendary-0.008)<1e-12)
  assert.ok(Math.abs(oddsEach-0.008/17)<1e-12)
  assert.equal(LEGENDARY_BOX_WEIGHTS.existing,LEGENDARY_BOX_WEIGHTS.new)
})
