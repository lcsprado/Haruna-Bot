// Alpha Bot V3 — ciclo de resgate e rentabilidade separados.
// Nunca reduz a capacidade de acumulo de 24h nem recalcula o passado pela tarifa nova.
// Ativacao explicita: ALPHA_BUSINESS_REBALANCE_V3=on + unix epoch de virada.
export const BUSINESS_V3_CAPACITY_HOURS=24
export const BUSINESS_V3_LEVEL_GROWTH_PERCENT=20
export const BUSINESS_V3_UPGRADE_PRICE_RATES=Object.freeze({
  1:0.08,2:0.10,3:0.12,4:0.14
})
// Valor bruto por hora ao Lv.1. Liquido = 80%, apos TAXADE 10% e operacao 10%.
export const BUSINESS_V3_CATALOG=Object.freeze({
  carrinho_lanche:Object.freeze({grossHour:80,cycleHours:24}),
  barbearia:Object.freeze({grossHour:200,cycleHours:24}),
  loja_roupas:Object.freeze({grossHour:400,cycleHours:24}),
  restaurante:Object.freeze({grossHour:800,cycleHours:12}),
  posto:Object.freeze({grossHour:1650,cycleHours:12}),
  mercado:Object.freeze({grossHour:3400,cycleHours:12}),
  hotel:Object.freeze({grossHour:7000,cycleHours:7}),
  shopping:Object.freeze({grossHour:16000,cycleHours:7}),
  tech:Object.freeze({grossHour:32000,cycleHours:7})
})
export function businessV3CatalogPatch(business){
  if(!business)return business
  const profile=BUSINESS_V3_CATALOG[business.id]
  if(!profile)throw Error('Negócio sem perfil de renda V3.')
  if(!Number.isSafeInteger(Number(business.price))||Number(business.price)<=0)
    throw Error('Preço inválido no catálogo de negócios.')
  const netDay=Math.floor(profile.grossHour*24*0.8)
  return {
    ...business,
    profitHour:profile.grossHour,
    cycleHours:profile.cycleHours,
    capacityHours:BUSINESS_V3_CAPACITY_HOURS,
    netHour:Math.floor(profile.grossHour*0.8),
    netDay,
    paybackDays24:Number((Number(business.price)/netDay).toFixed(1))
  }
}
export function businessV3UpgradeRate(fromLevel){
  const rate=BUSINESS_V3_UPGRADE_PRICE_RATES[Number(fromLevel)]
  if(!rate)throw RangeError('Nível inválido para upgrade.')
  return rate
}

// Corte temporal retroativo protegido: um único floor sobre a soma inteira.
// O que foi gerado antes da virada usa a regra V2; só após a virada usa V3.
// O máximo acumulado permanece 24 horas APÓS a última coleta, como na V2.
export function businessV3IntervalGross({
  start,now,effectiveAt,baseHourOld,baseHourNew,level,
  maxHours=BUSINESS_V3_CAPACITY_HOURS,oldGrowthPercent=10
}){
  for(const number of [start,now,effectiveAt,baseHourOld,baseHourNew,level,maxHours,oldGrowthPercent]){
    if(!Number.isFinite(Number(number)))throw RangeError('Cálculo de negócios V3 inválido.')
  }
  if(!Number.isSafeInteger(level)||level<1||level>5||
    !Number.isSafeInteger(baseHourOld)||baseHourOld<0||
    !Number.isSafeInteger(baseHourNew)||baseHourNew<0||
    !Number.isSafeInteger(maxHours)||maxHours<1||maxHours>24||
    !Number.isSafeInteger(effectiveAt)||effectiveAt<=0){
    throw RangeError('Política V3 inválida.')
  }
  const first=Number(start),last=Math.max(first,Math.min(Number(now),first+maxHours*3600))
  const oldSeconds=Math.max(0,Math.min(last,effectiveAt)-first)
  const newSeconds=Math.max(0,last-Math.max(first,effectiveAt))
  const oldGrowth=100+(level-1)*oldGrowthPercent
  const newGrowth=100+(level-1)*BUSINESS_V3_LEVEL_GROWTH_PERCENT
  return Math.floor((
    oldSeconds*baseHourOld*oldGrowth+
    newSeconds*baseHourNew*newGrowth
  )/(3600*100))
}
