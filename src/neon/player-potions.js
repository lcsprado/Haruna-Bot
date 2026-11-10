// Regra única de cura de personagens, usada por comandos, web, Boss e Raid.
// Mantém o piso histórico para jogadores iniciantes; escala com o HP máximo.
export const PLAYER_POTIONS = Object.freeze({
  pocao_p: Object.freeze({name:'Poção Pequena', fraction:0.10, minimum:35}),
  pocao_m: Object.freeze({name:'Poção Média', fraction:0.20, minimum:80}),
  pocao_g: Object.freeze({name:'Poção Grande', fraction:0.40, minimum:160}),
  elixir_supremo: Object.freeze({name:'Elixir Supremo', fraction:1, minimum:0}),
})

export function playerPotionHealAmount(itemId,maxHp) {
  const potion=PLAYER_POTIONS[itemId]
  const hp=Number(maxHp)
  if(!potion || !Number.isFinite(hp) || hp<=0) return 0
  return Math.max(potion.minimum,Math.ceil(Math.floor(hp)*potion.fraction))
}
