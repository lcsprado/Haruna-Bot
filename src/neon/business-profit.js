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

/**
 * Tempo decorrido desde a ultima coleta efetivamente paga.
 * Na primeira coleta usa a compra mais antiga como referencia, sem confundir
 * limite de capacidade de lucro com o periodo em que o jogador ficou ausente.
 * Nenhuma escrita no banco ou mudanca na formula dos lucros.
 */
export function businessCollectionElapsedSeconds(nowSeconds,lastClaimSeconds,businesses=[]){
  const now=Number(nowSeconds)
  if(!Number.isFinite(now)||now<=0) return null
  let start=Number(lastClaimSeconds)
  if(!Number.isFinite(start)||start<=0){
    const bought=(Array.isArray(businesses)?businesses:[])
      .map(row=>Number(row.acquired_at))
      .filter(value=>Number.isFinite(value)&&value>0)
    start=bought.length?Math.min(...bought):0
  }
  return start>0?Math.max(0,Math.floor(now)-Math.floor(start)):null
}

export function formatBusinessCollectionElapsed(seconds){
  if(seconds===null||seconds===undefined) return null
  const duration=Number(seconds)
  if(!Number.isFinite(duration)||duration<0) return null
  const totalMinutes=Math.floor(duration/60)
  const hours=Math.floor(totalMinutes/60)
  const minutes=totalMinutes%60
  return hours>0?`${hours}h ${minutes}min`:`${minutes}min`
}
