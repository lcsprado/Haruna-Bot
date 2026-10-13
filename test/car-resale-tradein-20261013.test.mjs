import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const only=source.slice(source.indexOf('export function carTradeInCredit'),source.indexOf('// Troca atômica')).replace(/^export /gm,'')
const credit=new Function(only+'return carTradeInCredit')()
test('Entrada e revenda usam 70% do custo histórico do veículo',()=>{
  assert.equal(credit(35000),24500)
  assert.equal(credit(500000),350000)
  assert.equal(credit(175000),122500)
  assert.throws(()=>credit(-1))
})
test('Troca é transação única e não paga troco em dinheiro',()=>{
  const code=source.slice(source.indexOf('export async function tradeCar('),source.indexOf('export async function sellCar('))
  assert.match(code,/return tx\(async client=>/)
  assert.match(code,/SELECT cash FROM wallets WHERE jid=\$1 FOR UPDATE/)
  assert.match(code,/SELECT car_id,price_paid FROM user_cars WHERE jid=\$1 FOR UPDATE/)
  assert.match(code,/newCar\.price<=credit/)
  assert.match(code,/shift_ends_at>\$3/)
  assert.match(code,/cash<difference/)
  assert.match(code,/DELETE FROM user_cars/)
  assert.match(code,/INSERT INTO user_cars/)
  assert.match(code,/UPDATE wallets SET cash=cash-\$1/)
  assert.doesNotMatch(code,/SET cash=cash\+\$1/)
})
test('Interface tem seleção, ação, carro novo, confirmação e cancelamento',()=>{
  for(const stage of ['car_resale_select','car_resale_action','car_trade_target','car_trade_confirm','confirm_sell_car'])
    assert.match(app,new RegExp(stage))
  assert.match(app,/\['vendercarro','trocarcarro'\]/)
  assert.match(app,/Revenda\/entrada/)
})
