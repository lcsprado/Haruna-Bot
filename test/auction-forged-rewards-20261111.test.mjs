import test from 'node:test'
import assert from 'node:assert/strict'
import {grantAuctionInventoryItem,AUCTION_FORGE_CATEGORIES} from '../src/neon/auction-forged-rewards.js'

function dbFor(category='shield',name='Égide de Teste'){
 const statements=[]
 const client={
  async query(query,values=[]){
   const sql=String(query)
   statements.push({sql,values})
   if(sql.startsWith('SELECT name,category FROM items'))return {rows:name?[{name,category}]:[]}
   if(sql.includes('SELECT COALESCE(MAX(level),1)'))return {rows:[{level:1}]}
   if(sql.startsWith('SELECT level,stars FROM equipment_star_forges'))return {rows:[{level:10,stars:5}]}
   return {rows:[],rowCount:1}
  }
 }
 return {client,statements}
}
const inventory=records=>records.filter(x=>x.sql.startsWith('INSERT INTO inventories'))
const forge=records=>records.filter(x=>x.sql.includes('INSERT INTO equipment_star_forges'))
const effective=records=>records.filter(x=>x.sql.includes('INSERT INTO equipment_upgrades'))

test('Escudo de leilão é entregue já forjado ★5 Lv.10 e nível efetivo sincronizado',async()=>{
 const {client,statements}=dbFor('shield')
 const result=await grantAuctionInventoryItem(client,'player','egide_crepusculo',1)
 assert.deepEqual({qty:result.qty,forged:result.forged},{qty:1,forged:true})
 assert.match(result.description,/FORJADO ★★★★★ Lv.10/)
 assert.equal(inventory(statements).length,1)
 assert.equal(forge(statements).length,1)
 assert.match(forge(statements)[0].sql,/VALUES\(\$1,\$2,5,10/)
 assert.deepEqual(forge(statements)[0].values,['player','egide_crepusculo'])
 assert.equal(effective(statements).length,1)
 assert.deepEqual(effective(statements)[0].values,['player','egide_crepusculo',10])
})

test('Qualquer categoria equipável recebe forja máxima, mas não todas as cópias extras',async()=>{
 for(const category of AUCTION_FORGE_CATEGORIES){
  const {client,statements}=dbFor(category)
  const result=await grantAuctionInventoryItem(client,'player','equip-test',2)
  assert.equal(result.forged,true,category)
  assert.equal(forge(statements).length,1,category)
  assert.equal(inventory(statements)[0].values[2],2,category)
 }
})

test('Consumíveis, caixas, materiais, vales e relíquias não recebem estrelas',async()=>{
 for(const category of ['special','consumable','material','relic']){
  const {client,statements}=dbFor(category,'Vale de Teste')
  const result=await grantAuctionInventoryItem(client,'player','voucher',1)
  assert.equal(result.forged,false,category)
  assert.equal(forge(statements).length,0,category)
  assert.equal(effective(statements).length,0,category)
  assert.equal(inventory(statements).length,1,category)
 }
})

test('Prêmio inexistente ou quantidade inválida não é entregue parcialmente',async()=>{
 const a=dbFor('shield',null)
 await assert.rejects(()=>grantAuctionInventoryItem(a.client,'player','missing',1),/não encontrado/)
 assert.equal(inventory(a.statements).length,0)
 const b=dbFor('shield')
 await assert.rejects(()=>grantAuctionInventoryItem(b.client,'player','egide_crepusculo',0),/inválida/)
 await assert.rejects(()=>grantAuctionInventoryItem(b.client,'player','egide_crepusculo',1.5),/inválida/)
 assert.equal(b.statements.length,0)
})
