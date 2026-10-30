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
  assert.match(db,/const itemId=boxId==='caixa_lendaria'&&rarity==='legendary'/)
  assert.match(db,/\?pickLegendaryBoxGear\(LOOT_POOLS\.legendary\)\s*:pick\(LOOT_POOLS\[rarity\]\)/)
  assert.match(db,/legendary:\['excalibur','katana_divina','armadura_titan','armadura_divina','bota_celestial'\]/)
  for(const item of LEGENDARY_BOX_GEAR)assert.ok(!original.includes(item.id))
})

test('probabilidade de cada novo lendário é 20% inferior à de cada atual',()=>{
  assert.deepEqual(LEGENDARY_BOX_WEIGHTS,{existing:10,new:8})
  const total=original.length*10+LEGENDARY_BOX_GEAR.length*8
  assert.equal(total,146)
  assert.equal((8/total)/(10/total),.8)
  assert.equal(pickLegendaryBoxGear(original,()=>0),original[0])
  assert.equal(pickLegendaryBoxGear(original,()=>49.5/146),original[4])
  assert.equal(pickLegendaryBoxGear(original,()=>50/146),LEGENDARY_BOX_GEAR[0].id)
  assert.equal(pickLegendaryBoxGear(original,()=>.999999),LEGENDARY_BOX_GEAR[11].id)
  assert.throws(()=>pickLegendaryBoxGear(original,()=>1))
})
