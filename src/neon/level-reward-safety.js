export function unlockedLevelMilestones(level, claimedMilestones){
  const claimed=new Set(claimedMilestones.map(Number))
  const unlocked=[]
  for(let milestone=5;milestone<=Math.min(level,100);milestone+=5)
    if(!claimed.has(milestone)) unlocked.push(milestone)
  for(let milestone=110;milestone<=Math.min(level,199);milestone+=10)
    if(!claimed.has(milestone)) unlocked.push(milestone)
  for(let milestone=200;milestone<=level;milestone+=20)
    if(!claimed.has(milestone)) unlocked.push(milestone)
  return unlocked
}

export function levelRewardHistoryProblem({level,claimedMilestones,auditedMilestones,recoveryActive}){
  const claimed=new Set(claimedMilestones.map(Number))
  const audited=new Set(auditedMilestones.map(Number))
  const unlocked=unlockedLevelMilestones(level,[...claimed])
  if(!unlocked.length) return null
  if(unlocked.some(milestone=>audited.has(milestone)))
    return 'Um resgate anterior desapareceu do registro principal.'
  const highestClaimed=Math.max(0,...claimed)
  if(unlocked.some(milestone=>milestone<highestClaimed))
    return 'O histórico de recompensas de nível apresenta lacunas.'
  if(recoveryActive && claimed.size===0)
    return 'O banco temporário não comprova os resgates anteriores deste jogador.'
  return null
}
