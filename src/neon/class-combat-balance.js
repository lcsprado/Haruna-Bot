// Class progression is a combat-only, additive bridge to collab heroes.
// Never persists bonus attributes into stats (avoids double-counting on class swaps).
// A hero's full build must remain superior on average at equal gear/mastery.
export const CLASS_LEVEL_CAP=100;
// Papel de combate: classes nunca recebem o bônus do herói nem somam equipamentos aqui.
// Progressão capada no nível 100, sem alterar stats, Despertar, inventário ou XP.
export const CLASS_ROLE_GROWTH=Object.freeze({
  paladin:Object.freeze({hp:350,atk:5,def:33,spd:4}),      // tanque
  berserker:Object.freeze({hp:190,atk:39,def:17,spd:9}),    // dano bruto
  samurai:Object.freeze({hp:260,atk:35,def:27,spd:21}),     // duelista veloz
  necromancer:Object.freeze({hp:310,atk:40,def:30,spd:9})  // dano + drenagem
});
// HP escalonado só na luta, proporcional ao HP persistido e sem cura gratuita.
export const classCombatHp=(persistentHp,persistentMaxHp,combatMaxHp)=>{
  const source=Math.max(1,Number(persistentMaxHp)||1),target=Math.max(1,Number(combatMaxHp)||1);
  const hp=Math.max(0,Math.min(source,Number(persistentHp)||0));
  return Math.max(0,Math.min(target,Math.round(hp/source*target)));
};
export const classPersistentHp=(combatHp,combatMaxHp,persistentMaxHp)=>
  classCombatHp(combatHp,combatMaxHp,persistentMaxHp);
export const classLevelFromGeneralLevel=value=>Math.max(1,Math.min(CLASS_LEVEL_CAP,Math.floor(Number(value)||1)));
export function classCombatGrowth(classId,level){
  const target=CLASS_ROLE_GROWTH[String(classId||'').toLowerCase()];
  const factor=(classLevelFromGeneralLevel(level)-1)/(CLASS_LEVEL_CAP-1);
  return Object.fromEntries(['hp','atk','def','spd'].map(key=>[key,Math.round(Number(target?.[key]||0)*factor)]));
}
export function classCombatStats(stats,classId,level,active=true){
  const bonus=active?classCombatGrowth(classId,level):{hp:0,atk:0,def:0,spd:0};
  return {maxHp:Number(stats.max_hp||0)+bonus.hp,atk:Number(stats.atk||0)+bonus.atk,
    def:Number(stats.def||0)+bonus.def,spd:Number(stats.spd||0)+bonus.spd,bonus};
}
