// PvP V2 only: equipment remains additive to actual combat stats.
// Small matchup corrections calibrate existing class strengths rather than grant
// a guaranteed victory. No database changes, inventory mutations or PvE effects.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export const V2_PVP_DEFENSE_COEFFICIENT=.50
export const V2_PVP_COUNTERS=Object.freeze({paladin:'samurai',samurai:'necromancer',necromancer:'berserker',berserker:'paladin'})
export function pvpDefenseCoefficient(enabled=classesOnlyRebootEnabled()){
 return enabled?V2_PVP_DEFENSE_COEFFICIENT:.45
}
export function v2PvpMatchupAdjustment(from,to,enabled=classesOnlyRebootEnabled()){
 if(!enabled||!from?.classApplied||!to?.classApplied||from.heroId||to.heroId)return 0
 const a=from.classId,b=to.classId,stage=Number(from.awakeningStage)||0,targetStage=Number(to.awakeningStage)||0
 // Samurai's innate initiative already counters Necromancer; temper that
 // advantage with a small sustain-class adjustment. Other matchups retain
 // their natural advantages unless a late-awakening effect needs a correction.
 if(a==='paladin'&&b==='samurai')return stage>=5?0:.025
 if(a==='necromancer'&&b==='samurai')return .045
 if(a==='paladin'&&b==='berserker')return stage>=5?0:.035
 if(a==='berserker'&&b==='paladin')return targetStage>=5?.09:0
 if(a==='samurai'&&b==='paladin')return targetStage>=5?.05:0
 if(a==='berserker'&&b==='necromancer')return .01
 return 0
}
