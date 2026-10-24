// Regras puras do Leilão das Sombras — sem consulta, escrita ou envio de mensagens.
export const LOT_DURATION_MS=2*60*1000
export const OVERTIME_WINDOW_MS=15*1000
export const OVERTIME_INCREMENT_MS=20*1000
export const OVERTIME_CAP_MS=2*60*1000

export function extendAuctionDeadline(endsAt,alreadyExtended,now){
  const ends=Number(endsAt)
  const extra=Math.max(0,Number(alreadyExtended)||0)
  if(!Number.isFinite(ends)||!Number.isFinite(now)||now>=ends ||
     ends-now>OVERTIME_WINDOW_MS||extra>=OVERTIME_CAP_MS){
    return {ends,extra,extended:false}
  }
  const added=Math.min(OVERTIME_INCREMENT_MS,OVERTIME_CAP_MS-extra)
  return {ends:ends+added,extra:extra+added,extended:true}
}
