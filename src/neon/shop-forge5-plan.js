// Planejamento puro do !forja5. Nenhuma alteracao de banco ocorre nesta etapa.
export const FORJA5_SERVICE_FEE = 500000
const FORJA5_PLAN_VERSION = 'v2-lv10-all-donors'
const MAX_STARS = 5
const MAX_LEVEL = 10

const whole = (value, label) => {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Dados invalidos da forja: '+label)
  return n
}
const toLevel = value => {
  const n = whole(value, 'nivel')
  if (n < 1 || n > MAX_LEVEL) throw new Error('Nivel de copia fora de 1 a 10.')
  return n
}
const sumUpgrade = (base, from) => base * (45 - (from - 1) * from / 2)

export function planShopForge5(input) {
  const quantity = whole(input.quantity || 0, 'quantidade')
  const cash = whole(input.cash || 0, 'carteira')
  const bank = whole(input.bank || 0, 'banco')
  const price = whole(input.price, 'preco')
  const base = whole(input.upgradeBase, 'base de upgrade')
  const isShield = input.category === 'shield'
  if (!['weapon', 'armor', 'shield'].includes(input.category) || !price || !base) {
    throw new Error('Equipamento nao elegivel a forja automatica.')
  }
  const forged = input.forged || null
  const stars = forged ? whole(forged.stars, 'estrelas') : 1
  const forgedLevel = forged ? toLevel(forged.level) : 0
  if (stars < 1 || stars > MAX_STARS || (forged && quantity < 1)) {
    throw new Error('Estado inconsistente da forja.')
  }
  const tiers = (input.tiers || []).map(t => ({
    level: toLevel(t.level),
    quantity: whole(t.quantity, 'quantidade aprimorada')
  })).filter(t => t.quantity)
  if (tiers.some(t => t.level === 1)) throw new Error('Copia Lv.1 nao pode constar entre as aprimoradas.')
  const unique = new Set(tiers.map(t => t.level))
  if (unique.size !== tiers.length) throw new Error('Niveis duplicados de copias.')
  const paid = tiers.reduce((n,t) => n + t.quantity, 0)
  const normal = quantity - (forged ? 1 : 0)
  if (normal < paid) throw new Error('Inventario e copias evoluidas divergentes.')
  const buckets = new Map(tiers.map(t => [t.level,t.quantity]))
  buckets.set(1,normal-paid)
  const take = (predicate = () => true) => {
    for (let level=10; level>=1; level--) {
      if (predicate(level) && (buckets.get(level)||0)>0) {
        buckets.set(level,buckets.get(level)-1)
        return level
      }
    }
    return null
  }
  // Preserva uma peca principal. Copias protegidas adicionais jamais viram doadoras.
  const principalBought = !forged && quantity === 0
  const principalLevel = forged ? forgedLevel : (take() || 1)
  const protectedCount = Math.min(quantity, whole(input.protectedCount || 0, 'copias protegidas'))
  let protectedExtras = Math.max(0,protectedCount-1)
  for (let level=10; level>=1 && protectedExtras>0; level--) {
    const reserve = Math.min(protectedExtras,buckets.get(level)||0)
    buckets.set(level,(buckets.get(level)||0)-reserve)
    protectedExtras -= reserve
  }
  const donorsRequired = MAX_STARS-stars
  const donorLevels=[]
  for (let i=0;i<donorsRequired;i++) {
    // No !forja5, TODAS as doadoras devem chegar ao Lv.10. A forja
    // manual dos escudos continua com a sua regra propria (doadora Lv.1).
    // Priorizar Lv.10 evita recomprar uma copia quando ja existe outra evoluida.
    const level=take()
    if (level===null) break
    donorLevels.push(level)
  }
  const donorPurchases = donorsRequired-donorLevels.length
  const buyCopies = (principalBought?1:0)+donorPurchases
  const purchases = buyCopies*price
  const lv10cost = sumUpgrade(base,1)
  // Etapas: levar principal ao Lv.10, levar cada doadora ao Lv.10,
  // forjar uma estrela (reinicia principal no Lv.1), leva-la ao Lv.10,
  // repetir ate ★5. Sempre cobra apenas os niveis ainda nao pagos.
  const principalUpgrade = sumUpgrade(base,principalBought?1:principalLevel)
  const donorUpgrade = donorLevels.reduce((n,level)=>n+sumUpgrade(base,level),0)
    + donorPurchases*lv10cost
  const forgedResetsUpgrade = donorsRequired*lv10cost
  const upgrades = principalUpgrade+donorUpgrade+forgedResetsUpgrade
  let forgeFees = 0
  if (isShield) {
    for (let star=stars;star<MAX_STARS;star++) {
      const step = whole(input.shieldFees?.[star], 'taxa da estrela do escudo')
      forgeFees += step
    }
  }
  const alreadyFull = Boolean(forged && stars===MAX_STARS && forgedLevel===MAX_LEVEL)
  const serviceFee = alreadyFull ? 0 : FORJA5_SERVICE_FEE
  const total = purchases+upgrades+forgeFees+serviceFee
  if (![purchases,upgrades,forgeFees,total].every(Number.isSafeInteger)) {
    throw new Error('Custo da forja excede limite de seguranca.')
  }
  const paidConsumption = new Map()
  if (!forged && !principalBought && principalLevel>1) {
    paidConsumption.set(principalLevel,1)
  }
  for (const level of donorLevels) if (level>1) {
    paidConsumption.set(level,(paidConsumption.get(level)||0)+1)
  }
  const consumedTiers = [...paidConsumption].map(([level,count])=>({level,count}))
  // Impede confirmar uma proposta anterior ao ajuste de custos depois do deploy.
  const quoteKey = JSON.stringify([
    FORJA5_PLAN_VERSION,input.itemId,input.category,input.rarity,price,base,quantity,
    tiers.map(t=>[t.level,t.quantity]).sort((a,b)=>a[0]-b[0]),
    stars,forgedLevel,protectedCount,Boolean(input.equipped),cash,bank,
    principalLevel,donorLevels,buyCopies,total
  ])
  return {
    itemId:input.itemId,name:input.name,category:input.category,rarity:input.rarity,
    quantityBefore:quantity,stars,forgedLevel,principalLevel,principalBought,donorsRequired,
    donorLevels,donorPurchases,consumedTiers,buyCopies,price,
    purchases,upgrades,principalUpgrade,donorUpgrade,forgedResetsUpgrade,
    forgeFees,serviceFee,total,alreadyFull,
    cash,bank,shortage:Math.max(0,total-cash-bank),
    canExecute:!alreadyFull && cash+bank>=total,quoteKey
  }
}
