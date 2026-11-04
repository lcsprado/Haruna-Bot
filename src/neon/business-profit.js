// Profit earned during one level interval. An upgrade closes the old interval
// without paying it; the next collection settles both intervals together.
export function businessIntervalGross(business,row,now){
  const elapsed=Math.max(0,now-Number(row.last_collected_at||now))
  const level=Math.max(1,Number(row.level||1))
  const capacityHours=business.capacityHours+level-1
  const capped=Math.min(elapsed,capacityHours*3600)
  return Math.floor((capped/3600)*business.profitHour*(1+(level-1)*0.25))
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
  const duration=Number(seconds)
  if(!Number.isFinite(duration)||duration<0) return null
  const totalMinutes=Math.floor(duration/60)
  const hours=Math.floor(totalMinutes/60)
  const minutes=totalMinutes%60
  return hours>0?`${hours}h ${minutes}min`:`${minutes}min`
}
