// !forja5: evolução integral de armas e armaduras comuns da loja.
// Uma fusão dobra o peso da peça: ★1=1, ★2=2, ★3=4, ★4=8, ★5=16 cópias-base.
// Não reutilizar esta receita para Raids, collab, escudos ou equipamentos de evento.
export const FORJA5_FEE = 500000
export const FORJA5_TARGET_STARS = 5
export const FORJA5_REQUIRED_BASE_COPIES = 16
const MAX_LEVEL = 10
const fullUpgradeSteps = 45 // 1+2+...+9

export function forja5ShopPlan({
  quantity=0, tiers=[], stars=1, forgedLevel=0, hasForge=false,
  boundQuantity=0, equipped=false, unitUpgradeCost=1500, cash=0
}={}){
  const owned=Math.max(0,Math.trunc(Number(quantity)||0))
  const star=Math.trunc(Number(stars)||1)
  const lv=hasForge?Math.trunc(Number(forgedLevel)||1):1
  if(star<1||star>FORJA5_TARGET_STARS||lv<1||lv>MAX_LEVEL)
    throw new Error('Estrelas ou nível inválidos; forja cancelada.')
  if(hasForge&&star===1)
    throw new Error('Registro de forja ★1 inconsistente; solicitar revisão antes de cobrar.')
  const normalCount=owned-(hasForge?1:0)
  const paidTiers=(tiers||[]).map(x=>({level:Number(x.level),quantity:Number(x.quantity)}))
  if(normalCount<0||paidTiers.some(t=>!Number.isInteger(t.level)||t.level<2||t.level>10||!Number.isInteger(t.quantity)||t.quantity<1))
    throw new Error('Cópias inválidas; forja cancelada.')
  const upgradedCount=paidTiers.reduce((n,x)=>n+x.quantity,0)
  if(upgradedCount>normalCount)
    throw new Error('Inventário divergente dos upgrades; forja cancelada.')
  const baseWeight=hasForge?2**(star-1):0
  const normalRequired=FORJA5_REQUIRED_BASE_COPIES-baseWeight
  const copiesConsumed=hasForge?normalRequired:FORJA5_REQUIRED_BASE_COPIES-1
  const normalNeeded=hasForge?normalRequired:FORJA5_REQUIRED_BASE_COPIES
  const protectedCount=Math.max(0,Math.trunc(Number(boundQuantity)||0))
  // O vínculo é por item_id, não por cópia/nível. Bloquear vínculos ambíguos,
  // pois não há como garantir qual tier seria consumido.
  const ambiguousBound=protectedCount>(hasForge?0:1)
  const protectedNormal=hasForge?0:Math.max(protectedCount,equipped?1:0)
  const donorCapacity=hasForge?normalCount-(equipped?0:0):normalCount-Math.max(1,protectedNormal)
  const missingCopies=Math.max(0,normalRequired-normalCount)
  const missingDonors=Math.max(0,copiesConsumed-donorCapacity)
  const normalLevels=[
    ...paidTiers.flatMap(t=>Array(t.quantity).fill(t.level)),
    ...Array(normalCount-upgradedCount).fill(1)
  ].sort((a,b)=>b-a)
  // Usa primeiro os upgrades já pagos; itens não possuídos são projetados em Lv.1.
  const selectedLevels=normalLevels.slice(0,normalNeeded)
  const simulatedLevels=[...selectedLevels,...Array(Math.max(0,normalNeeded-selectedLevels.length)).fill(1)]
  const perUnit=Number(unitUpgradeCost)
  if(!Number.isSafeInteger(perUnit)||perUnit<=0)throw new Error('Valor de aprimoramento inválido.')
  const invested=level=>((level-1)*level)/2
  const baseUpgradeSteps=simulatedLevels.reduce((n,level)=>n+fullUpgradeSteps-invested(level),0)
  let extraUpgradeSteps=0
  for(let s=2;s<=FORJA5_TARGET_STARS;s++){
    const count=s<=star&&hasForge
      ? normalRequired/2**(s-1)
      : FORJA5_REQUIRED_BASE_COPIES/2**(s-1)
    if(!Number.isInteger(count))throw new Error('Árvore de fusão inconsistente.')
    extraUpgradeSteps+=count*fullUpgradeSteps
  }
  if(hasForge)extraUpgradeSteps+=fullUpgradeSteps-invested(lv)
  const upgradeCost=(baseUpgradeSteps+extraUpgradeSteps)*perUnit
  const complete=hasForge&&star===FORJA5_TARGET_STARS&&lv===MAX_LEVEL
  const convenienceFee=complete?0:FORJA5_FEE
  const total=complete?0:upgradeCost+convenienceFee
  const missingCash=Math.max(0,total-Number(cash||0))
  return {
    stars:star,level:lv,owned,baseWeight,requiredBaseCopies:FORJA5_REQUIRED_BASE_COPIES,
    normalRequired,copiesConsumed,missingCopies,missingDonors,ambiguousBound,
    selectedLevels,baseUpgradeSteps,extraUpgradeSteps,upgradeCost,
    convenienceFee,total,missingCash,cash:Number(cash||0),
    complete,ready:!complete&&!ambiguousBound&&missingCopies===0&&missingDonors===0&&missingCash===0
  }
}
