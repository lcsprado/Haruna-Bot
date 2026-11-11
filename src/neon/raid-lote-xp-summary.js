// Somente recibos persistidos de vitorias contam para XP e bonus do pacote.
export function summarizeRaidLoteXp(reports=[]){
 let totalXp=0,bonusXp=0
 for(const attempt of Array.isArray(reports)?reports:[]){
  if(attempt?.status!=='won')continue
  for(const reward of Array.isArray(attempt.reward_summary?.rewards)?attempt.reward_summary.rewards:[]){
   const xp=Number(reward?.exp||0),bonus=Number(reward?.xpBoostBonus||0)
   if(!Number.isSafeInteger(xp)||xp<0)continue
   totalXp+=xp
   if(Number.isSafeInteger(bonus)&&bonus>0)bonusXp+=Math.min(bonus,xp)
  }
 }
 return {totalXp,bonusXp}
}
