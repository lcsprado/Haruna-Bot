import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUSINESS_V3_CATALOG,BUSINESS_V3_UPGRADE_PRICE_RATES,
  BUSINESS_V3_LEVEL_GROWTH_PERCENT,businessV3CatalogPatch,businessV3IntervalGross
} from '../src/neon/business-rebalance-v3.js'
import {
  candidateBusinessCatalog,businessV3Enabled,businessV3EffectiveAt,
  businessIntervalGrossV2,businessSettlementV2
} from '../src/neon/reboot-economy-policy.js'
import {BUSINESSES,businessUpgradeQuote} from '../src/neon/progression.js'

const sample={
  carrinho_lanche:15000,barbearia:45000,loja_roupas:120000,restaurante:300000,
  posto:750000,mercado:1800000,hotel:4500000,shopping:12000000,tech:30000000
}
const get=id=>BUSINESSES.find(b=>b.id===id)

test('nove negocios cobertos: rentabilidade crescente, retorno controlado e ciclos 24/12/7',()=>{
 const profiles=BUSINESSES.map(b=>businessV3CatalogPatch(b))
 assert.equal(profiles.length,9)
 assert.deepEqual(Object.keys(BUSINESS_V3_CATALOG),BUSINESSES.map(b=>b.id))
 assert.deepEqual(profiles.map(b=>b.cycleHours),[24,24,24,12,12,12,7,7,7])
 assert.ok(profiles.every(b=>b.capacityHours===24))
 assert.ok(profiles.every(b=>b.paybackDays24>0&&b.paybackDays24<=50))
 assert.ok(profiles.every(b=>b.paybackDays24>=9))
 assert.ok(profiles.every((b,i)=>i===0||b.profitHour>profiles[i-1].profitHour))
 assert.ok(profiles.every(b=>b.netDay<=b.profitHour*24))
 assert.equal(businessV3CatalogPatch(get('loja_roupas')).profitHour,400)
 assert.equal(businessV3CatalogPatch(get('loja_roupas')).netHour,320)
 assert.equal(businessV3CatalogPatch(get('loja_roupas')).paybackDays24,15.6)
})

test('upgrade V3 é mais barato e melhora receita: payback marginal inferior ao original',()=>{
 const priorMode=process.env.ALPHA_REBOOT_MODE
 const priorFlag=process.env.ALPHA_BUSINESS_REBALANCE_V3
 try{
  process.env.ALPHA_REBOOT_MODE='classes_only'
  process.env.ALPHA_BUSINESS_REBALANCE_V3='on'
  assert.equal(BUSINESS_V3_LEVEL_GROWTH_PERCENT,20)
  assert.deepEqual(Object.values(BUSINESS_V3_UPGRADE_PRICE_RATES),[.08,.10,.12,.14])
  for(const b of BUSINESSES){
   let sum=0
   for(let level=1;level<=4;level++){
     const q=businessUpgradeQuote(b,level,level+1)
     assert.equal(q.cost,Math.floor(b.price*BUSINESS_V3_UPGRADE_PRICE_RATES[level]))
     assert.ok(q.profitHour>q.previousProfitHour)
     const delta=q.profitHour-q.previousProfitHour
     const incrementalDays=q.cost/(delta*.8*24)
     assert.ok(incrementalDays<=35,'Upgrade fora do limite '+b.id+' '+level+' '+incrementalDays)
     sum+=q.cost
   }
   const all=businessUpgradeQuote(b,1,5)
   assert.equal(all.cost,sum)
   assert.ok(all.profitHour>all.previousProfitHour)
  }
 }finally{
  if(priorMode===undefined)delete process.env.ALPHA_REBOOT_MODE
  else process.env.ALPHA_REBOOT_MODE=priorMode
  if(priorFlag===undefined)delete process.env.ALPHA_BUSINESS_REBALANCE_V3
  else process.env.ALPHA_BUSINESS_REBALANCE_V3=priorFlag
 }
})

test('V3 requer ativacao dupla; V1 e V2 mantêm catálogo original com chave desligada',()=>{
 assert.equal(businessV3Enabled({ALPHA_REBOOT_MODE:'classes_only'}),false)
 assert.equal(businessV3Enabled({ALPHA_BUSINESS_REBALANCE_V3:'on'}),false)
 assert.equal(businessV3Enabled({ALPHA_BUSINESS_REBALANCE_V3:'on',ALPHA_REBOOT_MODE:'classes_only'}),true)
 const b=get('loja_roupas')
 assert.equal(candidateBusinessCatalog(b,{enabled:false,v3:true}).profitHour,2000)
 assert.equal(candidateBusinessCatalog(b,{enabled:true,v3:false}).profitHour,250)
 assert.equal(candidateBusinessCatalog(b,{enabled:true,v3:true}).profitHour,400)
 assert.throws(()=>businessV3EffectiveAt({ALPHA_BUSINESS_REBALANCE_V3:'on',ALPHA_REBOOT_MODE:'classes_only'}),/EFFECTIVE_AT_UNIX/)
 assert.equal(businessV3EffectiveAt({ALPHA_BUSINESS_REBALANCE_V3:'on',ALPHA_REBOOT_MODE:'classes_only',ALPHA_BUSINESS_V3_EFFECTIVE_AT_UNIX:'1795500000'}),1795500000)
})

test('24h guardadas mesmo quando ciclo é de 7h, sem prêmio extra ou perda por ficar offline',()=>{
 const start=1795500000,effectiveAt=start
 for(const [id,h] of [['hotel',7000],['shopping',16000],['tech',32000]]){
  const gross=businessV3IntervalGross({start,now:start+24*3600,effectiveAt,baseHourOld:500,baseHourNew:h,level:1})
  const grossAfter30h=businessV3IntervalGross({start,now:start+30*3600,effectiveAt,baseHourOld:500,baseHourNew:h,level:1})
  assert.equal(gross,24*h)
  assert.equal(grossAfter30h,gross)
  assert.equal(businessV3IntervalGross({start,now:start+7*3600,effectiveAt,baseHourOld:500,baseHourNew:h,level:1}),7*h)
 }
})

test('período anterior à virada conserva V2; após virada usa V3, inclusive Lv5',()=>{
 const start=1795500000,effectiveAt=start+12*3600
 const newCase=businessV3IntervalGross({start,now:start+24*3600,effectiveAt,baseHourOld:250,baseHourNew:400,level:2})
 // 12*250*1.1 + 12*400*1.2 = 9.060
 assert.equal(newCase,9060)
 assert.equal(businessV3IntervalGross({start,now:start+12*3600,effectiveAt,baseHourOld:250,baseHourNew:400,level:2}),3300)
 assert.equal(businessV3IntervalGross({start,now:start+24*3600,effectiveAt:start+24*3600,baseHourOld:250,baseHourNew:400,level:2}),6600)
 assert.equal(businessV3IntervalGross({start,now:start+24*3600,effectiveAt:start,baseHourOld:250,baseHourNew:400,level:2}),11520)
})

test('beneficio de preco nao gera dinheiro sem trabalho e pagamentos líquidos deduzem 20%',()=>{
 for(const [id,price] of Object.entries(sample)){
  const b=businessV3CatalogPatch(get(id))
  assert.equal(b.price,price)
  assert.equal(businessV3IntervalGross({start:1795500000,now:1795500000,effectiveAt:1795500000,baseHourOld:1,baseHourNew:b.profitHour,level:5}),0)
  const oneDay=businessV3IntervalGross({start:1795500000,now:1795586400,effectiveAt:1795500000,baseHourOld:1,baseHourNew:b.profitHour,level:1})
  const payout=businessSettlementV2(oneDay)
  assert.equal(payout.gross,24*b.profitHour)
  assert.equal(payout.net,payout.gross-payout.tax-payout.operating)
  assert.equal(payout.net,Math.floor(24*b.profitHour*.8))
 }
})

test('coleta repetida nunca cria receita sem tempo decorrido no cálculo por ciclo',()=>{
 const start=1795500000
 const params={start,effectiveAt:start,baseHourOld:250,baseHourNew:400,level:1}
 const first=businessV3IntervalGross({...params,now:start+7*3600})
 const second=businessV3IntervalGross({...params,start:start+7*3600,now:start+7*3600})
 assert.equal(first,2800)
 assert.equal(second,0)
})
