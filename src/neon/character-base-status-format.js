import {getPlayerClass,getClassPassive,getAwakeningSkillDescriptions} from './game-catalog.js'
import {PVP_AWAKENING_ROLES} from './pvp-class-powers.js'
import {classLevelBonus,classLevelXpRemaining} from './class-level-progression.js'

const formatNumber=value=>Number(value||0).toLocaleString('pt-BR')
const stageNumber=value=>Math.max(1,Math.min(5,Math.floor(Number(value)||1)))
const romanStage=value=>['I','II','III','IV','V'][stageNumber(value)-1]

// Despertar tem aumentos permanentes já gravados em stats; não somar de novo.
export function formatActiveClassBaseStatus(profile,awakeningStage=1){
  if(!profile)return '';
  const id=String(profile.class_id||'warrior').toLowerCase()
  const cls=getPlayerClass(id),roman=romanStage(awakeningStage)
  const passive=getClassPassive(id,profile.class_applied)
  const classLevel=Math.max(1,Math.min(100,Number(profile.class_level||1)))
  const levelBonus=profile.class_applied?classLevelBonus(id,classLevel):{hp:0,atk:0,def:0,spd:0}
  const currentSkill=profile.class_applied?
    getAwakeningSkillDescriptions(id)[stageNumber(awakeningStage)-1]||null:null
  return [
    '🧙 *STATUS BASE — '+cls.name.toUpperCase()+'*',
    '🎭 '+cls.role,
    '⭐ Nível geral: *'+formatNumber(profile.level||1)+'*',
    '🌟 Nível da classe: *'+classLevel+'/100*',
    '❤️ HP: *'+formatNumber(Number(profile.max_hp||0)+levelBonus.hp)+'*',
    '⚔️ ATK: *'+formatNumber(Number(profile.atk||0)+levelBonus.atk)+'*',
    '🛡️ DEF: *'+formatNumber(Number(profile.def||0)+levelBonus.def)+'*',
    '👢 VEL: *'+formatNumber(Number(profile.spd||0)+levelBonus.spd)+'*',
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
export function formatSavedClassStatus(profile,awakeningStage=1,heroActive=false){
  if(!profile)return '';
  if(!profile.class_applied)return '🧙 Você ainda não escolheu uma classe. Use *!classe* para começar.';
  const id=String(profile.class_id||'warrior').toLowerCase();
  const cls=getPlayerClass(id);
  const stage=stageNumber(awakeningStage);
  const classLevel=Math.max(1,Math.min(100,Number(profile.class_level||1)));
  const xp=Math.max(0,Number(profile.class_xp||0));
  const training=classLevelBonus(id,classLevel);
  const passive=getClassPassive(id,true);
  const skillDescriptions=getAwakeningSkillDescriptions(id).slice(0,stage);
  const role=PVP_AWAKENING_ROLES[id]||{attack:0,defense:0};
  const pct=n=>(Number(n||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  const bonus={
    hp:Number(profile.class_hp_bonus||0),
    atk:Number(profile.class_atk_bonus||0),
    def:Number(profile.class_def_bonus||0),
    spd:Number(profile.class_spd_bonus||0)
  };
  const attr=(icon,label,key,value)=>icon+' '+label+': *'+formatNumber(value+training[key])+'* ('
    +formatNumber(value-bonus[key])+' permanente + '+formatNumber(bonus[key])+' da classe'
    +(training[key]?' + '+formatNumber(training[key])+' evolução':'')+')';
  return [
    '🧙 *STATUS DA CLASSE — '+cls.name.toUpperCase()+'*',
    '🎭 '+cls.role,
    heroActive?'⚠️ *CLASSE PRESERVADA — INATIVA* (herói da collab equipado)':'✅ *CLASSE ATIVA*',
    '⭐ Nível geral do jogador: *'+formatNumber(profile.level||1)+'*',
    '🌟 Nível da classe: *'+classLevel+'/100*',
    '📈 EXP da classe: *'+formatNumber(xp)+'/9.900*'+(classLevel<100?' • faltam '+classLevelXpRemaining(classLevel,xp)+' XP para o próximo nível':''),
    '🌌 Despertar: *'+romanStage(stage)+'/V*',
    '📖 Classe evolui com a EXP geral recebida enquanto estiver ativa; Despertar permanece independente.',
    attr('❤️','HP base sem itens','hp',Number(profile.max_hp||0)),
    attr('⚔️','ATK base sem itens','atk',Number(profile.atk||0)),
    attr('🛡️','DEF base sem itens','def',Number(profile.def||0)),
    attr('👢','VEL base sem itens','spd',Number(profile.spd||0)),
    ...(passive?['⚜️ Passiva: *'+passive.name+'* — '+passive.description]:[]),
    '⚔️ *DESPERTAR NO PVP*',
    '💥 Bônus de função atual: +'+pct(Number(role.attack||0)*stage/5)+' dano • -'+pct(Number(role.defense||0)*stage/5)+' dano recebido.',
    '✨ Passiva e técnicas da classe funcionam no PvP conforme seus requisitos e limites.',
    '🐉 *HABILIDADES DE DESPERTAR EM BOSS/RAID*',
    ...skillDescriptions.map((skill,i)=>'• '+romanStage(i+1)+': '+skill),
    'ℹ️ Sem equipamentos, pets, encantamentos ou sinergias. Bônus de nível da classe são temporários; Despertar permanente já está incluído na base.'
  ].join('\n');
}
