// Regras puras do Boss de farm pré-collab: isoladas dos outros eventos e da economia.
export const COLLAB_FRAGMENT_ITEM='fragmento_ascensao_pecados_20261024'
export const COLLAB_FARM_ID='sete_pecados_fragmentos_20261024'
export const COLLAB_FARM_KEY='sete-pecados-fragmentos-20261024'
export const COLLAB_FARM_START=Date.parse('2026-10-24T21:00:00-03:00')
export const COLLAB_FARM_END=Date.parse('2026-10-24T23:55:00-03:00')
export const COLLAB_FARM_PHASES=Object.freeze([
  Object.freeze({name:'Guardião dos Selos I — Despertar',hp:320000,atk:220}),
  Object.freeze({name:'Guardião dos Selos II — Ruptura',hp:440000,atk:280}),
  Object.freeze({name:'Guardião dos Selos III — Cólera',hp:560000,atk:340}),
  Object.freeze({name:'Guardião dos Selos IV — Ascensão',hp:680000,atk:400})
])
export const COLLAB_FRAGMENTS_PER_PHASE=24
export const COLLAB_MIN_DAMAGE=10000
export const COLLAB_PET_UPGRADE_FRAGMENTS=12
export const COLLAB_PET_UPGRADE_XP=500
export const COLLAB_GEAR_UPGRADE_FRAGMENTS=12
// Até 60% do HP por jogador; impossível derrotar uma fase sozinho.
export function collabRemainingPersonalDamage(maxHp,previousDamage){
  return Math.max(0,Math.floor(Math.max(0,Number(maxHp)||0)*0.60)-Math.max(0,Number(previousDamage)||0))
}
export function collabEligibleForFragments(damage){
  return Math.max(0,Number(damage)||0)>=COLLAB_MIN_DAMAGE
}
