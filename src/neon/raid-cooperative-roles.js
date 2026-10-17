// Mecanicas cooperativas de Raid do Alpha Bot.
// Puras e deterministicas: sem leitura do banco e sem alteracao de economia/PvP.
export const RAID_ROLE_RULES=Object.freeze({
  paladinRedirectRate:.18,
  paladinRedirectBudget:.08,
  druidHealingEvery:8,
  druidHealIII:.025,
  druidHealV:.04,
  necromancerCurse:.03
})

export const isAwakened=(p,role,stage)=>Boolean(p&&p.alive&&p.classApplied&&p.classId===role&&Number(p.awakeningStage||0)>=stage&&Number(p.hp)>0)

export function raidDruidSupport(players,round){
  const members=(players||[]).filter(p=>p.alive&&Number(p.hp)>0)
  if(members.length<2||Number(round)%RAID_ROLE_RULES.druidHealingEvery!==0)return []
  const result=[]
  for(const druid of members.filter(p=>isAwakened(p,'druid',3))){
    const target=members.filter(p=>p.jid!==druid.jid&&Number(p.maxHp)>0&&Number(p.hp)/Number(p.maxHp)<.70)
      .sort((a,b)=>Number(a.hp)/Number(a.maxHp)-Number(b.hp)/Number(b.maxHp))[0]
    if(!target)continue
    const healingRate=Number(druid.awakeningStage)>=5?RAID_ROLE_RULES.druidHealV:RAID_ROLE_RULES.druidHealIII
    const healed=Math.min(Math.max(0,Number(target.maxHp)-Number(target.hp)),Math.max(1,Math.floor(Number(target.maxHp)*healingRate)))
    target.hp=Number(target.hp)+healed
    druid.alliedHealing=Number(druid.alliedHealing||0)+healed
    if(healed>0)result.push({source:druid.jid,target:target.jid,healed})
  }
  return result
}

export function raidPaladinProtection(players,target,incoming){
  const amount=Math.max(0,Math.floor(Number(incoming)||0))
  if(!target||amount<2||!target.alive)return {damage:amount,absorbed:0,source:null}
  const guardians=(players||[]).filter(p=>p.jid!==target.jid&&isAwakened(p,'paladin',4)&&Number(p.hp)>1)
    .sort((a,b)=>Number(b.hp)-Number(a.hp))
  const guardian=guardians[0]
  if(!guardian)return {damage:amount,absorbed:0,source:null}
  const cap=Math.max(0,Math.floor(Number(guardian.maxHp||0)*RAID_ROLE_RULES.paladinRedirectBudget)-Number(guardian.guardRedirectRound||0))
  const absorbed=Math.min(Math.floor(amount*RAID_ROLE_RULES.paladinRedirectRate),cap,Math.max(0,Number(guardian.hp)-1))
  if(absorbed<=0)return {damage:amount,absorbed:0,source:null}
  guardian.hp-=absorbed
  guardian.guardRedirectRound=Number(guardian.guardRedirectRound||0)+absorbed
  guardian.alliedProtection=Number(guardian.alliedProtection||0)+absorbed
  return {damage:amount-absorbed,absorbed,source:guardian.jid}
}

export function raidNecromancerCurse(players,attacker,damage){
  const amount=Math.max(0,Math.floor(Number(damage)||0))
  const source=(players||[]).find(p=>isAwakened(p,'necromancer',4))
  if(!source||!attacker||attacker.jid===source.jid)return {damage:amount,bonus:0,source:null}
  const bonus=Math.round(amount*RAID_ROLE_RULES.necromancerCurse)
  source.curseTeamDamage=Number(source.curseTeamDamage||0)+bonus
  return {damage:amount+bonus,bonus,source:source.jid}
}

export function raidRoleReport(p){
  return {
    alliedHealing:Math.max(0,Math.floor(Number(p?.alliedHealing)||0)),
    alliedProtection:Math.max(0,Math.floor(Number(p?.alliedProtection)||0)),
    curseTeamDamage:Math.max(0,Math.floor(Number(p?.curseTeamDamage)||0))
  }
}
