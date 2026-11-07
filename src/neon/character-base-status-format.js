import {getPlayerClass,getClassPassive,getAwakeningSkillDescriptions} from './game-catalog.js'
import {PVP_AWAKENING_ROLES} from './pvp-class-powers.js'
import {classCombatStats,classTraining,CLASS_LEVEL_MAX_XP} from './class-level-progression.js'

const formatNumber=value=>Number(value||0).toLocaleString('pt-BR')
const stageNumber=value=>Math.max(1,Math.min(5,Math.floor(Number(value)||1)))
const romanStage=value=>['I','II','III','IV','V'][stageNumber(value)-1]

// Despertar tem aumentos permanentes já gravados em stats; não somar de novo.
export function formatActiveClassBaseStatus(profile,awakeningStage=1,classLevel=1){
  if(!profile)return '';
  const id=String(profile.class_id||'warrior').toLowerCase()
  const cls=getPlayerClass(id),roman=romanStage(awakeningStage)
  const passive=getClassPassive(id,profile.class_applied)
  const trained=classCombatStats(profile,classLevel)
  const currentSkill=profile.class_applied?
    getAwakeningSkillDescriptions(id)[stageNumber(awakeningStage)-1]||null:null
  return [
    '🧙 *STATUS BASE — '+cls.name.toUpperCase()+'*',
    '🎭 '+cls.role,
    '⭐ Nível geral: *'+formatNumber(profile.level||1)+'*',
    '🌟 Nível da classe: *'+formatNumber(classLevel)+'/100*',
    '❤️ HP: *'+formatNumber(trained.maxHp)+'*',
    '⚔️ ATK: *'+formatNumber(trained.atk)+'*',
    '🛡️ DEF: *'+formatNumber(trained.def)+'*',
    '👢 VEL: *'+formatNumber(trained.spd)+'*',
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


// Leitura da classe registrada mesmo quando o usuário está usando herói.
// stats já contém todos os ganhos permanentes de nível e Despertar: não
// adicionar AWAKENING_TIERS ou o bônus da classe novamente.
export function formatSavedClassStatus(profile,awakeningStage=1,heroActive=false,classLevel=1,classXp=0){
  if(!profile)return '';
  if(!profile.class_applied)return '🧙 Você ainda não escolheu uma classe. Use *!classe* para começar.';
  const id=String(profile.class_id||'warrior').toLowerCase();
  const cls=getPlayerClass(id);
  const stage=stageNumber(awakeningStage);
  const passive=getClassPassive(id,true);
  const skillDescriptions=getAwakeningSkillDescriptions(id).slice(0,stage);
  const role=PVP_AWAKENING_ROLES[id]||{attack:0,defense:0};
  const pct=n=>(Number(n||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  const training=classTraining(id,classLevel,true);
  const trained=classCombatStats(profile,classLevel);
  const bonus={
    hp:Number(profile.class_hp_bonus||0)+training.hp,
    atk:Number(profile.class_atk_bonus||0)+training.atk,
    def:Number(profile.class_def_bonus||0)+training.def,
    spd:Number(profile.class_spd_bonus||0)+training.spd
  };
  const trainedAtAll=Object.values(training).some(n=>n>0);
  const attr=(icon,label,key,value)=>icon+' '+label+': *'+formatNumber(value)+'* ('
    +formatNumber(value-bonus[key])+' permanente + '+formatNumber(bonus[key])+(trainedAtAll?' classe/treino)':' da classe)');
  return [
    '🧙 *STATUS DA CLASSE — '+cls.name.toUpperCase()+'*',
    '🎭 '+cls.role,
    heroActive?'⚠️ *CLASSE PRESERVADA — INATIVA* (herói da collab equipado)':'✅ *CLASSE ATIVA*',
    '⭐ Nível geral do jogador: *'+formatNumber(profile.level||1)+'*',
    '🌟 Nível da classe: *'+formatNumber(classLevel)+'/100*',
    '✨ XP da classe: *'+formatNumber(Math.min(CLASS_LEVEL_MAX_XP,Number(classXp||0)))+'/'+formatNumber(CLASS_LEVEL_MAX_XP)+'*',
    '🌌 Despertar: *'+romanStage(stage)+'/V*',
    '📈 Evolução própria, independente do nível geral e do Despertar.',
    attr('❤️','HP base sem itens','hp',trained.maxHp),
    attr('⚔️','ATK base sem itens','atk',trained.atk),
    attr('🛡️','DEF base sem itens','def',trained.def),
    attr('👢','VEL base sem itens','spd',trained.spd),
    '🏋️ Treino da classe: ❤️ +'+formatNumber(training.hp)+
      ' • ⚔️ +'+formatNumber(training.atk)+' • 🛡️ +'+formatNumber(training.def)+' • 👢 +'+formatNumber(training.spd),
    ...(passive?['⚜️ Passiva: *'+passive.name+'* — '+passive.description]:[]),
    '⚔️ *DESPERTAR NO PVP*',
    '💥 Bônus de função atual: +'+pct(Number(role.attack||0)*stage/5)+' dano • -'+pct(Number(role.defense||0)*stage/5)+' dano recebido.',
    '✨ Passiva e técnicas da classe funcionam no PvP conforme seus requisitos e limites.',
    '🐉 *HABILIDADES DE DESPERTAR EM BOSS/RAID*',
    ...skillDescriptions.map((skill,i)=>'• '+romanStage(i+1)+': '+skill),
    'ℹ️ Sem equipamentos, pets ou encantamentos. O Despertar permanente já está nos atributos acima; treino de classe não é gravado em stats.'
  ].join('\n');
}
