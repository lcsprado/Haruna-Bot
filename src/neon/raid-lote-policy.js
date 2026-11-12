// RAIDLOTE V1 — politica pura, sem I/O, sempre desligada ate homologacao.
export const RAID_LOTE_V1=Object.freeze({
  maxAttempts:10,dailyResetTimeZone:'America/Sao_Paulo',minimumManualWins:3,
  paymentMode:'prepaid_no_refund', // compra pacote INTEIRO antes da primeira rodada
  feeBasisPoints:1000,
  cashBasisPoints:8000,
  playerXpBasisPoints:6000,heroXpBasisPoints:6000,petXpBasisPoints:6000,
  masteryXpBasisPoints:5000,fragmentBasisPoints:4000,
  gearChanceBasisPoints:2500,
  applyTemporaryRewardMultipliers:false, // eventos globais nao amplificam premio automatico
  applyActivatedXpItems:true, // ampulheta/elixir do jogador aplica-se APOS XP reduzido
  stopOnDeath:true,stopOnLoss:true,stopOnCancellation:true,
  refundUnusedAttempts:false,
  allowAutomaticConsumablePurchases:false,
  sequential:true
})
const integer=n=>typeof n!=='boolean'&&Number.isSafeInteger(Number(n))&&Number(n)>=0
export function raidLoteQuote(keyPrice,attempts,ownedKeys=0){
  if(!integer(keyPrice)||Number(keyPrice)<1)throw new RangeError('Preco de chave invalido')
  if(!integer(attempts)||Number(attempts)<1||Number(attempts)>RAID_LOTE_V1.maxAttempts)throw new RangeError('Quantidade de tentativas invalida')
  if(!integer(ownedKeys))throw new RangeError('Chaves existentes invalidas')
  const price=Number(keyPrice),n=Number(attempts)
  const feePerAttempt=Math.ceil(price*RAID_LOTE_V1.feeBasisPoints/10000)
  const ownedKeysUsed=Math.min(n,Number(ownedKeys)),keysToBuy=n-ownedKeysUsed
  const keysTotal=price*keysToBuy,serviceTotal=feePerAttempt*n
  const fullPackageValue=price*n+serviceTotal
  if(!Number.isSafeInteger(keysTotal+serviceTotal)||!Number.isSafeInteger(fullPackageValue))
    throw new RangeError('Valor total fora do limite')
  return Object.freeze({attempts:n,keyPrice:price,feePerAttempt,
    ownedKeysUsed,keysToBuy,keysTotal,serviceTotal,totalPrice:keysTotal+serviceTotal,
    fullPackageValue,prepaid:true,refundable:false})
}
export function raidLoteReward(base,kind){
  const rate={
    cash:RAID_LOTE_V1.cashBasisPoints,
    playerXp:RAID_LOTE_V1.playerXpBasisPoints,
    heroXp:RAID_LOTE_V1.heroXpBasisPoints,
    petXp:RAID_LOTE_V1.petXpBasisPoints,
    masteryXp:RAID_LOTE_V1.masteryXpBasisPoints,
    fragment:RAID_LOTE_V1.fragmentBasisPoints
  }[kind]
  if(rate===undefined)throw new RangeError('Recompensa nao suportada')
  if(!integer(base))throw new RangeError('Recompensa base invalida')
  return Math.floor(Number(base)*rate/10000)
}
export function raidLoteGearChance(baseChance){
  if(!Number.isFinite(baseChance)||baseChance<0||baseChance>1)throw new RangeError('Probabilidade invalida')
  return baseChance*RAID_LOTE_V1.gearChanceBasisPoints/10000
}
export function raidLoteShouldStop({cancelRequested=false,dead=false,won=false,attemptsCompleted=0,attemptsRequested=1}={}){
  return Boolean(cancelRequested||dead||!won||attemptsCompleted>=attemptsRequested)
}
