import {classAttack,classDefense} from './game-catalog.js'
export function runPvpCombat(A,B,random=Math.random,maxRounds=20){
 const log=[]
 const [first,second]=A.spd>=B.spd?[A,B]:[B,A]
 const hit=(from,to)=>{
  from.attackIndex++
  const variance=.85+random()*.30
  const crit=random()<Math.min(.40,Number(from.crit||.10)+Number(from.petBonus?.crit||0))
  const dodgeChance=Math.min(.05,Math.max(0,Number(to.petBonus?.dodge||0)))
  const dodged=dodgeChance>0&&random()<dodgeChance
  const raw=Math.max(1,Math.round((from.atk-to.def*.45)*variance))
  const adjusted=Math.max(1,Math.round(raw*(1+Number(from.petBonus?.damage||0))))
  const attack=classAttack({classId:from.classId,applied:from.classApplied,damage:crit?Math.round(adjusted*1.6):adjusted,critical:crit,hp:from.hp,maxHp:from.maxHp,attackIndex:from.attackIndex,lastProcAttack:from.lastProcAttack})
  from.lastProcAttack=attack.lastProcAttack
  const dealt=classDefense({classId:to.classId,applied:to.classApplied,damage:attack.damage}).damage
  const dmg=dodged?0:Math.max(1,Math.round(dealt*(1-Math.min(.045,Math.max(0,Number(to.petBonus?.defense||0))))))
  to.hp=Math.max(0,to.hp-dmg)
  if(from.hp>0&&attack.heal>0)from.hp=Math.min(from.maxHp,from.hp+attack.heal)
  log.push({from:from.name,to:to.name,dmg,crit:!dodged&&crit,dodged,hp:to.hp})
  const cooldown=Number(from.petBonus?.healCooldown||0)
  if(from.hp>0&&cooldown>0&&from.petHealUses<3&&Number(from.petBonus?.healPct||0)>0&&from.attackIndex%cooldown===0&&from.hp/from.maxHp<.70){
   const before=from.hp
   from.hp=Math.min(from.maxHp,from.hp+Math.max(1,Math.round(from.maxHp*Number(from.petBonus.healPct))))
   if(from.hp>before){
    from.petHealUses++
    log.push({petHeal:true,from:from.name,to:from.name,petSpecies:from.petSpecies,heal:from.hp-before,hp:from.hp})
   }
  }
 }
 for(let round=1;round<=maxRounds&&A.hp>0&&B.hp>0;round++){
  hit(first,second)
  if(second.hp<=0)break
  hit(second,first)
 }
 return log
}
