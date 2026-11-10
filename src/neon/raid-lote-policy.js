// Raid em lote: recompensa de conveniência, sempre inferior à Raid manual.
// Não altera Raid de grupo, Boss nem recompensas de outros modos.
export const RAID_LOTE_RULES=Object.freeze({
  maxAttempts24h:10, maxBatch:10, manualWinsRequired:3,
  feeRate:0.10, cash:0.80, xp:0.60, petXp:0.60,
  heroXp:0.60, masteryXp:0.50, fragments:0.40,
  boxChance:0.25, gearChance:0.25
})
export function raidLoteRoom(jid){
  if(!jid || typeof jid!=='string' || !jid.includes('@'))throw new Error('Identidade de jogador inválida.')
  return 'raidlote:'+jid
}
export function isRaidLoteState(s){
  return s?.loteMode===true&&typeof s.loteBatchId==='string'&&s.loteBatchId.length>=10
}
export function raidLoteFee(keyPrice){
  const price=Number(keyPrice)
  if(!Number.isSafeInteger(price)||price<=0)throw new Error('Preço da chave inválido.')
  return Math.ceil(price*RAID_LOTE_RULES.feeRate)
}
export function raidLoteAmount(value,factor){
  const n=Math.max(0,Math.floor(Number(value)||0))
  if(!Number.isFinite(n)||!Number.isFinite(factor)||factor<0||factor>1)throw new Error('Cálculo de prêmio inválido.')
  return Math.floor(n*factor)
}
export function raidLoteChance(chance,factor){
  const n=Number(chance)||0
  if(!Number.isFinite(n))return 0
  return Math.max(0,Math.min(1,n*factor))
}
export function raidLoteFormatFee(level,price){
  const fmt=n=>n.toLocaleString('pt-BR')
  return 'Raid Lv.'+Number(level)+' • Chave R$ '+fmt(price)+' + serviço R$ '+fmt(raidLoteFee(price))
}
