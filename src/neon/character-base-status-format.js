import {getPlayerClass,getClassPassive,getAwakeningSkillDescriptions} from './game-catalog.js'

const formatNumber=value=>Number(value||0).toLocaleString('pt-BR')
const stageNumber=value=>Math.max(1,Math.min(5,Math.floor(Number(value)||1)))
const romanStage=value=>['I','II','III','IV','V'][stageNumber(value)-1]

// Despertar tem aumentos permanentes já gravados em stats; não somar de novo.
export function formatActiveClassBaseStatus(profile,awakeningStage=1){
  if(!profile)return '';
  const id=String(profile.class_id||'warrior').toLowerCase()
  const cls=getPlayerClass(id),roman=romanStage(awakeningStage)
  const passive=getClassPassive(id,profile.class_applied)
  const currentSkill=profile.class_applied?
    getAwakeningSkillDescriptions(id)[stageNumber(awakeningStage)-1]||null:null
  return [
    '🧙 *STATUS BASE — '+cls.name.toUpperCase()+'*',
    '🎭 '+cls.role,
    '⭐ Nível: *'+formatNumber(profile.level||1)+'*',
    '❤️ HP: *'+formatNumber(profile.max_hp)+'*',
    '⚔️ ATK: *'+formatNumber(profile.atk)+'*',
    '🛡️ DEF: *'+formatNumber(profile.def)+'*',
    '👢 VEL: *'+formatNumber(profile.spd)+'*',
    ...(passive?['⚜️ Passiva: *'+passive.name+'*']:[]),
    '🌌 Despertar: *'+roman+'/V*',
    ...(currentSkill?['✨ Habilidade do Despertar '+roman+': '+currentSkill]:[])
  ].join('\n')
}

export function formatSavedAwakeningForActiveHero(profile,awakeningStage=1){
  if(!profile)return '';
  const cls=getPlayerClass(String(profile.class_id||'warrior').toLowerCase())
  return '🌌 Despertar da classe '+cls.name+': *'+romanStage(awakeningStage)+
    '/V* (preservado; habilidades inativas enquanto o herói estiver ativo)'
}
