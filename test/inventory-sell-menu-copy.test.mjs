import test from 'node:test'
import assert from 'node:assert/strict'
import {sellQuantityOptions} from '../src/neon/inventory-sell-menu-copy.js'

test('um item vendável não oferece vender cinco/dez ou quantidade customizada',()=>{
  const message=sellQuantityOptions(1)
  assert.match(message,/1️⃣ Vender 1/)
  assert.match(message,/4️⃣ Vender todas as 1 unidade\(s\) vendáveis \*deste item\*/)
  assert.doesNotMatch(message,/2️⃣ Vender 5/)
  assert.doesNotMatch(message,/3️⃣ Vender 10/)
  assert.doesNotMatch(message,/5️⃣ Escolher quantidade/)
  assert.match(message,/T️⃣ Ir para venda em massa/)
})

test('opções aparecem somente quando a quantidade disponível permite',()=>{
  const five=sellQuantityOptions(5)
  assert.match(five,/2️⃣ Vender 5/)
  assert.doesNotMatch(five,/3️⃣ Vender 10/)
  assert.match(five,/5️⃣ Escolher quantidade/)
  const ten=sellQuantityOptions(10)
  assert.match(ten,/3️⃣ Vender 10/)
  assert.match(ten,/4️⃣ Vender todas as 10 unidade\(s\) vendáveis \*deste item\*/)
})

test('sem itens disponíveis não apresenta opções de venda',()=>{
  assert.equal(sellQuantityOptions(0),'')
  assert.equal(sellQuantityOptions(-5),'')
})
