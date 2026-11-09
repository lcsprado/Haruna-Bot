// Chance de critico unica para !perfil, !status e duelo.
// Herói ativo substitui a classe tradicional e desativa seus bônus e Despertar.
import {classPvpCritBonus} from './pvp-class-powers.js'
const valid=value=>Number.isFinite(Number(value))?Number(value):0
export function pvpCritChance({equipmentCrit=0,classId='warrior',classApplied=false,
 awakeningStage=0,heroActive=false,collabCrit=0,petCrit=0}={}){
 const classBonus=classPvpCritBonus(classId,Boolean(classApplied)&&!heroActive,
  heroActive?0:awakeningStage)
 return Math.max(0,.10+valid(equipmentCrit)+classBonus+
  valid(collabCrit)+valid(petCrit))
}
