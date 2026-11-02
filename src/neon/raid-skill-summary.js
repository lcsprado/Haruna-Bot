import {PLAYER_CLASSES} from './game-catalog.js'
import {PECADOS_HEROES} from './sete-pecados-catalog.js'

// Telemetria somente de apresentação: observa a execução, sem alterar dano/HP/cura.
const HERO_NAMES=Object.fromEntries(PECADOS_HEROES.map(hero=>[hero.species,hero.name]))
const safeNumber=x=>Math.max(0,Math.floor(Number(x)||0))
const ratio=(hp,maxHp)=>Number(maxHp)>0?Number(hp)/Number(maxHp):1
const names={
  pecado_meliodas:['Full Counter preparado','Revenge Counter'],
  pecado_escanor:['Cruel Sun','The One'],
  pecado_diane:['Creation','Mother Catastrophe'],
  pecado_king:['Chastiefol — Guardian','Chastiefol — Sunflower'],
  pecado_merlin:['Exterminate','Perfect Cube'],
  pecado_gowther:['Rewrite Light','Nightmare Teller']
}

// Apenas habilidades que tiveram gatilho de verdade (não contam buff permanente como proc).
export function raidAttackSkillEvents({heroId=null,classId='',classApplied=false,masteryStage=1,awakeningStage=0,
  attackIndex=0,critical=false,hp=0,maxHp=1,previousState={},result={}}={}){
  if(heroId){
    if(heroId==='pecado_ban')return [...(result.banActivations||[])]
    const out=[],stage=safeNumber(masteryStage),index=safeNumber(attackIndex)
    const specials=names[heroId]||[]
    if(heroId==='pecado_meliodas'&&result.technique==='Full Counter')out.push('Full Counter')
    if(stage>=2&&index>0&&index%8===0&&specials[0])out.push(specials[0])
    if(stage>=3&&index>0&&index%25===0&&specials[1])out.push(specials[1])
    return out
  }
  if(!classApplied)return []
  const id=String(classId||''),stage=safeNumber(awakeningStage),index=safeNumber(attackIndex)
  const prev=previousState||{},events=[],health=ratio(hp,maxHp)
  if(id==='mage'){
    if(result.proc)events.push('Explosão Arcana')
    if(stage>=2&&index>0&&index%8===0)events.push('Explosão')
    if(stage>=4&&(result.proc||(stage>=3&&index>0&&index%8===0)))events.push('Barreira Arcana')
  }else if(id==='warrior'){
    if(stage>=3&&index>0&&index%4===0)events.push('Ímpeto de Guerra')
    if(stage>=4&&prev.warriorRiposte)events.push('Aparar de Ferro')
    if(stage>=5&&health<.30&&!prev.warriorBannerUsed)events.push('Último Estandarte')
  }else if(id==='assassin'){
    if(stage>=2&&prev.finisherReady)events.push('Execução')
  }else if(id==='archer'){
    if(stage>=2&&index>0&&index%6===0)events.push('Flecha Perfurante')
    if(stage>=5&&index>0&&index%6===0&&Number(prev.archerMarks||0)>=4)events.push('Flecha Celestial')
  }else if(id==='paladin'){
    if(stage>=2&&index>0&&index%8===0)events.push('Julgamento Divino')
    if(Number(result.heal||0)>0)events.push('Bênção Restauradora')
    if(stage>=3&&index>0&&index%8===0&&health<.50)events.push('Égide Celestial')
  }else if(id==='berserker'){
    if(health<.40)events.push('Fúria de Sangue')
    if(stage>=4&&prev.berserkerRevengeReady&&health<.40)events.push('Retaliação Sangrenta')
    if(stage>=5&&health<.25)events.push('Frenesi Mortal')
  }else if(id==='monk'){
    if(stage>=2&&prev.counterReady)events.push('Contra-ataque')
    if(Number(result.heal||0)>0)events.push('Chi Vital')
  }else if(id==='necromancer'){
    if(Number(result.heal||0)>0)events.push('Drenagem de Almas')
    if(stage>=2&&index>0&&index%7===0)events.push('Maldição')
    if(stage>=5&&index>0&&index%4===0&&Number(prev.necroSouls||0)>=4)events.push('Colheita Final')
  }else if(id==='druid'){
    if(Number(result.heal||0)>0)events.push('Natureza Viva')
    if(stage>=3&&Number(result.heal||0)>0)events.push('Semente Curativa')
  }else if(id==='samurai'){
    if(critical)events.push('Lâmina Perfeita')
    if(stage>=3&&critical&&Number(prev.samuraiFocus||0)>0)events.push('Postura Iai')
    if(stage>=5&&critical&&Number(prev.samuraiFocus||0)>=4)events.push('Corte da Lua')
  }
  return events
}

export function raidDefenseSkillEvents({heroId=null,classId='',classApplied=false,awakeningStage=0,
  previousState={},result={}}={}){
  if(heroId||!classApplied)return []
  const stage=safeNumber(awakeningStage),id=String(classId||''),prev=previousState||{},after=result.awakeningState||{},events=[]
  if(id==='monk'&&result.dodged)events.push('Reflexos Supremos')
  if(id==='paladin'&&stage>=5&&!prev.paladinMiracleUsed&&after.paladinMiracleUsed)events.push('Intervenção Divina')
  if(id==='warrior'&&stage>=4&&Number(after.warriorBlocks||0)>0&&Number(after.warriorBlocks)%5===0)
    events.push('Aparar de Ferro')
  return events
}

export function incrementRaidSkillCounts(existing={},events=[]){
  const result={...(existing||{})}
  for(const name of events||[]){
    if(typeof name!=='string'||!name||name.length>55)continue
    result[name]=Math.min(100000, safeNumber(result[name])+1)
  }
  return result
}

// UMA linha por jogador, cobrindo todos os sete heróis e todas as classes (inclusive legadas).
export function formatRaidSkillLine({activeHeroId=null,playerClassId='',playerClassApplied=true,
  heroSkillActivations=null,skillActivations=null,skillTrackingPartial=false}={},fmt=x=>safeNumber(x).toLocaleString('pt-BR')){
  const character=activeHeroId?HERO_NAMES[activeHeroId]||'Herói':PLAYER_CLASSES[playerClassId]?.name||'Classe'
  const counts=skillActivations||heroSkillActivations||{}
  const entries=Object.entries(counts).filter(([name,n])=>name&&safeNumber(n)>0)
  if(!activeHeroId&&!playerClassApplied)return '\n⚡ *Sem classe ativa*'
  const partial=skillTrackingPartial?'(contagem parcial) ':'' 
  if(!entries.length)return '\n⚡ *'+character+':* '+partial+'nenhum gatilho especial'
  const selected=entries.slice(0,3).map(([name,n])=>name+' '+fmt(n)+'×')
  if(entries.length>3)selected.push('+'+(entries.length-3)+' outros')
  return '\n⚡ *'+character+':* '+partial+selected.join(' · ')
}
