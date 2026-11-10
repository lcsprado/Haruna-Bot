import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const marketSource=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const loanSource=readFileSync(new URL('../src/neon/loans.js',import.meta.url),'utf8')
function onlyFunction(source,name){
  const pos=source.indexOf('export async function '+name+'(')
  assert.ok(pos>=0,'Missing '+name)
  const end=source.indexOf('\nexport ',pos+24)
  assert.ok(end>pos,'Missing end '+name)
  return source.slice(pos,end).replace(/^export /,'')
}
const marketFn=onlyFunction(marketSource,'createMarketListing')
const loanFn=onlyFunction(loanSource,'collectOverdueLoansForBorrower')

function marketFixture({quantity=1,equipped=true,requested=1}={}){
 const writes=[],queries=[]
 const itemId='escudo_defesa_raro',jid='player'
 const client={async query(sql,params=[]){
   const q=String(sql).replace(/\s+/g,' ').trim()
   queries.push({q,params})
   if(q.startsWith('SELECT sellable,category,rarity FROM items'))
     return {rows:[{sellable:true,category:'shield',rarity:'rare'}]}
   if(q.startsWith('SELECT quantity FROM inventories'))
     return {rows:[{quantity}]}
   if(q.startsWith('SELECT weapon_id,armor_id,boot_id,helmet_id,shield_id FROM stats'))
     return {rows:[{weapon_id:null,armor_id:null,boot_id:null,helmet_id:null,shield_id:equipped?itemId:null}]}
   if(q.startsWith('SELECT (SELECT COALESCE(SUM(quantity),0)::int FROM equipment_upgrade_copies'))
     return {rows:[{qty:0}]}
   if(q.startsWith('UPDATE inventories SET quantity=')){
     writes.push({type:'inventory',params})
     return {rowCount:1}
   }
   if(q.startsWith('INSERT INTO market_listings(')){
     writes.push({type:'listing',params})
     return {rows:[{id:13,item_id:itemId,quantity:requested}]}
   }
   throw Error('Unexpected market query '+q.slice(0,180))
 }}
 const create=vm.runInNewContext(marketFn+'\ncreateMarketListing',{
   expireMarketListings:async()=>{},transaction:async fn=>fn(client),
   raidMaterialId:()=>false,boundItemQuantity:async()=>0,
   Date,Math,Number
 })
 return {run:()=>create(jid,itemId,requested,1000),writes,queries}
}
test('AB-06: escudo único equipado jamais pode ser anunciado pela Web',async()=>{
 const x=marketFixture()
 await assert.rejects(x.run(),/cópia equipada está protegida/)
 assert.equal(x.writes.length,0)
 assert.ok(x.queries.some(q=>q.q.includes('shield_id FROM stats')))
})
test('AB-06: várias cópias só podem anunciar as livres; nunca a equipada',async()=>{
 const all=marketFixture({quantity:2,requested:2})
 await assert.rejects(all.run(),/cópia equipada está protegida/)
 assert.equal(all.writes.length,0)
 const one=marketFixture({quantity:2,requested:1})
 const receipt=await one.run()
 assert.equal(receipt.quantity,1)
 assert.deepEqual(one.writes.map(w=>w.type),['inventory','listing'])
 assert.equal(one.writes[0].params[0],1)
})
test('AB-06: escudo não equipado é elegível às regras gerais de venda',async()=>{
 const x=marketFixture({quantity:1,equipped:false})
 const r=await x.run()
 assert.equal(r.id,13)
 assert.equal(x.writes.length,2)
})
test('AB-05: sem empréstimo vencido Web não abre transação e não bloqueia carteiras',async()=>{
 let transactions=0,writes=0,readQueries=[]
 const check=vm.runInNewContext(loanFn+'\ncollectOverdueLoansForBorrower',{
   db:{async query(sql,args){readQueries.push(String(sql));return {rowCount:0,rows:[]}}},
   tx:async()=>{transactions++;throw Error('Não deveria abrir transação')},
   Math,Number
 })
 const r=await check('player')
 assert.equal(r.paid,0)
 assert.equal(transactions,0)
 assert.equal(writes,0)
 assert.equal(readQueries.length,1)
 assert.match(readQueries[0],/SELECT 1 FROM player_loans/)
 assert.doesNotMatch(readQueries[0],/FOR UPDATE/)
})
test('AB-05: empréstimo vencido conserva processamento sob transação com FOR UPDATE',async()=>{
 const queries=[]
 const check=vm.runInNewContext(loanFn+'\ncollectOverdueLoansForBorrower',{
   db:{async query(){return {rowCount:1}}},
   tx:async callback=>callback({async query(sql){
     queries.push(String(sql))
     return {rows:[],rowCount:0}
   }}),Math,Number
 })
 const r=await check('player')
 assert.equal(r.paid,0)
 assert.equal(queries.length,1)
 assert.match(queries[0],/ORDER BY due_at ASC LIMIT 1 FOR UPDATE/)
})
test('AB-05 e AB-06: preservados limites financeiros e locks de compras cruzadas',()=>{
 assert.match(loanSource,/const paid=Math.min\(amount,due,available\)/)
 assert.match(marketSource,/SELECT jid,cash,bank FROM wallets WHERE jid=ANY\(\$1::text\[\]\) ORDER BY jid FOR UPDATE/)
 assert.match(marketFn,/shield_id/)
})
