// A Raid escala +12% do HP-base por jogador simultâneo adicional.
// O HP máximo já registrado funciona como teto histórico: sair e reentrar
// não pode somar novamente uma parcela de HP ao mesmo combate.
export function scaleRaidHpOnLateJoin({baseHp,currentHp,currentMaxHp,playersAfterJoin}){
  const base=Math.max(0,Number(baseHp)||0)
  const oldMaxHp=Math.max(base,Number(currentMaxHp)||0)
  const oldHp=Math.max(0,Math.min(oldMaxHp,Number(currentHp)||0))
  const count=Math.max(1,Math.floor(Number(playersAfterJoin)||1))
  const targetMaxHp=Math.round(base*(1+Math.max(0,count-1)*.12))
  const addedHp=Math.max(0,targetMaxHp-oldMaxHp)
  return {
    maxHp:oldMaxHp+addedHp,
    hp:Math.min(oldMaxHp+addedHp,oldHp+addedHp),
    addedHp
  }
}
