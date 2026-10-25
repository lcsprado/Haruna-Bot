// Material compartilhado entre a Raid dos Sete Pecados, WhatsApp e Web.
export const COLLAB_FRAGMENT_ITEM='fragmento_ascensao_pecados_20261024'
export const COLLAB_PET_UPGRADE_FRAGMENTS=12
export const COLLAB_PET_UPGRADE_XP=500
export const COLLAB_GEAR_UPGRADE_FRAGMENTS=12

export const COLLAB_RAID_FRAGMENTS_PER_WIN=10
export const COLLAB_RAID_DAILY_CAP=30
export const COLLAB_RAID_MIN_DAMAGE=25000
export const COLLAB_RAID_MIN_SHARE=0.025
export function collabRaidBrazilDay(now=Date.now()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
  return parts.year+'-'+parts.month+'-'+parts.day
}
export function collabRaidEligible(damage,share){
  return Math.max(0,Number(damage)||0)>=COLLAB_RAID_MIN_DAMAGE &&
    Math.max(0,Number(share)||0)>=COLLAB_RAID_MIN_SHARE
}
export function collabRaidPayout(earnedToday,damage,share){
  if(!collabRaidEligible(damage,share))return 0
  return Math.min(COLLAB_RAID_FRAGMENTS_PER_WIN,
    Math.max(0,COLLAB_RAID_DAILY_CAP-Math.max(0,Number(earnedToday)||0)))
}
