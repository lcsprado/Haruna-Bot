import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUSINESS_REBALANCE_EFFECTIVE_AT as cutover,
  BUSINESS_LEGACY_PROFIT_HOUR as oldRates,
  BUSINESS_REBALANCED_PROFIT_HOUR as newRates,
  businessIntervalGross,
} from '../src/neon/business-profit.js'

const catalog=[
  ['carrinho_lanche',300,8],['barbearia',800,8],['loja_roupas',2000,10],
  ['restaurante',4500,10],['posto',3500,12],['mercado',6000,12],
  ['hotel',12000,16],['shopping',25000,18],['tech',55000,24],
]

test('AB-04: Lv5 full collection reduces gross from 28,136,400 to 5,172,400',()=>{
  const gross=catalog.reduce((total,[id,profitHour,capacityHours])=>
    total+businessIntervalGross({id,profitHour,capacityHours},
      {last_collected_at:cutover+3600,level:5},cutover+3600+(capacityHours+4)*3600),0)
  assert.equal(gross,5_172_400)
  const oldGross=catalog.reduce((total,[id,profitHour,capacityHours])=>
    total+businessIntervalGross({id,profitHour,capacityHours},
      {last_collected_at:cutover-(capacityHours+5)*3600,level:5},cutover-3600),0)
  assert.equal(oldGross,28_136_400)
})

test('AB-04: old earnings are grandfathered on a cross-cutover claim',()=>{
  const business={id:'tech',profitHour:newRates.tech,capacityHours:24}
  const fourHours=businessIntervalGross(business,{level:5,last_collected_at:cutover-7200},cutover+7200)
  assert.equal(fourHours,2*(2*oldRates.tech+2*newRates.tech))
  const fullOld=businessIntervalGross(business,{level:5,last_collected_at:cutover-40*3600},cutover+3600)
  assert.equal(fullOld,28*2*oldRates.tech)
})

test('AB-04: legacy businesses keep their yields; new hour after cutover uses new rates',()=>{
  for(const [id,profitHour,capacityHours] of catalog){
    const b={id,profitHour,capacityHours}
    const oldRate=oldRates[id]??profitHour
    assert.equal(businessIntervalGross(b,{last_collected_at:cutover-3600,level:1},cutover),oldRate)
    assert.equal(businessIntervalGross(b,{last_collected_at:cutover+60,level:1},cutover+3660),profitHour)
  }
})
