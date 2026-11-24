// Negocios V4: retorno financeiro maior nos investimentos caros; ciclos sao referencia de producao.
// A coleta de lucro proporcional ocorre a cada 5 minutos, mesmo durante eventos.
// Publicacao isolada: V3 continua inalterada quando a flag V4 esta desligada.
export const BUSINESS_V4_CATALOG=Object.freeze({
  carrinho_lanche:Object.freeze({grossHour:100,cycleHours:24}),
  barbearia:Object.freeze({grossHour:220,cycleHours:24}),
  loja_roupas:Object.freeze({grossHour:500,cycleHours:24}),
  restaurante:Object.freeze({grossHour:1150,cycleHours:12}),
  posto:Object.freeze({grossHour:2400,cycleHours:12}),
  mercado:Object.freeze({grossHour:5500,cycleHours:12}),
  hotel:Object.freeze({grossHour:12500,cycleHours:7}),
  shopping:Object.freeze({grossHour:32000,cycleHours:7}),
  tech:Object.freeze({grossHour:75000,cycleHours:7})
})
export const BUSINESS_V4_CAPACITY_HOURS=24
export const BUSINESS_V4_LEVEL_BONUS_PERCENT=20

export function businessV4CatalogPatch(business){
  if(!business)return business
  const profile=BUSINESS_V4_CATALOG[business.id]
  if(!profile)throw Error('Negócio sem tarifa V4 aprovada.')
  const price=Number(business.price)
  if(!Number.isSafeInteger(price)||price<=0)throw Error('Preço inválido de negócio V4.')
  const netHour=Math.floor(profile.grossHour*.8)
  const netDay=Math.floor(profile.grossHour*24*.8)
  return {
    ...business,
    profitHour:profile.grossHour,
    cycleHours:profile.cycleHours,
    capacityHours:BUSINESS_V4_CAPACITY_HOURS,
    netHour,netDay,
    paybackDays24:Number((price/netDay).toFixed(1))
  }
}

// Uma conta, um arredondamento e tres versoes tarifarias para evitar
// creditar retroativamente o periodo que estava sob V2 e V3.
export function businessV4IntervalGross({
  start,now,v3EffectiveAt,v4EffectiveAt,
  baseHourV2,baseHourV3,baseHourV4,level,
  maxHours=BUSINESS_V4_CAPACITY_HOURS
}){
  const values=[start,now,v3EffectiveAt,v4EffectiveAt,baseHourV2,baseHourV3,baseHourV4,level,maxHours]
  if(values.some(v=>!Number.isSafeInteger(v)))throw RangeError('Dados inválidos na transição V4.')
  if(v3EffectiveAt<=0||v4EffectiveAt<v3EffectiveAt||level<1||level>5||
    maxHours<1||maxHours>24||[baseHourV2,baseHourV3,baseHourV4].some(n=>n<0))
    throw RangeError('Política de negócios V4 inválida.')
  const end=Math.max(start,Math.min(now,start+maxHours*3600))
  const clamp=(v)=>Math.max(start,Math.min(end,v))
  const v3Start=clamp(v3EffectiveAt),v4Start=clamp(v4EffectiveAt)
  const v2Seconds=v3Start-start
  const v3Seconds=v4Start-v3Start
  const v4Seconds=end-v4Start
  const growthV2=100+(level-1)*10
  const growthV3=100+(level-1)*20
  const weighted=v2Seconds*baseHourV2*growthV2+
    v3Seconds*baseHourV3*growthV3+
    v4Seconds*baseHourV4*growthV3
  if(!Number.isSafeInteger(weighted))throw RangeError('Receita dos negócios excede o limite numérico.')
  return Math.floor(weighted/(3600*100))
}

// Compatibilidade historica: esta funcao descreve o antigo bloqueio por ciclo.
// Ela NAO deve ser aplicada ao comando !coletar, que segue apenas cooldown de 5 min.
// A producao acumulada permanece limitada a 24 horas.
export function businessV4CycleStatus({
  lastCollectedAt,now,cycleHours,cutoverAt,accruedGross=0
}){
  if(![lastCollectedAt,now,cycleHours,cutoverAt,accruedGross].every(Number.isFinite)||
    !Number.isSafeInteger(cycleHours)||cycleHours<1||cycleHours>24)throw RangeError('Ciclo de negocio invalido.')
  const elapsed=Math.max(0,now-lastCollectedAt)
  const dueIn=Math.max(0,cycleHours*3600-elapsed)
  const ready=accruedGross>0||lastCollectedAt<cutoverAt||dueIn===0
  return {ready,remainingSeconds:ready?0:dueIn}
}
