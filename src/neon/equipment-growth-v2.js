// V2: progress across stars without resetting effective strength.
// The old maximum at each star is preserved. At ★2+ each level earns
// one tenth of that star's incremental budget; ★1 retains its old curve.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export const EQUIPMENT_LEVEL_SCALE=Object.freeze([1,1.10,1.22,1.36,1.52,1.70,1.90,2.10,2.30,2.50])
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(v)||min)))
export function equipmentGrowthMultiplier(level=1,stars=1,enabled=classesOnlyRebootEnabled()){
 const lv=clamp(level,1,10),st=clamp(stars,1,5)
 if(!enabled||st===1)return EQUIPMENT_LEVEL_SCALE[lv-1]*(1+.04*(st-1))
 return (250+10*(st-2)+lv)/100
}
// Manual first shield forge uses two ordinary Lv.1 shields, not a maxed
// principal. Keep this entry progression and budget; later stars require Lv.10.
export function shieldGrowthMultiplier(level=1,stars=1,enabled=classesOnlyRebootEnabled()){
 const lv=clamp(level,1,10),st=clamp(stars,1,5)
 if(!enabled||st<=2)return (1+.5*((lv-1)/9))*(1+.04*(st-1))
 return (1500+60*(st-2)+6*lv)/1000
}
