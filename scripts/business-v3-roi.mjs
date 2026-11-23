// Simulação offline e reproduzível. Não conecta Aiven, WhatsApp ou Render.
import {readFileSync} from 'node:fs'
import {businessV3CatalogPatch,BUSINESS_V3_UPGRADE_PRICE_RATES,BUSINESS_V3_LEVEL_GROWTH_PERCENT} from '../src/neon/business-rebalance-v3.js'
import {candidateBusinessCatalog,rebootEconomyEnabled,V2_BUSINESS_ECONOMY,businessV3Enabled} from '../src/neon/reboot-economy-policy.js'
const src=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const catalog=src.slice(src.indexOf('export const BUSINESSES=['),src.indexOf('const MISSION_POOL='))
const BUSINESSES=[...catalog.matchAll(/\{id:'([^']+)',name:'([^']+)',price:(\d+),profitHour:(\d+),capacityHours:(\d+)\}/g)]
  .map(([,id,name,price,profitHour,capacityHours])=>({id,name,price:Number(price),profitHour:Number(profitHour),capacityHours:Number(capacityHours)}))
const helper=src.slice(src.indexOf('export function businessUpgradeQuote('),src.indexOf('export async function upgradeBusiness(')).replace(/^export /gm,'')
const businessUpgradeQuote=new Function(
 'candidateBusinessCatalog','rebootEconomyEnabled','V2_BUSINESS_ECONOMY',
 'businessV3Enabled','BUSINESS_V3_UPGRADE_PRICE_RATES','BUSINESS_V3_LEVEL_GROWTH_PERCENT',
 helper+';return businessUpgradeQuote'
)(candidateBusinessCatalog,rebootEconomyEnabled,V2_BUSINESS_ECONOMY,
 businessV3Enabled,BUSINESS_V3_UPGRADE_PRICE_RATES,BUSINESS_V3_LEVEL_GROWTH_PERCENT)
process.env.ALPHA_REBOOT_MODE='classes_only'
process.env.ALPHA_BUSINESS_REBALANCE_V3='on'
const hoursScenarios=[7,10,12,24]
const rows=BUSINESSES.map(b=>{
 const v3=businessV3CatalogPatch(b),lvl5=businessUpgradeQuote(b,1,5)
 const gross24=v3.profitHour*24
 const net24=gross24-Math.floor(gross24/10)-(Math.ceil(gross24/5)-Math.floor(gross24/10))
 const level5gross24=lvl5.profitHour*24
 const lv5net=level5gross24-Math.ceil(level5gross24/5)
 return {
  id:b.id,price:b.price,cycle:v3.cycleHours,cap:v3.capacityHours,
  grossHourly:v3.profitHour,net24,
  paybackDays24:Number((b.price/net24).toFixed(1)),
  paybackByHours:Object.fromEntries(hoursScenarios.map(h=>[String(h),Number((b.price/(v3.profitHour*.8*h)).toFixed(1))])),
  upgradeLv1to5Cost:lvl5.cost,
  newGrossLv5:lvl5.profitHour,
  maxNet24Lv5:lv5net
 }
})
const netPerDayLv1=rows.reduce((sum,x)=>sum+x.net24,0)
const maxNetPerDayLv5=rows.reduce((sum,x)=>sum+x.maxNet24Lv5,0)
const ownedPrice=rows.reduce((sum,x)=>sum+x.price,0)
const upgradePrice=rows.reduce((sum,x)=>sum+x.upgradeLv1to5Cost,0)
const outcome={
 release:'V3-off-by-default',numberOfBusinesses:rows.length,
 acquisitionCapital:ownedPrice,allLevel5AdditionalCapital:upgradePrice,
 emissionCeilingPerPlayerLv1PerDay:netPerDayLv1,
 emissionCeilingPerPlayerLv5PerDay:maxNetPerDayLv5,
 tenPlayersLevel5PerDay:maxNetPerDayLv5*10,
 rows
}
if(rows.length!==9||rows.some(x=>x.cycle>24||x.cap!==24||x.paybackDays24>50))
 throw Error('Business V3 ROI fora do intervalo aprovado')
process.stdout.write(JSON.stringify(outcome,null,2)+'\n')
