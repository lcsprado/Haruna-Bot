import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const dbSource=fs.readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const webApiSource=fs.readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const start=dbSource.indexOf('async function reconcileWebSaleCopies(')
const end=dbSource.indexOf('export async function sellItem(',start)
assert.ok(start>=0&&end>start,'Web sale reconciliation function must exist')
const reconcile=new Function(dbSource.slice(start,end)+';return reconcileWebSaleCopies')()

function mock({tiers=[],forge=null,binds=[]}={}){
  const data={tiers:tiers.map(x=>({...x})),forge:forge?{...forge}:null,binds:binds.map(x=>({...x}))}
  const client={async query(sql,args){
    if(sql.startsWith('SELECT level,quantity FROM equipment_upgrade_copies'))return {rows:data.tiers.map(x=>({...x}))}
    if(sql.startsWith('SELECT stars,level FROM equipment_star_forges'))return {rows:data.forge?[{...data.forge}]:[]}
    if(sql.startsWith('DELETE FROM equipment_upgrade_copies')){data.tiers=data.tiers.filter(x=>x.level!==args[2]);return {rows:[]}}
    if(sql.startsWith('UPDATE equipment_upgrade_copies SET')){data.tiers.find(x=>x.level===args[2]).quantity-=args[3];return {rows:[]}}
    if(sql.startsWith('DELETE FROM equipment_star_forges')){data.forge=null;return {rows:[]}}
    if(sql.startsWith('SELECT source_key,quantity FROM bound_inventory_items'))return {rows:data.binds.map(x=>({...x}))}
    if(sql.startsWith('DELETE FROM bound_inventory_items')){data.binds=data.binds.filter(x=>x.source_key!==args[2]);return {rows:[]}}
    if(sql.startsWith('UPDATE bound_inventory_items SET')){data.binds.find(x=>x.source_key===args[2]).quantity-=args[3];return {rows:[]}}
    throw new Error('Unexpected query: '+sql)
  }}
  return {client,data}
}

test('Web inventory action permits non-equipped special items without removing WhatsApp protections',()=>{
  assert.match(webApiSource,/case 'item\.sell': return sellItem\([^\n]*allowAnyUnequipped:true/)
  assert.match(dbSource,/item\.sellable===false&&!webSale/)
  assert.match(dbSource,/const sellable=Math\.max\(0,owned-Math\.max\(equipped,bound\)\)/)
  assert.match(dbSource,/const bound=webSale\?0:await boundItemQuantity/)
  assert.match(dbSource,/activeRelic===itemId/)
})

test('keeps equipped forged equipment while selling all four other copies',async()=>{
  const {client,data}=mock({
    tiers:[{level:3,quantity:1},{level:10,quantity:2}],
    forge:{level:10,stars:5},
    binds:[{source_key:'collab',quantity:5}]
  })
  await reconcile(client,'player','item',5,4,1)
  assert.equal(data.forge.stars,5)
  assert.deepEqual(data.tiers,[])
  assert.equal(data.binds.reduce((sum,row)=>sum+row.quantity,0),1)
})

test('regular equipped copy is never consumed when duplicates are sold',async()=>{
  const {client,data}=mock()
  await reconcile(client,'player','weapon',10,9,1)
  assert.equal(data.tiers.length,0)
  assert.equal(data.forge,null)
})

test('unequipped upgraded and forged copies may all be sold',async()=>{
  const {client,data}=mock({tiers:[{level:10,quantity:1}],forge:{level:10,stars:4}})
  await reconcile(client,'player','weapon',3,3,0)
  assert.deepEqual(data.tiers,[])
  assert.equal(data.forge,null)
})

test('inconsistent upgraded-copy metadata cancels sale instead of deleting wrong copy',async()=>{
  const {client}=mock({tiers:[{level:10,quantity:3}]})
  await assert.rejects(()=>reconcile(client,'player','weapon',2,1,0),/inconsistentes/)
})
