// Resistência crítica de chefes (pontos percentuais, subtraídos dos bônus brutos).
// Não é um teto para o crítico do jogador: bônus acima de 100% continuam úteis.
// Raids de entrada (10–40) ficam sem resistência para não penalizar iniciantes.
export const BOSS_CRIT_RESISTANCE = 0.15

export function raidBossCritResistance(level) {
  const lv=Number(level)||0
  if(lv>=75) return 0.35
  if(lv>=70) return 0.30
  if(lv>=65) return 0.25
  if(lv>=60) return 0.20
  if(lv>=50) return 0.15
  return 0
}

export function effectivePveCritChance(rawChance, resistance=0) {
  const raw=Number(rawChance)
  const resist=Number(resistance)
  return Math.min(1,Math.max(0,(Number.isFinite(raw)?raw:0)-(Number.isFinite(resist)?Math.max(0,resist):0)))
}

export function critResistancePercent(value) {
  return Math.round(Number(value||0)*100)
}
