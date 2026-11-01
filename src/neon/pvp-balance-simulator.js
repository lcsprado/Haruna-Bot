// Deterministic, read-only PvP balance model using the SAME combat skill functions
// as production. Does not load a database, mutate player data or award rewards.
import {PLAYER_CLASSES,classCritBonus} from './game-catalog.js'
import {HERO_COMBAT_PROFILES,heroCombatStats,heroPvpAttack,heroPvpDefense} from './playable-heroes-core.js'
import {classPvpAttack,classPvpDefense,classPvpCritBonus} from './pvp-class-powers.js'

export const PVP_AUDIT_BASELINE=Object.freeze({max_hp:3118,hp:3118,atk:787,def:381,spd:391,
  class_hp_bonus:0,class_atk_bonus:0,class_def_bonus:0,class_spd_bonus:0})
export const PVP_COMBATANTS=Object.freeze([...Object.keys(HERO_COMBAT_PROFILES),...Object.keys(PLAYER_CLASSES)])
export const PVP_EQUAL_GEAR=Object.freeze({hp:900,atk:300,def:300,spd:35,crit:.06})

function rng(seed){
  let x=seed>>>0
  return ()=>{x=(x+0x6d2b79f5)>>>0;let y=Math.imul(x^(x>>>15),1|x);
    y^=y+Math.imul(y^(y>>>7),61|y);return ((y^(y>>>14))>>>0)/4294967296}
}
export function buildFairFighter(id,{gear=false,awakening=5,mastery=5}={}){
  const hero=HERO_COMBAT_PROFILES[id]||null,cl=PLAYER_CLASSES[id]||null
  if(!hero&&!cl)throw new Error('Unknown PvP combatant '+id)
  const stats=hero?heroCombatStats(PVP_AUDIT_BASELINE,id,100):{
    maxHp:PVP_AUDIT_BASELINE.max_hp+cl.hp,atk:PVP_AUDIT_BASELINE.atk+cl.atk,
    def:PVP_AUDIT_BASELINE.def+cl.def,spd:PVP_AUDIT_BASELINE.spd+cl.spd}
  const g=gear?PVP_EQUAL_GEAR:{hp:0,atk:0,def:0,spd:0,crit:0}
  return {id,hero:Boolean(hero),awakening:hero?0:awakening,mastery:hero?mastery:0,
    maxHp:stats.maxHp+g.hp,hp:stats.maxHp+g.hp,atk:stats.atk+g.atk,def:stats.def+g.def,
    spd:stats.spd+g.spd,crit:Math.min(.40,.10+g.crit+(hero?0:classPvpCritBonus(id,true,awakening))),
    hits:0,lastProcAttack:0,heroState:{},awakeningState:{},metrics:{damage:0,received:0,blocked:0,
      healed:0,criticals:0,dodges:0,shield:0,abilities:0}}
}
export function simulateFairDuel(idA,idB,{seed=1,gear=false,awakening=5,mastery=5}={}){
  if(idA===idB)throw new Error('use two different combatants')
  const random=rng(seed),a=buildFairFighter(idA,{gear,awakening,mastery}),
    b=buildFairFighter(idB,{gear,awakening,mastery})
  const first=a.spd>=b.spd?a:b,second=first===a?b:a
  const hit=(from,to)=>{
    from.hits++
    const crit=random()<from.crit
    let raw=Math.max(1,Math.round((from.atk-to.def*.45)*(.85+random()*.30)))
    if(crit)raw=Math.round(raw*1.6)
    const attack=from.hero?heroPvpAttack({heroId:from.id,damage:raw,hp:from.hp,maxHp:from.maxHp,
      attackIndex:from.hits,masteryStage:from.mastery,state:from.heroState}):
      classPvpAttack({classId:from.id,applied:true,damage:raw,critical:crit,hp:from.hp,maxHp:from.maxHp,
        attackIndex:from.hits,lastProcAttack:from.lastProcAttack,roll:random(),
        awakeningStage:from.awakening,awakeningState:from.awakeningState})
    if(from.hero)from.heroState=attack.state
    else {from.awakeningState=attack.awakeningState;from.lastProcAttack=attack.lastProcAttack}
    const defend=to.hero?heroPvpDefense({heroId:to.id,damage:attack.damage,state:to.heroState}):
      classPvpDefense({classId:to.id,applied:true,damage:attack.damage,hp:to.hp,maxHp:to.maxHp,
        roll:random(),awakeningStage:to.awakening,awakeningState:to.awakeningState})
    if(to.hero)to.heroState=defend.state
    else to.awakeningState=defend.awakeningState
    const damage=Math.max(0,Number(defend.damage)||0)
    const actual=Math.min(to.hp,damage)
    to.hp=Math.max(0,to.hp-damage)
    from.metrics.damage+=actual
    to.metrics.received+=actual
    to.metrics.blocked+=Math.max(0,Number(attack.damage||0)-damage)
    to.metrics.shield+=Number(defend.shieldAbsorbed||0)
    if(defend.dodged)to.metrics.dodges++
    if(crit&&!defend.dodged)from.metrics.criticals++
    if(attack.technique)from.metrics.abilities++
    if(defend.technique)to.metrics.abilities++
    if(from.hp>0&&attack.heal>0){
      const healed=Math.min(from.maxHp-from.hp,attack.heal)
      from.hp+=healed
      from.metrics.healed+=healed
    }
  }
  for(let i=0;i<20&&a.hp>0&&b.hp>0;i++){
    hit(first,second)
    if(second.hp<=0)break
    hit(second,first)
  }
  const winner=a.hp===b.hp?(random()<.5?a:b):(a.hp>b.hp?a:b)
  return {winner:winner.id,a,b,rounds:Math.max(a.hits,b.hits)}
}
export function auditSeventeen({duelsPerOrder=50,gear=false,awakening=5,mastery=5}={}){
  const names=PVP_COMBATANTS,records=Object.fromEntries(names.map(id=>[id,{id,wins:0,fights:0,
    damage:0,blocked:0,healed:0,criticals:0,shield:0,dodges:0,abilities:0}]))
  const pairs=[]
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
    const a=names[i],b=names[j],count=Math.max(1,Math.floor(duelsPerOrder))*2
    let aWins=0
    for(let n=0;n<Math.floor(count/2);n++)for(const flip of [false,true]){
      // Swap attacker side, same deterministic seed for both orientations.
      const d=simulateFairDuel(flip?b:a,flip?a:b,{seed:20261101+i*10000+j*300+n,gear,awakening,mastery})
      if(d.winner===a)aWins++
      for(const fighter of [d.a,d.b]){
        const rec=records[fighter.id];rec.fights++
        if(d.winner===fighter.id)rec.wins++
        for(const field of ['blocked','healed','criticals','shield','dodges','abilities'])
          rec[field]+=fighter.metrics[field]
        rec.damage+=fighter.metrics.damage
      }
    }
    pairs.push({a,b,aWins,bWins:count-aWins,fights:count,winRateA:Math.round(1000*aWins/count)/10})
  }
  const ranking=Object.values(records).map(x=>({...x,
    winRate:Math.round(x.wins/x.fights*1000)/10,
    damagePerFight:Math.round(x.damage/x.fights),
    blockedPerFight:Math.round(x.blocked/x.fights),
    healedPerFight:Math.round(x.healed/x.fights),
    shieldPerFight:Math.round(x.shield/x.fights),
    criticalsPerFight:Math.round(x.criticals/x.fights*100)/100,
    abilitiesPerFight:Math.round(x.abilities/x.fights*100)/100
  })).sort((a,b)=>b.winRate-a.winRate||a.id.localeCompare(b.id))
  return {scenario:gear?'equal-generic-gear':'no-gear',duelsPerOrder,combatants:names.length,
    pairs:pairs.length,battles:pairs.reduce((s,x)=>s+x.fights,0),ranking,pairs}
}
