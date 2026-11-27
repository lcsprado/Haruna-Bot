// Rebalanceamento exclusivamente do dano RECEBIDO pelo pet nas Raids Lv.40/50 V2 e Lv.70/75.
// Não altera PvP, Boss, dano do jogador, habilidades, drops nem recompensas.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export const RAID_HIGH_TIER_PET_DAMAGE_REDUCTION=0.30
// Raid70 V2: a duração de 50 minutos exige armadura e pet preparados.
export function raidPlayerDefenseCoefficient(level,{enabled=classesOnlyRebootEnabled()}={}){
  return enabled&&Number(level)===70?.55:.22
}
export const V2_RAID70_PET_DAMAGE_MULTIPLIER=.08

export function raidPetDamageMultiplier(level,{enabled=classesOnlyRebootEnabled(),mode='manual'}={}){
  // Long solo Raidlote Lv.40 fights: reduce pet wear, without touching manual raids.
  if(enabled&&Number(level)===40)return mode==='lote'?.15:.35
  if(enabled&&Number(level)===50)return .30
  if(enabled&&Number(level)===70)return V2_RAID70_PET_DAMAGE_MULTIPLIER
  return Number(level)===70||Number(level)===75
    ?1-RAID_HIGH_TIER_PET_DAMAGE_REDUCTION
    :1
}

// Recebe dano já calculado com DEF do pet e especial da Raid.
// Preserva pelo menos 1 de dano em cada golpe válido.
export function mitigateRaidPetDamage(level,baseDamage,options={}){
  const damage=Math.max(0,Math.round(Number(baseDamage)||0))
  return damage===0?0:Math.max(1,Math.round(damage*raidPetDamageMultiplier(level,options)))
}

// Horizonte conservador da autocura de 2 rodadas: replica a mesma mitigação
// sobre a estimativa máxima pré-DEF, para não comprar poção desnecessária.
export function estimatedRaidPetHit(level,bossAttack,options={}){
  const attack=Math.max(0,Number(bossAttack)||0)
  return Math.ceil(attack*.60*raidPetDamageMultiplier(level,options))
}
