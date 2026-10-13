// Apresentação e cálculo de XP das casas do RPG.
export const homeTrainingReward=(house,level)=>{
 const lv=Math.max(1,Math.min(999,Math.floor(Number(level)||1)))
 const base=Math.max(0,Math.floor(Number(house?.trainingXp)||0))
 const percent=Math.max(0,Number(house?.trainingPercent)||0)
 const bonus=lv>=999?0:Math.floor(lv*100*percent/100)
 return {base,bonus,total:lv>=999?0:base+bonus,percent}
}
export const homeRestCapacity=house=>3+Math.max(0,Math.floor(Number(house?.reserveRestSlots)||0))
export const homeRestDescription=house=>{
 const n=Math.max(0,Math.floor(Number(house?.reserveRestSlots)||0))
 return n?`até 3 do time + ${n} reserva${n>1?'s':''}`:'até 3 pets do time'
}
const brl=n=>Math.floor(Number(n)||0).toLocaleString('pt-BR')
const pct=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:2})
export function homeBenefitsText(h){
 return [`⚔️ Treino 24h: +${brl(h.trainingXp)} XP fixos + ${pct(h.trainingPercent)}% do XP para o próximo nível`,
   `😴 Sono 8h: +${pct(h.sleepXpPercent)}% do XP para o próximo nível`,
   `🐾 Descanso 24h: +${pct(h.petRestPercent)}% HP/energia (${homeRestDescription(h)})`].join('\n')
}
export function homeCatalogText(houses,title='🏠 *IMÓVEIS DO ALPHA BOT*'){
 const lines=[title,'']
 houses.forEach((h,i)=>{lines.push(`*${i+1}.* 🏡 *${h.name}* — R$ ${brl(h.price)}`,homeBenefitsText(h),'')})
 lines.push('⏱️ Treino e descanso: 1 vez a cada 24h.')
 lines.push('🏡 Seu imóvel vale 60% como entrada em outro superior.')
 lines.push('💎 O valor integral do imóvel entra no patrimônio.')
 lines.push('👉 Responda com o número do imóvel.\n0️⃣ Cancelar')
 return lines.join('\n')
}
