// Regras compartilhadas pelo menu e pelas transações: cópias Lv.1 podem ser
// vendidas individualmente; cópias aprimoradas somente na liquidação integral,
// sem peça equipada, vinculada ou forjada.
export function equipmentSalePolicy({
  quantity = 0, equipped = false, boundQuantity = 0,
  upgradedQuantity = 0, hasForge = false, sellable = true
} = {}) {
  const owned = Math.max(0, Math.trunc(Number(quantity) || 0))
  const bound = Math.max(0, Math.trunc(Number(boundQuantity) || 0))
  const upgraded = Math.max(0, Math.trunc(Number(upgradedQuantity) || 0))
  const forged = hasForge ? 1 : 0
  const inconsistent = upgraded + forged > owned
  const basic = inconsistent ? 0 : owned - upgraded - forged
  const protectedQuantity = Math.max(equipped ? 1 : 0, bound)
  const regularSellable = sellable && !inconsistent
    ? Math.max(0, Math.min(basic, owned - protectedQuantity))
    : 0
  const canSellAll = Boolean(sellable && !inconsistent && owned > 0 &&
    protectedQuantity === 0 && !hasForge)
  return {
    basic, regularSellable, canSellAll,
    maxSellable: canSellAll ? owned : regularSellable,
    inconsistent
  }
}

export function equipmentSaleQuantityAllowed(policy, quantity, owned) {
  const qty = Number(quantity)
  return Number.isSafeInteger(qty) && qty > 0 &&
    (qty <= policy.regularSellable ||
      (policy.canSellAll && qty === Number(owned)))
}
