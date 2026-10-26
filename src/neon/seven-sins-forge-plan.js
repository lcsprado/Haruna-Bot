// Forja especial da collab: fragmentos tomam o lugar da copia doadora.
// As outras Raids continuam consumindo copias pelo mecanismo tradicional.
export function sevenSinsForgePlan({
  stars = 1, commonLv10Copies = 0, forgedLevel = 0,
  owned = 0, fragments = 0, requiredFragments = 0
} = {}) {
  const tier = Math.trunc(Number(stars) || 1)
  const convertedLv10 = tier === 1 ? 1 : 0
  const ready = tier === 1
    ? Number(commonLv10Copies) >= 1
    : Number(forgedLevel) === 10
  const quantityReady = Number(owned) >= 1
  const materialReady = Number(fragments) >= Number(requiredFragments)
  return {
    requiredCopies: convertedLv10,
    donorUpgradeRows: convertedLv10,
    inventoryCopiesConsumed: 0,
    ready,
    quantityReady,
    materialReady,
    canForge: tier >= 1 && tier < 5 && ready && quantityReady && materialReady
  }
}
