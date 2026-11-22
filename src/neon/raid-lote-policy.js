// RAIDLOTE V1 — politica pura, sem I/O, sempre desligada ate homologacao.
export const RAID_LOTE_V1=Object.freeze({
  maxAttempts:10,dailyResetTimeZone:'America/Sao_Paulo',minimumManualWins:3,
  paymentMode:'prepaid_no_refund', // compra pacote INTEIRO antes da primeira rodada
  feeBasisPoints:1000,
  cashNetProfitBasisPoints:5000, // RaidLote comum: 50% do LUCRO liquido manual por vitoria
  playerXpBasisPoints:6000,heroXpBasisPoints:6000,petXpBasisPoints:6000,
  masteryXpBasisPoints:5000,fragmentBasisPoints:4500,
  collabFragmentBasisPoints:4000, // Raid collab V1 segue 40%; não é afetada pelo rebalanceamento V2
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
    playerXp:RAID_LOTE_V1.playerXpBasisPoints,
    heroXp:RAID_LOTE_V1.heroXpBasisPoints,
    petXp:RAID_LOTE_V1.petXpBasisPoints,
    masteryXp:RAID_LOTE_V1.masteryXpBasisPoints,
    fragment:RAID_LOTE_V1.fragmentBasisPoints,
    collabFragment:RAID_LOTE_V1.collabFragmentBasisPoints
  }[kind]
  if(rate===undefined)throw new RangeError('Recompensa nao suportada')
  if(!integer(base))throw new RangeError('Recompensa base invalida')
  return Math.floor(Number(base)*rate/10000)
}
// Dinheiro por vitória no Raid Lote COMUM. Não é 50% do prêmio BRUTO:
// subtrair 50% do valor bruto causaria prejuízo ao pagar chave + taxa 10%.
// Reembolsa economicamente o valor da chave consumida + a taxa da automação,
// e concede 50% do lucro líquido manual (sem eventos temporários).
// Não é reembolso em derrotas: só executado depois de uma Raid vencida.
export function raidLoteCashPayout(manualCash,keyPrice){
  if(!integer(manualCash)||!integer(keyPrice)||Number(keyPrice)<1)
    throw new RangeError('Valores de recompensa ou chave inválidos')
  const key=Number(keyPrice),fee=Math.ceil(key*RAID_LOTE_V1.feeBasisPoints/10000)
  const manualProfit=Math.max(0,Number(manualCash)-key)
  const halfProfit=Math.floor(manualProfit*RAID_LOTE_V1.cashNetProfitBasisPoints/10000)
  const payout=key+fee+halfProfit
  if(!Number.isSafeInteger(payout))throw new RangeError('Prêmio fora do limite')
  return payout
}
export function raidLoteGearChance(baseChance){
  if(!Number.isFinite(baseChance)||baseChance<0||baseChance>1)throw new RangeError('Probabilidade invalida')
  return baseChance*RAID_LOTE_V1.gearChanceBasisPoints/10000
}
export function raidLoteShouldStop({cancelRequested=false,dead=false,won=false,attemptsCompleted=0,attemptsRequested=1}={}){
  return Boolean(cancelRequested||dead||!won||attemptsCompleted>=attemptsRequested)
}

// Escolha numérica limitada à prévia de RaidLote 2.0, nunca ao menu global.
export const RAID_LOTE_NUMERIC_CONFIRM_STAGE='raid_lote_v2_confirm'
export const RAID_LOTE_NUMERIC_CONFIRM_TTL_MS=90*1000
export function raidLoteNumericDecision(input){
  const value=String(input??'').trim()
  if(value==='1')return 'confirm'
  if(value==='2')return 'cancel'
  return null
}

// V2: uma sessão define o TEMPO máximo de automação, nunca o número de Raids.
// Cada tentativa é debitada de forma atômica imediatamente antes de iniciar.
export const RAID_LOTE_V2_MAX_ATTEMPTS=1000000 // salvaguarda técnica, não limite por período
export const RAID_LOTE_V2_INTERVAL_MINUTES=80 // apenas para pacotes antigos pré-pagos
export function raidLoteDurationPlan(input){
  const raw=typeof input==='number'?String(input):String(input||'').trim().toLowerCase()
  if(!/^(4|8|12)h?$/.test(raw))throw new RangeError('Escolha 4h, 8h ou 12h')
  const hours=Number(raw.replace(/h$/,''))
  return Object.freeze({hours,continuous:true,intervalMinutes:0})
}
export function raidLoteWaitsForSchedule(job,now=Date.now()){
  if(job?.billing_mode==='per_attempt')return false
  if(!job?.duration_hours||!job.next_attempt_at||job.current_attempt_id||job.cancel_requested)return false
  const due=Date.parse(job.next_attempt_at)
  if(!Number.isFinite(due))throw new Error('Horário da próxima Raid inválido')
  return now<due
}
export function raidLoteScheduleText(job,now=Date.now()){
  if(!job?.duration_hours)return ''
  const label='⏱️ Pacote de '+Number(job.duration_hours)+'h'
  if(job.billing_mode==='per_attempt'){
    const end=Date.parse(job.session_ends_at)
    if(!Number.isFinite(end))return label+' • horário final indisponível'
    if(!['queued','running'].includes(job.status))return label+' • sessão encerrada'
    const mins=Math.max(0,Math.ceil((end-now)/60000))
    if(end<=now)return label+' • prazo encerrado; aguardando conclusão'
    return label+' • '+mins+' min restantes • '+(job.current_attempt_id?'Raid em andamento':'próxima Raid sem intervalo')
  }
  if(!['queued','running'].includes(job.status)||job.current_attempt_id||job.cancel_requested)return label
  const due=Date.parse(job.next_attempt_at)
  if(!Number.isFinite(due))return label
  const mins=Math.max(0,Math.ceil((due-now)/60000))
  return label+' • '+(mins?'próxima tentativa em '+mins+' min':'próxima tentativa liberada')
}
