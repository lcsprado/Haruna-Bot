// Reward specialties follow combat slot weights, without requiring synergy.
export function petTeamRewardBonuses(activeBonus,activeSlot,team=[],bonusFor=()=>({})){
  const slot=Number(activeSlot);
  if(!activeBonus||![1,3].includes(slot))return {xp:0,drop:0};
  const rate=n=>Math.max(0,Math.min(.15,Number(n)||0));
  const result={xp:rate(activeBonus.xp),drop:rate(activeBonus.drop)};
  const seen=new Set([slot]);
  for(const row of team||[]){
    const n=Number(row?.slot);
    if(![1,2,3].includes(n)||seen.has(n)||!(Number(row.hp)>0&&Number(row.energy)>0))continue;
    seen.add(n);
    const weight=n===1?1:n===2?.5:.25;
    const bonus=bonusFor(row);
    for(const k of ['xp','drop'])result[k]+=rate(bonus?.[k])*weight;
  }
  return result;
}
