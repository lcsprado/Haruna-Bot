// PvP V2: no turn limit; exhaustion prevents endless defensive/healing loops.
export function pvpFatigueDamage(attackIndex,targetMaxHp){
 const excess=Math.max(0,Math.floor(Number(attackIndex)||0)-40)
 if(!excess)return 0
 return Math.ceil(Math.max(1,Number(targetMaxHp)||1)*Math.min(1,excess*.01))
}
export function pvpLevelUpHp(hp,newMaxHp,preserve=false){
 const max=Math.max(1,Number(newMaxHp)||1)
 return preserve?Math.max(0,Math.min(max,Number(hp)||0)):max
}
// Raid V2 snapshots must not overwrite damage or healing from other modes.
export function raidLiveCombatHp(snapshotHp,combatMaxHp,storedMaxHp,liveHp){
 const max=Math.max(1,Number(combatMaxHp)||1),storedMax=Math.max(1,Number(storedMaxHp)||1)
 const live=Math.max(0,Math.min(storedMax,Number(liveHp)||0))
 const snapshot=Math.max(0,Math.min(max,Number(snapshotHp)||0))
 return Math.round(snapshot/max*storedMax)===live?snapshot:Math.round(live/storedMax*max)
}
