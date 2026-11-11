// Rebalanceamento exclusivamente do dano RECEBIDO pelo pet nas Raids Lv.70/75.
// Não altera PvP, Boss, dano do jogador, habilidades, drops nem recompensas.
export const RAID_HIGH_TIER_PET_DAMAGE_REDUCTION=0.30

export function raidPetDamageMultiplier(level){
  return Number(level)===70||Number(level)===75
    ?1-RAID_HIGH_TIER_PET_DAMAGE_REDUCTION
    :1
}

// Recebe dano já calculado com DEF do pet e especial da Raid.
// Preserva pelo menos 1 de dano em cada golpe válido.
export function mitigateRaidPetDamage(level,baseDamage){
  const damage=Math.max(0,Math.round(Number(baseDamage)||0))
  return damage===0?0:Math.max(1,Math.round(damage*raidPetDamageMultiplier(level)))
}

// Horizonte conservador da autocura de 2 rodadas: replica a mesma mitigação
// sobre a estimativa máxima pré-DEF, para não comprar poção desnecessária.
export function estimatedRaidPetHit(level,bossAttack){
  const attack=Math.max(0,Number(bossAttack)||0)
  return Math.ceil(attack*.60*raidPetDamageMultiplier(level))
}
