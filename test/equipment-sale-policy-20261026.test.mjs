import test from 'node:test'
import assert from 'node:assert/strict'
import {equipmentSalePolicy,equipmentSaleQuantityAllowed} from '../src/neon/equipment-sale-policy.js'

test('Katana Divina Lv.10 unica, nao equipada: pode vender e recuperar upgrades',()=>{
  const plan=equipmentSalePolicy({quantity:1,upgradedQuantity:1})
  assert.equal(plan.basic,0)
  assert.equal(plan.regularSellable,0)
  assert.equal(plan.maxSellable,1)
  assert.equal(plan.canSellAll,true)
  assert.equal(equipmentSaleQuantityAllowed(plan,1,1),true)
  assert.equal(Math.floor(40000*45*0.25),450000)
  assert.equal(200000+450000,650000)
})

test('ultima copia equipada protegida; vinculada livre somente na revenda voluntaria',()=>{
  for(const flags of [{equipped:true},{boundQuantity:1}]){
    const plan=equipmentSalePolicy({quantity:1,upgradedQuantity:1,...flags})
    assert.equal(plan.regularSellable,0)
    assert.equal(plan.maxSellable,flags.equipped?0:1)
    assert.equal(equipmentSaleQuantityAllowed(plan,1,1),!flags.equipped)
  }
})

test('forja livre pode ser revendida, mercado limita a copia comum',()=>{
  const plan=equipmentSalePolicy({quantity:2,hasForge:true})
  assert.equal(plan.regularSellable,1)
  assert.equal(plan.canSellAll,true)
  assert.equal(equipmentSaleQuantityAllowed(plan,1,2),true)
  assert.equal(equipmentSaleQuantityAllowed(plan,2,2),true)
})

test('duas copias aprimoradas: venda parcial ou integral mediante confirmacao',()=>{
  const plan=equipmentSalePolicy({quantity:2,upgradedQuantity:2})
  assert.equal(plan.regularSellable,0)
  assert.equal(plan.maxSellable,2)
  assert.equal(equipmentSaleQuantityAllowed(plan,1,2),true)
  assert.equal(equipmentSaleQuantityAllowed(plan,2,2),true)
})

test('copia comum pode sair sem consumir upgrades de outra copia',()=>{
  const plan=equipmentSalePolicy({quantity:3,upgradedQuantity:2,equipped:true})
  assert.equal(plan.regularSellable,1)
  assert.equal(equipmentSaleQuantityAllowed(plan,1,3),true)
  assert.equal(equipmentSaleQuantityAllowed(plan,2,3),true)
  assert.equal(equipmentSaleQuantityAllowed(plan,3,3),false)
})

test('inventario inconsistente impede qualquer venda',()=>{
  const plan=equipmentSalePolicy({quantity:1,upgradedQuantity:2})
  assert.equal(plan.inconsistent,true)
  assert.equal(plan.maxSellable,0)
  assert.equal(equipmentSaleQuantityAllowed(plan,1,1),false)
})

test('consumiveis nao vinculados seguem venda parcial normal',()=>{
  const plan=equipmentSalePolicy({quantity:10})
  assert.equal(plan.regularSellable,10)
  assert.equal(equipmentSaleQuantityAllowed(plan,5,10),true)
  assert.equal(equipmentSaleQuantityAllowed(plan,10,10),true)
})
