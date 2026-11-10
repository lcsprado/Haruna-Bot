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


test('AB-04: coleta real das 09:54 de 10/11 reconcilia centavo a centavo com legado limitado',()=>{
  // Dados anonimizados: 9 negocios Lv5, coleta anterior 09/11 e
  // timestamp registrado no banco (ultimo update antes do ledger).
  // Nunca inclui identificador de jogador, carteira ou historico privado.
  const previousCollectedAt=1794248342
  const collectedAt=1794315251
  const expected=catalog.reduce((total,[id,profitHour,capacityHours])=>
    total+businessIntervalGross({id,profitHour,capacityHours},
      {last_collected_at:previousCollectedAt,level:5},collectedAt),0)
  assert.equal(expected,20_029_477)
  assert.equal(Math.floor(expected*.10),2_002_947)
  assert.equal(expected-Math.floor(expected*.10),18_026_530)
})

test('AB-04: rendimento integral 24h sem legado = 4.732.400, sem multiplicador de evento',()=>{
  const after=cutover+24*3600
  const gross=catalog.reduce((sum,[id,profitHour,capacityHours])=>
    sum+businessIntervalGross({id,profitHour,capacityHours},
      {last_collected_at:cutover,level:5},after),0)
  assert.equal(gross,4_732_400)
  assert.equal(gross-Math.floor(gross*.10),4_259_160)
})

test('AB-04: apos 28h todos atingem teto de 5.172.400 e nao ganham por mais horas inativas',()=>{
  const from=cutover+3600
  const earning=hours=>catalog.reduce((sum,[id,profitHour,capacityHours])=>
    sum+businessIntervalGross({id,profitHour,capacityHours},
      {last_collected_at:from,level:5},from+hours*3600),0)
  assert.equal(earning(28),5_172_400)
  assert.equal(earning(1000),5_172_400)
  assert.equal(earning(5),1_091_000)
})
