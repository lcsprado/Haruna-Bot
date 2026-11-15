// PvP AUTO: no player input during battle. Pure and deterministic.
// No imports from manual !duelo prototype. Flag-off existing combat is unchanged.
export const AUTO_POSTURES=Object.freeze(['equilibrada','agressiva','defensiva','tatica','adaptativa']);
export const AUTO_ROLE_IDS=Object.freeze([
  'warrior','paladin','berserker','necromancer','samurai','assassin','mage','archer','monk','druid',
  'pecado_meliodas','pecado_ban','pecado_diane','pecado_escanor','pecado_king','pecado_gowther','pecado_merlin'
]);
const ROLES=new Set(AUTO_ROLE_IDS);
const TANKS=new Set(['paladin','druid','pecado_diane','pecado_king','monk']);
const BURST=new Set(['samurai','berserker','assassin','archer','pecado_escanor','pecado_meliodas']);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(x))?Number(x):lo));
export function normalizedAutoPosture(value){
  const p=String(value||'equilibrada').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return AUTO_POSTURES.includes(p)?p:'equilibrada';
}
export function chooseAutoPosture({selected='equilibrada',combatantId,ownHpRatio=1,enemyHpRatio=1}={}){
  const requested=normalizedAutoPosture(selected);
  if(requested!=='adaptativa')return requested;
  const own=clamp(ownHpRatio,0,1),enemy=clamp(enemyHpRatio,0,1);
  if(own<=.35)return 'defensiva';
  if(enemy<=.25&&own>.45)return 'agressiva';
  if(TANKS.has(combatantId))return 'defensiva';
  if(BURST.has(combatantId))return 'agressiva';
  return 'tatica';
}
// Small rock-paper-scissors effect, never forces the winner.
export function autoPostureAdvantages(ours,theirs){
  return (ours==='agressiva'&&theirs==='defensiva') ||
    (ours==='defensiva'&&theirs==='tatica') ||
    (ours==='tatica'&&theirs==='agressiva');
}
export function autoCombatModifiers({
  combatantId,posture='equilibrada',opponentPosture='equilibrada',
  ownHpRatio=1,enemyHpRatio=1,
  opponentCombatantId=null,attackTechnique=false
}={}){
  const selected=normalizedAutoPosture(posture);
  const current=chooseAutoPosture({selected,combatantId,ownHpRatio,enemyHpRatio});
  const enemy=chooseAutoPosture({selected:opponentPosture,combatantId:opponentCombatantId,
    ownHpRatio:enemyHpRatio,enemyHpRatio:ownHpRatio});
  if(!ROLES.has(String(combatantId||''))||current==='equilibrada')
    return Object.freeze({posture:current,attackMultiplier:1,damageReduction:0,receivedMultiplier:1});
  let attack=0,defense=0,exposure=0;
  if(current==='agressiva'){attack=.04;exposure=.03;}
  else if(current==='defensiva'){attack=-.03;defense=.05;}
  else if(current==='tatica'){attack=-.01;defense=.015;if(attackTechnique)attack+=.03;}
  if(autoPostureAdvantages(current,enemy)){
    if(current==='agressiva')attack+=.02;
    else if(current==='defensiva')defense+=.02;
    else if(current==='tatica')defense+=.02;
  }
  // Flexibility has a tradeoff: adaptive bonuses and penalties use 70% intensity.
  const scale=selected==='adaptativa'?.7:1;
  return Object.freeze({
    posture:current,
    attackMultiplier:1+clamp(attack*scale,-.06,.08),
    damageReduction:clamp(defense*scale,0,.08),
    receivedMultiplier:1+clamp(exposure*scale,0,.05)
  });
}
