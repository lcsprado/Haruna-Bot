import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {planLootBatch} from '../src/neon/loot-batch-plan.js'
const drop=(itemId,name,qty=1,rarity='rare')=>({itemId,name,qty,rarity})
const owned=(item_id,quantity,sellable_quantity=quantity,more={})=>({
  item_id,name:item_id,quantity,sellable:true,
  sellable_quantity,upgraded_copies:[],forged_level:0,...more
})
test('vende todos os drops não protegidos por um lote sem mutar input',()=>{
  const items=[drop('pocao_g','Poção Grande',2),drop('manto_fenix','Manto da Fênix',1,'epic'),drop('elixir_supremo','Elixir Supremo',1)]
  const inv=[owned('pocao_g',2),owned('manto_fenix',1),owned('elixir_supremo',1)]
  const before=JSON.stringify({items,inv})
  const result=planLootBatch(items,inv)
  assert.deepEqual(result.selections,[{itemId:'pocao_g',qty:2},{itemId:'manto_fenix',qty:1},{itemId:'elixir_supremo',qty:1}])
  assert.deepEqual(result.failures,[])
  assert.equal(JSON.stringify({items,inv}),before)
})
test('cópias forjadas e upadas ficam protegidas; apenas extras são vendáveis',()=>{
  const items=[drop('bota_relampago','Bota do Relâmpago',1,'epic')]
  const inv=[owned('bota_relampago',5,5,{upgraded_copies:[{level:10,quantity:1}],forged_level:0})]
  assert.deepEqual(planLootBatch(items,inv).selections,[{itemId:'bota_relampago',qty:1}])
  assert.equal(planLootBatch([drop('bota_relampago','Bota do Relâmpago',5,'epic')],inv).selections.length,0)
  const forged=[owned('espada','Espada',1,1,{forged_level:1,upgraded_copies:[]})]
  assert.equal(planLootBatch([drop('espada','Espada')],forged).selections.length,0)
})
test('nunca vende cópia equipada, vinculada, item bloqueado ou lendário',()=>{
  const items=[drop('eq','Equipado'),drop('bound','Vinculado'),drop('private','Especial'),drop('rare','Lendário',1,'legendary')]
  const inv=[owned('eq',1,0),owned('bound',2,0),owned('private',1,1,{sellable:false}),owned('rare',1)]
  const result=planLootBatch(items,inv)
  assert.equal(result.selections.length,0)
  assert.equal(result.failures.length,3)
})
test('drop já processado não é vendido de novo nem anunciado como intacto',()=>{
  const result=planLootBatch([drop('pocao_g','Poção Grande',2)],[owned('pocao_g',0,0)])
  assert.deepEqual(result.selections,[])
  assert.match(result.failures[0],/processado|protegido/)
})
test('agrega duplicatas do mesmo item e não permite vender acima da quantidade',()=>{
  const items=[drop('item','Poção',1),drop('item','Poção',2)]
  assert.deepEqual(planLootBatch(items,[owned('item',4)]).selections,[{itemId:'item',qty:3}])
  assert.equal(planLootBatch(items,[owned('item',2)]).selections.length,0)
})
test('respeita filtro de raridade',()=>{
  const items=[drop('a','A',1,'common'),drop('b','B',1,'epic'),drop('c','C',1,'legendary')]
  const result=planLootBatch(items,items.map(i=>owned(i.itemId,1)),i=>i.rarity==='epic')
  assert.deepEqual(result.selections,[{itemId:'b',qty:1}])
})
test('menu em massa é consumido antes de qualquer venda assíncrona',()=>{
  const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  const pos=src.indexOf('const claimId=String(flow.data?.claimId')
  assert.ok(pos>0)
  const section=src.slice(pos,pos+1300)
  const add=section.indexOf('claimedLootBatchIds.add(claimId)')
  const clear=section.indexOf('clearQuickFlow(chat,sender)')
  const sell=section.indexOf('await sellLootBatch(sender,items,predicate)')
  assert.ok(add>=0&&clear>add&&sell>clear)
  assert.match(src,/async function sellLootBatch\(sender,items,predicate\)/)
  assert.match(src,/await sellItemsBatch\(sender,group\)/)
})
