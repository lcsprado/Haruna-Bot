// Profit earned during one level interval. An upgrade closes the old interval
// without paying it; the next collection settles both intervals together.
// Lote AB-04: limitar emissao passiva dos cinco negocios superiores.
export const BUSINESS_REBALANCE_EFFECTIVE_AT = Date.parse('2026-11-10T12:00:00Z') / 1000
export const BUSINESS_LEGACY_PROFIT_HOUR = Object.freeze({
  posto:10500, mercado:23500, hotel:55000, shopping:140000, tech:330000
})
export const BUSINESS_REBALANCED_PROFIT_HOUR = Object.freeze({
  posto:3500, mercado:6000, hotel:12000, shopping:25000, tech:55000
})

// A coleta preserva integralmente o lucro acumulado sob a tarifa anterior,
// ate o limite de capacidade ja previsto. Somente horas posteriores ao corte
// sao remuneradas com a nova tarifa; upgrades antigos ficam em accrued_gross.
export function businessIntervalGross(business,row,now){
  const end=Number(now)
  const start=Number(row.last_collected_at||end)
  const elapsed=Math.max(0,end-start)
  const level=Math.max(1,Number(row.level||1))
  const capacityHours=business.capacityHours+level-1
  const capped=Math.min(elapsed,capacityHours*3600)
  const previousRate=BUSINESS_LEGACY_PROFIT_HOUR[business.id]??business.profitHour
  const currentRate=business.profitHour
  const oldSeconds=Math.min(capped,Math.max(0,BUSINESS_REBALANCE_EFFECTIVE_AT-start))
  const newSeconds=capped-oldSeconds
  return Math.floor((oldSeconds*previousRate+newSeconds*currentRate)/3600*(1+(level-1)*0.25))
}

