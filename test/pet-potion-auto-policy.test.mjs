import test from 'node:test'
import assert from 'node:assert/strict'
import {MAX_PET_AUTO_POTIONS_PER_DAY,spendAutoPetPotion} from '../src/neon/pet-potion-auto-policy.js'
import {autoHealBossCombatPet} from '../src/neon/boss-pet-autocure.js'

function fakeDb({balance=20,used=0}={}) {
  const entries=[]
  const db={
    async query(sql,args=[]) {
      if(sql.includes('SELECT COUNT(*)')) return {rows:[{used}]}
      if(sql.includes('SELECT item_id,quantity FROM inventories')) {
        return {rows:balance>0?[{item_id:'pocao_pet_suprema',quantity:balance}]:[]}
      }
      if(sql.includes('UPDATE inventories SET quantity=quantity-1')) {
        if(balance<1) return {rowCount:0,rows:[]}
        balance--
        return {rowCount:1,rows:[{quantity:balance}]}
      }
      if(sql.includes('INSERT INTO transactions')) {
        entries.push(args)
        return {rowCount:1,rows:[]}
      }
      throw new Error('Unexpected query: '+sql)
    }
  }
  return {db,entries,balance:()=>balance}
}

test('autocura debita exatamente 1 e grava auditoria',async()=>{
  const f=fakeDb({balance:200})
  const r=await spendAutoPetPotion(f.db,{jid:'player1',itemId:'pocao_pet_suprema',context:'raid',petName:'Teste'})
  assert.deepEqual({spent:r.spent,remaining:r.remaining,used:r.used},{spent:true,remaining:199,used:1})
  assert.equal(f.balance(),199)
  assert.equal(f.entries.length,1)
  assert.match(f.entries[0][1],/raid\|pocao_pet_suprema\|Teste/)
})

test('limite diario bloqueia gasto sem alterar saldo nem criar log',async()=>{
  const f=fakeDb({balance:200,used:MAX_PET_AUTO_POTIONS_PER_DAY})
  const r=await spendAutoPetPotion(f.db,{jid:'player1',itemId:'pocao_pet_suprema'})
  assert.equal(r.spent,false)
  assert.equal(r.reason,'daily_limit')
  assert.equal(f.balance(),200)
  assert.equal(f.entries.length,0)
})

test('sem estoque não cura nem cria lançamento',async()=>{
  const f=fakeDb({balance:0})
  const r=await spendAutoPetPotion(f.db,{jid:'player1',itemId:'pocao_pet_suprema'})
  assert.equal(r.spent,false)
  assert.equal(r.reason,'no_stock')
  assert.equal(f.entries.length,0)
})

test('Boss preserva HP e retorna saldo correto quando debito é confirmado',async()=>{
  const f=fakeDb({balance:4})
  const pet={name:'Guardiã',hp:100,petFainted:true}
  let persisted=0
  const r=await autoHealBossCombatPet({
    client:f.db,jid:'player1',pet,maxHp:1000,
    choosePotion:rows=>rows.length?{...rows[0],heal:800,name:'Poção Suprema'}:null,
    persistPet:async()=>{persisted++}
  })
  assert.equal(r.hp,900)
  assert.equal(r.remaining,3)
  assert.equal(f.balance(),3)
  assert.equal(persisted,1)
  assert.equal(pet.petFainted,false)
})

test('Boss no limite diário não cura nem desconta',async()=>{
  const f=fakeDb({balance:200,used:MAX_PET_AUTO_POTIONS_PER_DAY})
  const pet={name:'Guardiã',hp:100,petFainted:true}
  let persisted=0
  const r=await autoHealBossCombatPet({
    client:f.db,jid:'player1',pet,maxHp:1000,
    choosePotion:rows=>rows.length?{...rows[0],heal:800,name:'Poção Suprema'}:null,
    persistPet:async()=>{persisted++}
  })
  assert.equal(r,null)
  assert.equal(f.balance(),200)
  assert.equal(pet.hp,100)
  assert.equal(persisted,0)
})
