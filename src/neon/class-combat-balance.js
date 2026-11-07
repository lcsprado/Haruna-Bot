// Class progression is a combat-only, additive bridge to collab heroes.
// Never persists bonus attributes into stats (avoids double-counting on class swaps).
// A hero's full build must remain superior on average at equal gear/mastery.
export const CLASS_LEVEL_CAP=100;
// Papel de combate: classes nunca recebem o bônus do herói nem somam equipamentos aqui.
// Progressão capada no nível 100, sem alterar stats, Despertar, inventário ou XP.
export const CLASS_ROLE_GROWTH=Object.freeze({
  paladin:Object.freeze({hp:400,atk:0,def:35,spd:0}),      // HP + DEF, menor ataque
  berserker:Object.freeze({hp:180,atk:35,def:8,spd:4}),    // maior ataque; defesa menor
  samurai:Object.freeze({hp:220,atk:30,def:12,spd:18}),    // dano + iniciativa
  necromancer:Object.freeze({hp:250,atk:24,def:15,spd:6})  // dreno e sustentação pelas técnicas
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
  // O bônus final da classe é dividido em 100 parcelas; Lv.N = N/100.
  const factor=classLevelFromGeneralLevel(level)/CLASS_LEVEL_CAP;
  return Object.fromEntries(['hp','atk','def','spd'].map(key=>[key,Math.round(Number(target?.[key]||0)*factor)]));
}
export function classCombatStats(stats,classId,level,active=true){
  const bonus=active?classCombatGrowth(classId,level):{hp:0,atk:0,def:0,spd:0};
  return {maxHp:Number(stats.max_hp||0)+bonus.hp,atk:Number(stats.atk||0)+bonus.atk,
    def:Number(stats.def||0)+bonus.def,spd:Number(stats.spd||0)+bonus.spd,bonus};
}

// XP da classe é independente do nível geral e dos níveis dos heróis.
// A progressão usa a tabela original de XP por nível do RPG, sem criar
// atributo permanente nem permitir extrapolar os 100 níveis.
export function classLevelAdvance(currentLevel=1,currentXp=0,awardedXp=0){
  let level=classLevelFromGeneralLevel(currentLevel);
  let xp=Math.max(0,Math.floor(Number(currentXp)||0));
  let remaining=Math.max(0,Math.floor(Number(awardedXp)||0));
  if(level>=CLASS_LEVEL_CAP)return {level:CLASS_LEVEL_CAP,xp:0,levels:0};
  xp+=remaining;
  const original=level;
  while(level<CLASS_LEVEL_CAP&&xp>=Math.max(100,level*100)){
    xp-=Math.max(100,level*100);
    level++;
  }
  if(level>=CLASS_LEVEL_CAP)xp=0;
  return {level,xp,levels:level-original};
}
