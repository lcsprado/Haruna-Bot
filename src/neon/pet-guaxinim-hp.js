// Progressão própria do Guaxinim Errante — Leilão dos Quatro Destinos.
// Mais resistente que o perfil genérico, abaixo dos heróis de Collab.
export const GUAXINIM_ERRANTE_SPECIES='guaxinim_errante_20261027'
export const GUAXINIM_ERRANTE_HP_PROFILE=Object.freeze({
  base:190,
  growth:18,
  type:'Coringa — Leilão dos Quatro Destinos'
})

// Mesma fórmula dos demais pets: HP base + crescimento por nível + XP/100 * 2.
export function guaxinimErranteMaxHp(level=1,xp=0){
  const lv=Math.max(1,Number(level)||1)
  const experience=Math.max(0,Number(xp)||0)
  return Math.max(1,Math.floor(
    GUAXINIM_ERRANTE_HP_PROFILE.base+(lv-1)*GUAXINIM_ERRANTE_HP_PROFILE.growth+
    Math.floor(experience/100)*2
  ))
}
