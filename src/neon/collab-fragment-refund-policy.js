// Reconcilia os fragmentos ganhos na Raid com os gastos documentados.
// Apenas a diferenca que nao tem log de equipamento/forja pode ser atribuida
// a evolucao antiga de companheiros, que nao registrava transacao.
// O teto de evolucoes possiveis, 12 fragmentos e a data limite protegem
// contra creditar gastos arbitrarios ou devolver forjas legitimas.
export function reconcileLegacyCompanionFragments({
  raidEarned=0, currentBalance=0, gearSpent=0,
  gearPreviouslyRefunded=0, collabForgeSpent=0,
  companionUpgradeCap=0, unitCost=12
}={}){
  const values=[raidEarned,currentBalance,gearSpent,gearPreviouslyRefunded,collabForgeSpent,companionUpgradeCap,unitCost].map(Number)
  if(values.some(v=>!Number.isSafeInteger(v)||v<0)||unitCost===0){
    return {verified:false,refund:0,reason:'invalid-ledger'}
  }
  const [earned,balance,equipment,paid,forge,cap,cost]=values
  if(paid>equipment){
    return {verified:false,refund:0,reason:'overpaid-gear'}
  }
  const missing=earned-balance-equipment+paid-forge
  if(missing<0)return {verified:false,refund:0,reason:'unreconciled-credits',missing}
  if(missing===0)return {verified:true,refund:0,reason:'no-unlogged-spend'}
  if(missing%cost!==0 || missing>cap){
    return {verified:false,refund:0,reason:'unverified-spend',missing,cap}
  }
  return {verified:true,refund:missing,uses:missing/cost,reason:'legacy-companion'}
}
