import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {autoHealBossCombatPet} from '../src/neon/boss-pet-autocure.js'
import {spendAutoPetPotion} from '../src/neon/pet-potion-auto-policy.js'
const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')

const fixture=(stock=1,{auditError=false}={})=>{
 let amount=stock
 const calls=[],transactions=[],pets=[]
 const client={async query(sql,params=[]){
  const q=String(sql)
  calls.push({q,params})
  if(q.startsWith('SELECT item_id,quantity FROM inventories'))return {rows:amount?[{item_id:'pocao_pet_full',quantity:amount}]:[]}
  if(q.startsWith('UPDATE inventories SET quantity=quantity-1')){
   if(amount<=0)return {rowCount:0,rows:[]}
   amount--
   return {rowCount:1,rows:[{quantity:amount}]}
  }
  if(q.includes('INSERT INTO transactions')){
   if(auditError)throw Error('journal unavailable')
   transactions.push(params)
   return {rowCount:1,rows:[]}
  }
  throw Error('Unknown SQL '+q.slice(0,90))
 }}
 return {client,calls,transactions,pets,amount:()=>amount,
  persistPet:async(_client,_jid,pet)=>{pets.push({...pet})}}
}
const potion=(rows,missing)=>rows.length?[{item_id:'pocao_pet_full',name:'Poção Full',heal:Math.max(1,missing)}][0]:null

test('AB-01: pet com HP zero recebe exatamente uma poção, auditoria e persistência',async()=>{
 const f=fixture(1),pet={name:'Pet',hp:0,energy:5,level:100,species:'fenix'}
 const result=await autoHealBossCombatPet({client:f.client,jid:'a',pet,maxHp:100,
  choosePotion:potion,persistPet:f.persistPet,context:'raid-revive'})
 assert.equal(result.heal,100)
 assert.equal(result.hp,100)
 assert.equal(result.remaining,0)
 assert.equal(pet.hp,100)
 assert.equal(f.amount(),0)
 assert.equal(f.pets.length,1)
 assert.equal(f.transactions.length,1)
 assert.match(f.transactions[0][1],/^raid-revive\|pocao_pet_full\|Pet$/)
 assert.equal(await autoHealBossCombatPet({client:f.client,jid:'a',pet,maxHp:100,choosePotion:potion,persistPet:f.persistPet}),null)
 assert.equal(f.transactions.length,1,'nao cobra duas vezes por HP cheio')
})
test('AB-01: falha no registro aborta a cura, sem marcar HP como recuperado',async()=>{
 const f=fixture(1,{auditError:true}),pet={name:'Pet',hp:0}
 await assert.rejects(autoHealBossCombatPet({
  client:f.client,jid:'a',pet,maxHp:100,choosePotion:potion,persistPet:f.persistPet
 }),/journal unavailable/)
 assert.equal(pet.hp,0)
 assert.equal(f.pets.length,0)
})
test('AB-01: sem estoque não debita, não cura e não cria auditoria',async()=>{
 const f=fixture(0),pet={name:'Pet',hp:0}
 assert.equal(await autoHealBossCombatPet({client:f.client,jid:'a',pet,maxHp:100,
  choosePotion:potion,persistPet:f.persistPet}),null)
 assert.equal(pet.hp,0)
 assert.equal(f.transactions.length,0)
})
test('AB-01: debitar poção com estoque zerado é idempotente',async()=>{
 const f=fixture(0)
 const result=await spendAutoPetPotion(f.client,{jid:'a',itemId:'pocao_pet_comum'})
 assert.deepEqual(result,{spent:false,reason:'no_stock'})
 assert.equal(f.transactions.length,0)
})
test('AB-01: Raid compartilha a política transacional e revive antes do round',()=>{
 assert.match(source,/const preRoundPetHeals=new Map\(\)/)
 assert.match(source,/context:'raid-revive'/)
 assert.match(source,/preRoundPetHeals\.set\(p\.jid,healed\)/)
 assert.match(source,/autoPetHeal=preRoundPetHeals\.get\(p\.jid\)\|\|null/)
 assert.match(source,/context:'raid-preventive'/)
 assert.match(source,/context:'raid-fainted'/)
 assert.match(source,/else if\(!autoPetHeal\)/)
})
test('AB-01: Boss garante até uma poção por ataque e mantém o Reserva prioritário',()=>{
 assert.match(source,/let autoPetHeal=null\s+if\(usePet&&petRow&&Number\(petRow\.hp\)<=0\)/)
 assert.match(source,/if\(!pet\.petFainted&&!autoPetHeal&&maxPetHp>0/)
 assert.match(source,/if\(!switched&&!autoPetHeal\)/)
 assert.match(source,/autoHealBossCombatPet\(\{/)
 assert.match(source,/petSwitch=\{from:pet\.name,to:reserve\.name\}/)
})
