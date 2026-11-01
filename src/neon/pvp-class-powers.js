// PvP Awakening: bounded adaptations of the existing Boss/Raid class skills.
// Isolated from classAttack/classDefense so PvE tuning cannot accidentally change.
// All state lives inside ONE duel; no progression, consumables or DB changes.
import {classAttack,classDefense,classCritBonus} from './game-catalog.js'

const stageOf=(applied,stage)=>applied?Math.max(0,Math.min(5,Math.floor(Number(stage)||0))):0
const clamp=(v,low,high)=>Math.max(low,Math.min(high,Number(v)||0))
const rounded=(n)=>Math.max(0,Math.round(Number(n)||0))
// Role-tailored PvP strength at Awakening V. Scale linearly for I–V.
// Heroes gain +700 HP, +75 ATK, +100 DEF and +25 SPD at Lv.100;
// without a controlled PvP bridge, no classic class can compete at full build.
// Bonuses are combat-only and never touch stored character stats or PvE.
export const PVP_AWAKENING_ROLES=Object.freeze({
 warrior:{attack:.11,defense:.11},assassin:{attack:.16,defense:.06},
 mage:{attack:.21,defense:.09},archer:{attack:.15,defense:.07},
 paladin:{attack:.06,defense:.18},berserker:{attack:.23,defense:.08},
 monk:{attack:.10,defense:.12},necromancer:{attack:.13,defense:.10},
 druid:{attack:.08,defense:.17},samurai:{attack:.18,defense:.08}
})
const addShield=(s,maxHp,ratio)=>{
  if(Number(s.shieldsCreated||0)>=2)return
  const amount=Math.ceil(Math.max(1,Number(maxHp)||1)*ratio)
  s.shield=Math.min(Math.ceil(maxHp*.06),Math.max(Number(s.shield||0),amount))
  s.shieldsCreated=Number(s.shieldsCreated||0)+1
}

export function classPvpCritBonus(classId,applied=true,awakeningStage=0){
  const id=String(classId||'').toLowerCase(),stage=stageOf(applied,awakeningStage)
  return classCritBonus(id,applied,0,'pvp')+(id==='assassin'?(stage>=5?.05:stage>=3?.03:stage>=1?.01:0):0)+(stage>=2&&id==='samurai'?.01:0)
}

export function classPvpAttack({
  classId,applied=true,damage=0,critical=false,hp=1,maxHp=1,
  attackIndex=1,lastProcAttack=0,roll=Math.random(),awakeningStage=0,awakeningState={}
}={}){
  const id=String(classId||'').toLowerCase(),stage=stageOf(applied,awakeningStage)
  const base=classAttack({classId:id,applied,damage,critical,hp,maxHp,
    attackIndex,lastProcAttack,roll,awakeningStage:0,context:'pvp'})
  const state={...(awakeningState||{})}
  if(!stage)return {...base,awakeningState:state,technique:null,skillActivated:false}
  const index=Math.max(1,Math.floor(Number(attackIndex)||1))
  const ratio=clamp(Number(hp)/Math.max(1,Number(maxHp)||1),0,1)
  let bonus=0,heal=Number(base.heal||0),technique=null
  const trigger=(name)=>{technique=name}
  if(id==='warrior'){
    bonus+=.01
    if(stage>=3){
      if(index%4===0)state.momentum=Math.min(3,Number(state.momentum||0)+1)
      bonus+=.01*Number(state.momentum||0)
    }
    if(stage>=4&&state.riposte){bonus+=stage>=5?.10:.06;state.riposte=false;trigger('Contra-ataque de Guerra')}
    if(stage>=5&&ratio<.30&&!state.banner){state.banner=true;addShield(state,maxHp,.04);trigger('Último Estandarte')}
  }else if(id==='assassin'){
    if(stage>=2){
      if(state.executionReady){
        bonus+=stage>=5?.20:.12;state.executionReady=false
        state.crits=stage>=5?1:0;trigger('Execução')
        if(stage>=3)state.bleed=2
        if(stage>=4)state.smoke=true
      }else if(critical){
        state.crits=Math.min(3,Number(state.crits||0)+1)
        if(state.crits>=(stage>=5?2:3))state.executionReady=true
      }
    }
    if(stage>=3&&Number(state.bleed||0)>0){bonus+=.02;state.bleed--;trigger(technique||'Ferida Sombria')}
  }else if(id==='mage'){
    if(base.proc&&stage>=1){bonus+=.02;trigger('Arcano Amplificado')}
    if(stage>=3&&(index%6===0||base.proc))state.charges=Math.min(2,Number(state.charges||0)+1)
    if(stage>=2&&index%(stage>=5?4:8)===0){
      bonus+=stage>=5?.12:.10
      if(stage>=3&&state.charges>0){bonus+=stage>=5?.09:.05;state.charges--}
      trigger('Explosão Arcana')
    }
    if(stage>=4&&base.proc){addShield(state,maxHp,.03);trigger(technique||'Barreira Arcana')}
  }else if(id==='archer'){
    bonus+=.01
    if(stage>=3)state.marks=Math.min(3,Number(state.marks||0)+1)
    if(stage>=2&&index%6===0){bonus+=.08;trigger('Flecha Perfurante')}
    if(stage>=3&&critical){
      bonus+=.02*Number(state.marks||0)
      if(stage>=4&&state.marks>=3)state.guard=true
      state.marks=0
      trigger('Marca de Caça')
    }
    if(stage>=5&&index%6===0&&state.marks>=3){
      bonus+=.13;state.marks=0;state.guard=true;trigger('Flecha Celestial')
    }
  }else if(id==='paladin'){
    if(stage>=1&&index%8===0&&ratio<.5)
      heal=Math.max(heal,Math.floor(maxHp*.02))
    if(stage>=2&&index%8===0){bonus+=.10;trigger('Julgamento Divino')}
    if(stage>=3&&index%8===0&&ratio<.5){addShield(state,maxHp,.03);trigger('Égide Celestial')}
  }else if(id==='berserker'){
    if(ratio<.4)bonus+=.01
    if(stage>=2&&ratio<.25)bonus+=.03
    if(stage>=5&&ratio<.60){bonus+=.04;trigger('Frenesi Mortal')}
    if(stage>=3){
      if(ratio>.5)state.fury=0
      else if(ratio<.4)state.fury=Math.min(3,Number(state.fury||0)+1)
      bonus+=.01*Number(state.fury||0)
    }
    if(stage>=4&&state.retaliation&&ratio<.4){bonus+=.03;state.retaliation=false;trigger('Retaliação Sangrenta')}
    if(stage>=5){
      state.frenzy=ratio<.25?Math.min(3,Number(state.frenzy||0)+1):0
      bonus+=.01*Number(state.frenzy||0)
      if(state.frenzy>=3)trigger('Frenesi Mortal')
    }
  }else if(id==='monk'){
    if(stage>=2&&state.counter){bonus+=stage>=5?.18:.10;state.counter=false;trigger('Punho Celestial')}
    if(stage>=3){
      if(index%8===0)state.chi=Math.min(2,Number(state.chi||0)+1)
      if(state.chi>0&&ratio<.9){
        heal=Math.max(heal,Math.floor(maxHp*(stage>=5?.02:.015)*state.chi))
        state.chi=0;trigger(technique||'Chi Vital')
      }
    }
  }else if(id==='necromancer'){
    if(stage>=1&&index%(stage>=5?3:4)===0&&hp>0)
      heal=Math.max(heal,Math.min(Math.ceil(maxHp*(stage>=5?.08:.03)),Math.floor(base.damage*(stage>=5?.10:.03))))
    if(stage>=2&&index%7===0){bonus+=.08;trigger('Maldição')}
    if(stage>=3)bonus+=.008*Number(state.souls||0)
    if(stage>=5&&index%4===0&&state.souls>=3){bonus+=.12;state.souls=0;trigger('Colheita Final')}
    if(stage>=3&&index%(stage>=5?3:4)===0&&hp>0){
      state.souls=Math.min(3,Number(state.souls||0)+1)
      if(stage>=4)addShield(state,maxHp,.02)
      trigger(technique||'Drenagem Superior')
    }
  }else if(id==='druid'){
    if(index%(stage>=5?4:stage>=3?6:8)===0&&hp>0){
      const pct=stage>=5?(ratio<.35?.04:.03):stage>=3?.025:.02
      heal=Math.max(heal,Math.floor(maxHp*pct))
      if(stage>=3){addShield(state,maxHp,stage>=5?.03:.02);trigger('Semente Curativa')}
      else trigger('Natureza Viva')
    }
  }else if(id==='samurai'){
    if(critical){if(stage>=1)bonus+=.02
      if(stage>=3&&state.focus>0){
        const count=Number(state.focus)
        bonus+=stage>=5&&count>=3?.18:.03*count
        if(stage>=4)state.parry=true
        trigger(stage>=5&&count>=3?'Corte da Lua':'Postura Iai')
      }
      state.focus=0
    }else if(stage>=3){state.focus=Math.min(3,Number(state.focus||0)+1)}
  }
  // Additional PvP-only damage is bounded even when effects coincide.
  const role=PVP_AWAKENING_ROLES[id]||{attack:0,defense:0}
  const roleBonus=Number(role.attack||0)*stage/5
  const result=Math.max(1,Math.round(base.damage*(1+clamp(bonus,0,.22))*(1+roleBonus)))
  return {damage:result,heal:Math.max(0,heal),proc:base.proc,
    lastProcAttack:base.lastProcAttack,awakeningState:state,technique,
    skillActivated:Boolean(technique)}
}

export function classPvpDefense({
  classId,applied=true,damage=0,roll=Math.random(),hp=1,maxHp=1,
  awakeningStage=0,awakeningState={}
}={}){
  const id=String(classId||'').toLowerCase(),stage=stageOf(applied,awakeningStage)
  const state={...(awakeningState||{})},incoming=rounded(damage)
  // Existing class passives remain active even without awakening.
  const base=classDefense({classId:id,applied,damage:incoming,roll,
    hp,maxHp,awakeningStage:0,context:'pvp'})
  let n=base.damage,healAfter=0,technique=null,shieldAbsorbed=0
  const monkAwakenedDodge=id==='monk'&&stage>=1&&!base.dodged&&roll>=.03&&roll<.04
  if(base.dodged||monkAwakenedDodge){
    if(id==='monk'&&stage>=2){state.counter=true
      if(stage>=3)state.chi=Math.min(2,Number(state.chi||0)+1)
      if(stage>=4)state.guard=true
    }
    return {...base,damage:0,dodged:true,awakeningState:state,blocked:incoming,shieldAbsorbed:0,
      healAfter:0,technique:stage>=2?'Reflexos Supremos':null}
  }
  const ratio=clamp(Number(hp)/Math.max(1,Number(maxHp)||1),0,1)
  const role=PVP_AWAKENING_ROLES[id]||{attack:0,defense:0}
  let reduction=Number(role.defense||0)*stage/5
  if(id==='warrior'){
    if(stage>=2&&ratio<.5)reduction+=.01
    if(stage>=4){
      state.hits=Number(state.hits||0)+1
      if(state.hits%5===0){reduction+=.08;state.riposte=true;technique='Aparar de Ferro'}
    }
  }else if(id==='assassin'&&stage>=4&&state.smoke){
    reduction+=.06;state.smoke=false;technique='Passo Fantasma'
  }else if(id==='paladin'){
    if(stage>=4)reduction+=.01
    if(stage>=5&&!state.miracle&&n>=hp&&hp>0){
      state.miracle=true
      n=Math.max(0,Math.floor(Number(hp)-Math.ceil(maxHp*.05)))
      technique='Intervenção Divina'
    }
  }else if(id==='berserker'&&stage>=4&&ratio<.4){
    state.retaliation=true;technique='Retaliação Sangrenta'
  }else if(id==='monk'&&stage>=4&&state.guard){
    reduction+=.08;state.guard=false;technique='Defesa Fluida'
  }else if(id==='druid'){
    if(stage>=2&&ratio<.6)reduction+=.02
    if(stage>=4&&state.roots){reduction+=.08;state.roots=false;technique='Raízes Antigas'}
  }else if(id==='samurai'&&stage>=4&&state.parry){
    reduction+=.08;state.parry=false;technique='Parada Perfeita'
  }
  n=Math.max(0,Math.round(n*(1-Math.min(.24,reduction))))
  if(stage>=3&&Number(state.shield||0)>0){
    shieldAbsorbed=Math.min(n,Number(state.shield)||0)
    n-=shieldAbsorbed
    state.shield=Math.max(0,Number(state.shield)-shieldAbsorbed)
    if(id==='druid'&&stage>=4&&state.shield===0&&shieldAbsorbed>0)state.roots=true
    if(shieldAbsorbed>0)technique=technique||'Escudo de Despertar'
  }
  return {damage:n,dodged:false,awakeningState:state,blocked:incoming-n,
    shieldAbsorbed,healAfter,technique}
}
