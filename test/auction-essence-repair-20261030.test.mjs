import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {eligibleAuctionEssenceWinner,repairAuctionEssences,AUCTION_ESSENCE_REPAIR_KEY} from '../src/neon/auction-essence-repair-20261030.js'

const auction=()=>({
  phase:'completed',
  lots:[{prize:[{id:'essencia_pecado_preguica',qty:7},{id:'caixa_lendaria',qty:1}]}],
  history:[{lot:0,winner:{jid:'winner',bid:1050000},
    rewards:['Essência de Preguica ×7','Caixa Lendária ×1']}]
})
function fakeDatabase({state=auction(),quantity=7,done=false}={}){
  const calls=[]
  let marker=done
  const c={
    async query(sql,params=[]){
      calls.push({sql,params})
      if(sql.startsWith('SELECT value FROM trevo_settings WHERE key'))return {rows:[{value:state}],rowCount:1}
      if(sql.startsWith('SELECT jid FROM users'))return {rows:[{jid:'winner'}],rowCount:1}
      if(sql.startsWith('SELECT key FROM trevo_settings WHERE key'))return {rows:marker?[{key:AUCTION_ESSENCE_REPAIR_KEY}]:[],rowCount:marker?1:0}
      if(sql.startsWith('SELECT quantity FROM inventories'))return {rows:[{quantity}],rowCount:1}
      if(sql.startsWith('UPDATE inventories SET quantity=quantity-6')){
        if(quantity<7)return {rows:[],rowCount:0}
        quantity-=6
        return {rows:[{quantity}],rowCount:1}
      }
      if(sql.startsWith('INSERT INTO trevo_settings'))marker=true
      return {rows:[],rowCount:1}
    },
    release(){}
  }
  return {pool:{connect:async()=>c},calls,get quantity(){return quantity}}
}
test('lote 1 requer resultado de leilao completo e prova da entrega original',()=>{
  assert.equal(eligibleAuctionEssenceWinner(auction()),'winner')
  const missing=auction()
  missing.history[0].rewards=[]
  assert.equal(eligibleAuctionEssenceWinner(missing),null)
  const unsettled=auction()
  unsettled.phase='running'
  assert.equal(eligibleAuctionEssenceWinner(unsettled),null)
  const differentLot=auction()
  differentLot.lots[0].prize[0].qty=14
  assert.equal(eligibleAuctionEssenceWinner(differentLot),null)
})
test('converte seis essencias e preserva uma Preguica, caixa lendaria e inventario restante',async()=>{
  const fake=fakeDatabase()
  const result=await repairAuctionEssences({pool:fake.pool})
  assert.deepEqual(result,{status:'repaired',totalEssences:7})
  assert.equal(fake.quantity,1)
  const adds=fake.calls.filter(x=>x.sql.startsWith('INSERT INTO inventories'))
  assert.equal(adds.length,1)
  assert.equal(adds[0].params[0],'winner')
  assert.deepEqual(adds[0].params[1],[
    'essencia_pecado_gula','essencia_pecado_ganancia','essencia_pecado_inveja',
    'essencia_pecado_luxuria','essencia_pecado_ira','essencia_pecado_soberba'
  ])
  assert.equal(fake.calls.filter(x=>x.sql.includes('caixa_lendaria')).length,0)
  assert.equal(fake.calls.filter(x=>x.sql==='COMMIT').length,1)
  assert.equal(fake.calls.filter(x=>x.sql==='ROLLBACK').length,0)
  assert.deepEqual(await repairAuctionEssences({pool:fake.pool}),{status:'already-repaired'})
  assert.equal(fake.quantity,1)
  assert.equal(fake.calls.filter(x=>x.sql.startsWith('INSERT INTO inventories')).length,1)
})
test('nao concede nem subtrai essencias se foram usadas ou premio nao comprovado',async()=>{
  const used=fakeDatabase({quantity:0})
  assert.deepEqual(await repairAuctionEssences({pool:used.pool}),{status:'original-essences-used-or-missing'})
  assert.equal(used.calls.some(x=>x.sql.startsWith('UPDATE inventories')),false)
  const incomplete=auction()
  incomplete.history[0].rewards=[]
  const missing=fakeDatabase({state:incomplete})
  assert.deepEqual(await repairAuctionEssences({pool:missing.pool}),{status:'not-eligible'})
  assert.equal(missing.calls.some(x=>x.sql.startsWith('UPDATE inventories')),false)
})
test('correcao e executada uma unica vez no encerramento; preserva leilao e exibe invocacao',()=>{
  const auctionSource=readFileSync(new URL('../src/neon/auction-reliquias-20261029.js',import.meta.url),'utf8')
  assert.match(auctionSource,/if\(Date\.now\(\)>END\)\{\s*\/\/ Correção pontual/)
  assert.match(auctionSource,/void repairAuctionEssences\(\)/)
  const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(index,/collabEssences/)
  assert.match(index,/!7pecados abrir/)
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  assert.match(db,/Essência de Preguiça/)
  assert.match(db,/Essência de Ganância/)
  assert.match(db,/Essência de Luxúria/)
})
