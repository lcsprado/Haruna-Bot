import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const helperSource=source.slice(source.indexOf('export function businessUpgradeQuote'),source.indexOf('export async function upgradeBusiness')).replace(/^export /gm,'')
const quote=new Function(helperSource+';return businessUpgradeQuote')()
const hotel={price:4500000,profitHour:55000,capacityHours:16}
test('Upgrade hotel soma os custos reais sem desconto nem duplicação',()=>{
  assert.equal(quote(hotel,1,5).cost,6300000)
  assert.equal(quote(hotel,1,2).cost,900000)
  assert.equal(quote(hotel,2,5).cost,5400000)
  assert.equal(quote(hotel,3,5).cost,4050000)
  assert.equal(quote(hotel,4,5).cost,2250000)
})
test('Hotel Lv.5 mantém lucro e capacidade originais por nível',()=>{
  const result=quote(hotel,1,5)
  assert.equal(result.profitHour,110000)
  assert.equal(result.capacityHours,20)
  assert.equal(result.levelsGained,4)
  assert.equal(result.previousProfitHour,55000)
  assert.equal(result.previousCapacityHours,16)
})
test('Não permite nível igual, inferior, acima de 5 ou fracionado',()=>{
  for(const target of [1,0,-1,6,2.5,NaN])assert.throws(()=>quote(hotel,1,target))
  assert.throws(()=>quote(hotel,5,5))
})
test('Backend transaciona carteira, nível e histórico de uma vez',()=>{
  const body=source.slice(source.indexOf('export async function upgradeBusiness'),source.indexOf('function groupWeekKey()'))
  assert.match(body,/FOR UPDATE/)
  assert.match(body,/businessUpgradeQuote\(business,level,target\)/)
  assert.match(body,/cash<quote\.cost/)
  assert.match(body,/UPDATE wallets SET cash=cash-\$1/)
  assert.match(body,/UPDATE user_businesses SET level=\$1/)
  assert.match(body,/INSERT INTO transactions/)
  assert.match(index,/business_upgrade_amount/)
  assert.match(index,/business_upgrade_custom/)
  assert.match(index,/flow\.data\.targetLevel/)
})
