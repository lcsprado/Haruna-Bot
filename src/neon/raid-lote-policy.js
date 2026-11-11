// RAIDLOTE V1 — regras puras. Sem I/O, sem ativacao automatica e sem alteracao da Raid publica.
export const RAID_LOTE_V1=Object.freeze({
  maxAttempts:10,rollingWindowHours:24,minimumManualWins:3,
  feeBasisPoints:1000, // 10% do preco da chave
  cashBasisPoints:8000,
  playerXpBasisPoints:6000,heroXpBasisPoints:6000,petXpBasisPoints:6000,
  masteryXpBasisPoints:5000,fragmentBasisPoints:4000,
  gearChanceBasisPoints:2500,
  applyTemporaryRewardMultipliers:false,
  stopOnDeath:true,stopOnLoss:true,stopOnCancellation:true,
  allowAutomaticConsumablePurchases:false,
  sequential:true
})
const integer=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0
export function raidLoteQuote(keyPrice,attempts,ownedKeys=0){
  if(!integer(keyPrice)||Number(keyPrice)<1)throw new RangeError('Preco de chave invalido')
  if(!integer(attempts)||Number(attempts)<1||Number(attempts)>RAID_LOTE_V1.maxAttempts)throw new RangeError('Quantidade de tentativas invalida')
  if(!integer(ownedKeys))throw new RangeError('Quantidade de chaves invalida')
  const price=Number(keyPrice),n=Number(attempts)
  const feePerAttempt=Math.ceil(price*RAID_LOTE_V1.feeBasisPoints/10000)
  const keysToBuy=Math.max(0,n-Number(ownedKeys))
  return Object.freeze({attempts:n,keyPrice:price,feePerAttempt,keysToBuy,
    maxKeySpend:keysToBuy*price,maxServiceSpend:n*feePerAttempt,
    maxTotalSpend:keysToBuy*price+n*feePerAttempt})
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
