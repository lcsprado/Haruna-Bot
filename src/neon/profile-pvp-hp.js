import {applyVitalCombatHp} from './vital-pets.js';

// Perfil e PvP devem mostrar o mesmo HP de combate quando pet/equipe são os mesmos.
// Só calcula uma projeção: o HP armazenado no banco permanece na escala normal.
export function profilePvpHp({hp=0,maxHp=1,petHpRate=0,teamHpRate=0}={}){
  return applyVitalCombatHp(hp,maxHp,petHpRate,teamHpRate,{pvp:true})
}
const fmt=n=>Math.max(0,Math.round(Number(n)||0)).toLocaleString('pt-BR')
export function profileHpLines({normalHp=0,normalMaxHp=1,pvpHp=normalHp,pvpMaxHp=normalMaxHp,origin=''}={}){
  const normalMax=Math.max(1,Number(normalMaxHp)||1)
  const normal=Math.max(0,Math.min(normalMax,Number(normalHp)||0))
  const fightingMax=Math.max(1,Number(pvpMaxHp)||1)
  const fighting=Math.max(0,Math.min(fightingMax,Number(pvpHp)||0))
  if(Math.round(fightingMax)===Math.round(normalMax))
    return '❤️ HP: *'+fmt(normal)+'/'+fmt(normalMax)+'*'+origin
  return '❤️ HP no PvP: *'+fmt(fighting)+'/'+fmt(fightingMax)+'*'+
    '\n❤️ HP normal: *'+fmt(normal)+'/'+fmt(normalMax)+'*'+origin+
    '\n🧬 HP extra do pet é temporário e já está incluído no HP do PvP.'
}
