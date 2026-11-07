// Evolucao independente das quatro classes selecionaveis.
// Todos os bonus sao SOMENTE de combate. Nunca gravar nos atributos de stats.
export const CLASS_LEVEL_MAX=100;
export const CLASS_LEVEL_DAILY_XP_CAP=500;
export const CLASS_LEVEL_XP_PER_LEVEL=100;
export const CLASS_LEVEL_MAX_XP=(CLASS_LEVEL_MAX-1)*CLASS_LEVEL_XP_PER_LEVEL;
export const CLASS_LEVEL_GROWTH=Object.freeze({
  paladin:Object.freeze({hp:105,atk:5,def:17,spd:1}),
  berserker:Object.freeze({hp:110,atk:15,def:9,spd:4}),
  samurai:Object.freeze({hp:110,atk:15,def:10,spd:5}),
  necromancer:Object.freeze({hp:150,atk:14,def:16,spd:6})
});
const ZERO=Object.freeze({hp:0,atk:0,def:0,spd:0});
export const classLevelFromXp=xp=>Math.min(CLASS_LEVEL_MAX,1+
  Math.floor(Math.max(0,Math.min(CLASS_LEVEL_MAX_XP,Math.floor(Number(xp)||0)))/CLASS_LEVEL_XP_PER_LEVEL));
export function classTraining(classId,level=1,applied=true){
  const target=applied?CLASS_LEVEL_GROWTH[String(classId||'').toLowerCase()]:null;
  if(!target)return ZERO;
  const progress=(Math.max(1,Math.min(CLASS_LEVEL_MAX,Math.floor(Number(level)||1)))-1)/(CLASS_LEVEL_MAX-1);
  return Object.fromEntries(Object.entries(target).map(([attr,max])=>[attr,Math.round(max*progress)]));
}
export function classCombatStats(st,level=1){
  if(!st)return null;
  const growth=classTraining(st.class_id,level,Boolean(st.class_applied));
  return {
    maxHp:Math.max(1,Number(st.max_hp||100)+growth.hp),
    atk:Math.max(1,Number(st.atk||10)+growth.atk),
    def:Math.max(0,Number(st.def||0)+growth.def),
    spd:Math.max(1,Number(st.spd||10)+growth.spd),
    growth
  };
}
export function classEffectiveCombatHp(st,combatStats,equipmentHp=0){
  const gear=Math.max(0,Number(equipmentHp)||0);
  const storedMax=Math.max(1,Number(st?.max_hp||100)+gear);
  const combatMax=Math.max(1,Number(combatStats?.maxHp||st?.max_hp||100)+gear);
  const hp=Math.max(0,Math.min(storedMax,Number(st?.hp)||0));
  return Math.max(0,Math.min(combatMax,Math.round(hp/storedMax*combatMax)));
}
// Usar tambem ao terminar PvP: vida temporaria da classe nunca altera stats.max_hp.
export function classHpToPersistent(hp,combatMaxHp,persistentMaxHp){
  const combat=Math.max(1,Number(combatMaxHp)||1);
  const original=Math.max(1,Number(persistentMaxHp)||1);
  return Math.max(0,Math.min(original,
    Math.max(Number(hp)>0?1:0,Math.floor(Math.max(0,Number(hp)||0)/combat*original))));
}
