import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {POCO_ABISMO_GEAR,POCO_ABISMO_GEAR_IDS} from '../src/neon/poco-abismo-gear.js'
import {POCO_GEAR} from '../src/neon/poco-abismo-rules.js'
import {ANTI_CRIT_SHIELDS,antiCritShieldStats} from '../src/neon/anti-crit-shields.js'
import {selectEffectiveGear} from '../src/neon/equipment-star-logic.js'

const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')

test('cinco categorias e identificadores são compatíveis com tabela do evento',()=>{
 assert.deepEqual(POCO_ABISMO_GEAR.map(x=>x.category),['weapon','armor','helmet','shield','boots'])
 assert.deepEqual(POCO_ABISMO_GEAR_IDS,POCO_GEAR.map(x=>x.id))
 for(const gear of POCO_ABISMO_GEAR){
  assert.equal(gear.rarity,'legendary')
  assert.ok(gear.description.includes('Lv.10'))
 }
})
test('atributos preservam vantagem moderada sobre peças recentes',()=>{
 const [weapon,armor,helmet,shield,boots]=POCO_ABISMO_GEAR
 assert.ok(weapon.atk>220 && weapon.atk<=231)
 assert.ok(armor.def>190 && armor.def<=200)
 assert.ok(helmet.def>135 && helmet.def<=142)
 assert.ok(shield.critResist>.12 && shield.critResist<=.126)
 assert.ok(boots.spd<=19 && boots.spd>=16)
})
test('escudo novo aparece no catálogo anti-crítico e aceita 5 estrelas',()=>{
 const shield=POCO_ABISMO_GEAR.find(g=>g.category==='shield')
 assert.ok(ANTI_CRIT_SHIELDS.some(x=>x.id===shield.id))
 const full=antiCritShieldStats(shield.id,10,5)
 assert.ok(full.critResist>=.19 && full.critResist<=.20)
 assert.ok(full.critGuard>=.29 && full.critGuard<=.30)
 assert.deepEqual(selectEffectiveGear(1,10,5,shield.id),{level:10,stars:5})
})
test('inventário reconhece itens e o multiplicador das estrelas da peça entregue',()=>{
 assert.match(source,/starterItems\.push\(\.\.\.POCO_ABISMO_GEAR/)
 assert.match(source,/POCO_ABISMO_GEAR_IDS\.includes\(itemId\)/)
 assert.match(source,/POCO_ABISMO_GEAR\.map\(\(\{id,description,rarity,price,\.\.\.gear\}\)/)
 assert.match(source,/sellable=FALSE,stackable=FALSE,price=0 WHERE id=ANY/)
 assert.match(source,/equipmentStatsAtLevel\(p\.boot_id,levels\[p\.boot_id\]\|\|1,stars\[p\.boot_id\]\|\|1\)/)
 assert.match(source,/equipmentStatsAtLevel\(a\.boot_id,eqLevel\(attackerJid,a\.boot_id\),starLevel\(attackerJid,a\.boot_id\)\)/)
})
test('peça isolada não libera forja manual gratuita ou cópias doadoras',()=>{
 assert.ok(!source.includes('POCO_ABISMO_GEAR_IDS.map(id=>[id,Object.freeze({raidLevel:'))
 assert.equal(POCO_ABISMO_GEAR_IDS.length,new Set(POCO_ABISMO_GEAR_IDS).size)
})

test('nomes exclusivos não reciclam temas genéricos dos equipamentos antigos',()=>{
 assert.deepEqual(POCO_ABISMO_GEAR.map(x=>x.name),[
  'Cortajuramentos',
  'Couraça das Cem Cicatrizes',
  'Elmo do Vigia Sem Olhos',
  'Escudo das Correntes Partidas',
  'Botas do Retorno Impossível'
 ])
 const used=POCO_ABISMO_GEAR.map(x=>x.name.toLowerCase())
 for(const name of used){
  assert.doesNotMatch(name,/abismo|eclipse|eternidade|vazio|soberano/)
 }
 assert.equal(new Set(used).size,5)
})
