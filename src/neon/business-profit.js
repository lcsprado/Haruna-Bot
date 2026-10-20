// Profit earned during one level interval. An upgrade closes the old interval
// without paying it; the next collection settles both intervals together.
export function businessIntervalGross(business,row,now){
  const elapsed=Math.max(0,now-Number(row.last_collected_at||now))
  const level=Math.max(1,Number(row.level||1))
  const capacityHours=business.capacityHours+level-1
  const capped=Math.min(elapsed,capacityHours*3600)
  return Math.floor((capped/3600)*business.profitHour*(1+(level-1)*0.25))
}
