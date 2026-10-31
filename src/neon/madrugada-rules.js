// Edição única — madrugada do dia 31/10/2026 (São Paulo).
export const MADRUGADA_EVENT_ID='madrugada_amaldicoada_20261031_0333'
export const MADRUGADA_GROUP='120363429534634131@g.us'
export const MADRUGADA_START=Date.parse('2026-10-31T03:33:00-03:00')
export const MADRUGADA_END=Date.parse('2026-10-31T05:48:00-03:00')
export const MADRUGADA_HP=3000000
export const MADRUGADA_BOSS='🔔 Vigia da Hora Morta'
export const MADRUGADA_PET_ID='cerbero_0333_20261031'
export const MADRUGADA_PET_NAME='🐺 Cérbero das 03:33'
export const MADRUGADA_INSIGNIA_ID='insignia_ultima_vigilia_20261031'
export const MADRUGADA_SEAL_INTERVAL_MS=10*60000
export const MADRUGADA_MAX_SEALS=14
export const MADRUGADA_MIN_DAMAGE=15000
export function madrugadaPhase(now=Date.now()){
 return now<MADRUGADA_START?'scheduled':now<MADRUGADA_END?'open':'closed'
}
export function madrugadaScore(row,maxDamage){
 const damage=Math.max(0,Number(row.damage)||0)
 const seals=Math.max(0,Math.min(MADRUGADA_MAX_SEALS,Number(row.seals)||0))
 return 70*(Math.min(damage,Math.max(1,maxDamage))/Math.max(1,maxDamage))+
  30*(seals/MADRUGADA_MAX_SEALS)
}
export function madrugadaRanking(rows=[]){
 const eligible=rows.filter(r=>Number(r.damage)>=MADRUGADA_MIN_DAMAGE)
 const maxDamage=Math.max(1,...eligible.map(r=>Number(r.damage)||0))
 return eligible.map(r=>({
  jid:String(r.jid),name:String(r.name||'Jogador'),
  damage:Number(r.damage)||0,seals:Number(r.seals)||0,
  score:madrugadaScore(r,maxDamage)
 })).sort((a,b)=>b.score-a.score||b.damage-a.damage||b.seals-a.seals||a.jid.localeCompare(b.jid))
}
export function madrugadaDamage(power,critical,roll=1){
 return Math.max(1,Math.round(Math.max(1,Number(power)||1)*(critical?1.5:1)*Math.max(.85,Math.min(1.15,Number(roll)||1))))
}