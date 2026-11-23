import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BUSINESS_V3_CATALOG} from '../src/neon/business-rebalance-v3.js'
import {BUSINESS_V4_CATALOG,businessV4CatalogPatch,businessV4IntervalGross,businessV4CycleStatus} from '../src/neon/business-rebalance-v4.js'
import {
  candidateBusinessCatalog,businessV4Enabled,businessV4EffectiveAt,
  businessV3EffectiveAt,businessIntervalGrossV2,businessSettlementV2,V2_BUSINESS_ECONOMY
} from '../src/neon/reboot-economy-policy.js'

const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const rows=source.slice(source.indexOf('export const BUSINESSES=['),source.indexOf('const MISSION_POOL='))
const BUSINESSES=[...rows.matchAll(/\{id:'([^']+)',name:'([^']+)',price:(\d+),profitHour:(\d+),capacityHours:(\d+)\}/g)]
 .map(([,id,name,price,profitHour,capacityHours])=>({id,name,price:Number(price),profitHour:Number(profitHour),capacityHours:Number(capacityHours)}))
const byId=id=>BUSINESSES.find(b=>b.id===id)

test('Carrinho é corrigido para mais de R$90 brutos/h, sem regressao em nenhum dos nove negócios',()=>{
 assert.equal(BUSINESSES.length,9)
 assert.deepEqual(Object.keys(BUSINESS_V4_CATALOG),BUSINESSES.map(x=>x.id))
 for(const b of BUSINESSES){
  const profile=businessV4CatalogPatch(b)
  const v2=Math.floor(V2_BUSINESS_ECONOMY.hourlyRates[b.id]*b.capacityHours/24)
  assert.ok(profile.profitHour>v2,b.id+' menor do que V2')
  assert.ok(profile.profitHour>BUSINESS_V3_CATALOG[b.id].grossHour,b.id+' menor do que V3')
  assert.equal(profile.capacityHours,24)
  assert.equal(profile.netHour,profile.profitHour*.8)
  assert.ok(profile.paybackDays24<=21)
  assert.ok(profile.paybackDays24>=7)
 }
 assert.equal(businessV4CatalogPatch(byId('carrinho_lanche')).profitHour,100)
 assert.equal(businessV4CatalogPatch(byId('carrinho_lanche')).netHour,80)
 assert.equal(businessV4CatalogPatch(byId('tech')).profitHour,75000)
})

test('Ciclos reais 24/12/7: sem perda de acumulo por ausências de ate 24h',()=>{
 const b=BUSINESSES.map(businessV4CatalogPatch)
 assert.deepEqual(b.map(x=>x.cycleHours),[24,24,24,12,12,12,7,7,7])
 const cutoff=1800000000
 assert.deepEqual(businessV4CycleStatus({lastCollectedAt:cutoff+1,now:cutoff+1+3600,cutoverAt:cutoff,cycleHours:7}),{ready:false,remainingSeconds:21600})
 assert.deepEqual(businessV4CycleStatus({lastCollectedAt:cutoff+1,now:cutoff+1+7*3600,cutoverAt:cutoff,cycleHours:7}),{ready:true,remainingSeconds:0})
 assert.deepEqual(businessV4CycleStatus({lastCollectedAt:cutoff+1,now:cutoff+1+7*3600,cutoverAt:cutoff,cycleHours:24}),{ready:false,remainingSeconds:17*3600})
 assert.equal(businessV4CycleStatus({lastCollectedAt:cutoff-60,now:cutoff+60,cutoverAt:cutoff,cycleHours:24}).ready,true)
 assert.equal(businessV4CycleStatus({lastCollectedAt:cutoff+60,now:cutoff+120,cutoverAt:cutoff,cycleHours:24,accruedGross:550}).ready,true)
})

test('Regra de três períodos: V2, V3 e V4 são pagos só pelo período de vigência, sem crédito retroativo',()=>{
 const v3=1795430183,v4=v3+8*3600,begin=v3-4*3600
 const gross=businessV4IntervalGross({
  start:begin,now:v4+6*3600,v3EffectiveAt:v3,v4EffectiveAt:v4,
  baseHourV2:90,baseHourV3:80,baseHourV4:100,level:1
 })
 assert.equal(gross,4*90+8*80+6*100)
 const lv5=businessV4IntervalGross({
  start:begin,now:v4+6*3600,v3EffectiveAt:v3,v4EffectiveAt:v4,
  baseHourV2:90,baseHourV3:80,baseHourV4:100,level:5
 })
 assert.equal(lv5,Math.floor(4*90*1.4+8*80*1.8+6*100*1.8))
})

test('Cap 24h, tempo negativo, segundo resgate e seguranca numerica',()=>{
 const start=1800000000,base={
  start,v3EffectiveAt:start-100,v4EffectiveAt:start,
  baseHourV2:90,baseHourV3:80,baseHourV4:100,level:1
 }
 assert.equal(businessV4IntervalGross({...base,now:start+24*3600}),2400)
 assert.equal(businessV4IntervalGross({...base,now:start+36*3600}),2400)
 assert.equal(businessV4IntervalGross({...base,now:start-120}),0)
 assert.equal(businessV4IntervalGross({...base,start:start+7*3600,now:start+7*3600}),0)
 assert.throws(()=>businessV4IntervalGross({...base,now:start+100,v4EffectiveAt:start-200}),/inválida/)
 assert.throws(()=>businessV4CycleStatus({lastCollectedAt:1,now:10,cycleHours:30,cutoverAt:1}),/invalido/)
})

test('V4 requer V3 e modo V2 e nunca reescreve valores com flag desligada',()=>{
 const env={ALPHA_REBOOT_MODE:'classes_only',ALPHA_BUSINESS_REBALANCE_V3:'on',
  ALPHA_BUSINESS_V3_EFFECTIVE_AT_UNIX:'1795430183',
  ALPHA_BUSINESS_REBALANCE_V4:'on',ALPHA_BUSINESS_V4_EFFECTIVE_AT_UNIX:'1795434000'}
 assert.equal(businessV4Enabled(env),true)
 assert.equal(businessV4EffectiveAt(env),1795434000)
 assert.equal(businessV3EffectiveAt(env),1795430183)
 assert.equal(businessV4Enabled({...env,ALPHA_BUSINESS_REBALANCE_V3:'off'}),false)
 assert.equal(businessV4Enabled({...env,ALPHA_BUSINESS_REBALANCE_V4:'off'}),false)
 assert.throws(()=>businessV4EffectiveAt({...env,ALPHA_BUSINESS_V4_EFFECTIVE_AT_UNIX:'100'}),/epoch UTC/)
 const b=byId('carrinho_lanche')
 assert.equal(candidateBusinessCatalog(b,{enabled:true,v3:false,v4:false}).profitHour,90)
 assert.equal(candidateBusinessCatalog(b,{enabled:true,v3:true,v4:false}).profitHour,80)
 assert.equal(candidateBusinessCatalog(b,{enabled:true,v3:true,v4:true}).profitHour,100)
 const before=process.env
 const keep=['ALPHA_REBOOT_MODE','ALPHA_BUSINESS_REBALANCE_V3','ALPHA_BUSINESS_V3_EFFECTIVE_AT_UNIX','ALPHA_BUSINESS_REBALANCE_V4','ALPHA_BUSINESS_V4_EFFECTIVE_AT_UNIX']
 const originals=Object.fromEntries(keep.map(k=>[k,process.env[k]]))
 try{
  Object.assign(process.env,env)
  const gross=businessIntervalGrossV2(b,{
   last_collected_at:1795430183,level:1
  },1795434000+3600)
  assert.equal(gross,Math.floor((1795434000-1795430183)*80/3600)+100)
 }finally{
  for(const k of keep){if(originals[k]===undefined)delete process.env[k];else process.env[k]=originals[k]}
 }
})

test('Limite explícito de emissão por jogador e inflação em dez magnatas',()=>{
 const gross=BUSINESSES.reduce((s,b)=>s+businessV4CatalogPatch(b).profitHour,0)
 const netPerDay=gross*24*.8
 const topNetPerDay=netPerDay*1.8
 // Orçamento alto, mas exclusivamente proprietários que investiram +R$49M.
 assert.ok(netPerDay<=2500000,'Lucro Lv1 acima do teto de análise')
 assert.ok(topNetPerDay<=4500000,'Lucro Lv5 acima do teto de análise')
 assert.ok(topNetPerDay*10<=45000000,'Emissão máxima de dez jogadores acima do teto de análise')
 for(const b of BUSINESSES){
  const v4=businessV4CatalogPatch(b)
  const gross24=businessV4IntervalGross({start:1800000000,now:1800086400,v3EffectiveAt:1795430183,v4EffectiveAt:1800000000,
   baseHourV2:20,baseHourV3:BUSINESS_V3_CATALOG[b.id].grossHour,baseHourV4:v4.profitHour,level:1})
  assert.equal(businessSettlementV2(gross24).net,v4.netDay)
 }
})
