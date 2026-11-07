// Progressão própria das quatro classes selecionáveis. Não toca stats persistidos.
// O bônus é exclusivamente da classe ativa; heróis de collab nunca o herdam.
// Lv.1: 0 extra; Lv.100: valor definido por função. Despertar é independente.
export const CLASS_LEVEL_MAX=100
export const CLASS_LEVEL_XP_STEP=100
export const CLASS_LEVEL_XP_MAX=(CLASS_LEVEL_MAX-1)*CLASS_LEVEL_XP_STEP
export const CLASS_LEVEL_ROLES=Object.freeze({
  paladin:Object.freeze({hp:90,atk:0,def:13,spd:0}),
  berserker:Object.freeze({hp:55,atk:34,def:3,spd:0}),
  samurai:Object.freeze({hp:20,atk:38,def:0,spd:14}),
  necromancer:Object.freeze({hp:180,atk:36,def:15,spd:0})
})
const bounded=(x,min,max)=>Math.min(max,Math.max(min,Math.floor(Number(x)||0)))
export const classLevelFromXp=xp=>1+Math.floor(bounded(xp,0,CLASS_LEVEL_XP_MAX)/CLASS_LEVEL_XP_STEP)
export const classLevelXpForLevel=level=>(bounded(level,1,CLASS_LEVEL_MAX)-1)*CLASS_LEVEL_XP_STEP
export const classLevelXpRemaining=(level,xp)=>bounded(level,1,CLASS_LEVEL_MAX)>=CLASS_LEVEL_MAX
  ?0:Math.max(0,Math.min(CLASS_LEVEL_XP_STEP,(classLevelFromXp(xp)*CLASS_LEVEL_XP_STEP)-bounded(xp,0,CLASS_LEVEL_XP_MAX)))
export function classLevelBonus(classId,level=1){
  const caps=CLASS_LEVEL_ROLES[String(classId||'').toLowerCase()]
  if(!caps)return {hp:0,atk:0,def:0,spd:0}
  const fraction=(bounded(level,1,CLASS_LEVEL_MAX)-1)/(CLASS_LEVEL_MAX-1)
  return Object.fromEntries(['hp','atk','def','spd'].map(k=>[k,Math.round(caps[k]*fraction)]))
}
// Converte somente o HP de combate temporário para a escala persistente.
// Nunca grava HP temporário da progressão própria em stats.hp.
export function classLevelCombatHp(storedHp,persistentMaxHp,temporaryMaxHp){
  const persistent=Math.max(1,Number(persistentMaxHp)||1)
  const combat=Math.max(1,Number(temporaryMaxHp)||1)
  return Math.min(combat,Math.max(0,Math.round(Math.max(0,Math.min(persistent,Number(storedHp)||0))/persistent*combat)))
}
export function classLevelHpToPersistent(combatHp,combatMaxHp,persistentMaxHp){
  const combat=Math.max(1,Number(combatMaxHp)||1)
  const persistent=Math.max(1,Number(persistentMaxHp)||1)
  return Math.min(persistent,Math.max(0,Math.floor(Math.max(0,Number(combatHp)||0)/combat*persistent)))
}
