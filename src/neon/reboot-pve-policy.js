// Política de PvE V2: valores candidatos, sem I/O ou mudanças na V1.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export const V2_WEEKLY_BOSS=Object.freeze({hp:150000,atk:45})
export const V2_COMMON_BOSS=Object.freeze({cashPool:2500,xpPool:120,minShare:.02,boxChance:.03})
export function commonBossRewardV2(damage,total){
 if(!Number.isSafeInteger(damage)||!Number.isSafeInteger(total)||damage<=0||total<damage||damage/total<V2_COMMON_BOSS.minShare)
  return {cash:0,xp:0,boxChance:0}
 return {cash:Math.floor(V2_COMMON_BOSS.cashPool*damage/total),xp:Math.floor(V2_COMMON_BOSS.xpPool*damage/total),boxChance:V2_COMMON_BOSS.boxChance}
}
export function dungeonCashV2(mult,roll){
 if(![1,1.2,1.5,2].includes(mult)||!Number.isFinite(roll)||roll<0||roll>=1)throw RangeError('Recompensa de Dungeon inválida')
 return Math.floor((250+Math.floor(roll*251))*mult)
}
export function dungeonAwakeningEnabled(context,{enabled=classesOnlyRebootEnabled()}={}){
 return context==='boss'||context==='raid'||(enabled&&context==='dungeon')
}
