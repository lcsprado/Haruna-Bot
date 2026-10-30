// Regras puras da Guerra das Almas: independentes de banco, sorte, nível e equipamentos.
export const GUERRA_TEAMS=Object.freeze({sombras:'💜 Legião das Sombras',infernal:'🔥 Ordem Infernal'})
export const GUERRA_ACTIONS=Object.freeze({atacar:'⚔️ Atacar',defender:'🛡️ Defender',saquear:'💰 Saquear'})
export const GUERRA_ROUND_MS=5*60*1000
export const GUERRA_ROUNDS=8
export const GUERRA_JOIN_MS=5*60*1000
export const GUERRA_TOTAL_MS=GUERRA_JOIN_MS+GUERRA_ROUNDS*GUERRA_ROUND_MS
export const GUERRA_SOULS=Object.freeze({winner:15,loser:8})
export const GUERRA_XP_PER_ACTION=80
const COUNTERS=Object.freeze({atacar:'saquear',defender:'atacar',saquear:'defender'})
export function guerraRoundAt(start,now){
 const elapsed=Number(now)-Number(start)
 return elapsed<GUERRA_JOIN_MS?0:Math.min(GUERRA_ROUNDS,Math.floor((elapsed-GUERRA_JOIN_MS)/GUERRA_ROUND_MS)+1)
}
export function guerraRoundEnd(start,round){
 return Number(start)+GUERRA_JOIN_MS+Number(round)*GUERRA_ROUND_MS
}
const other=team=>team==='sombras'?'infernal':'sombras'
export function guerraScoreRound(players,round){
 const participants=Object.entries(players||{}).filter(([,p])=>GUERRA_TEAMS[p.team]&&GUERRA_ACTIONS[p.plays?.[String(round)]])
 const majority={}
 for(const team of Object.keys(GUERRA_TEAMS)){
  const chosen=participants.filter(([,p])=>p.team===team)
  const counts=Object.fromEntries(Object.keys(GUERRA_ACTIONS).map(action=>[action,chosen.filter(([,p])=>p.plays[String(round)]===action).length]))
  const ordered=Object.entries(counts).sort((a,b)=>b[1]-a[1])
  majority[team]=ordered[0][1]>0&&ordered[0][1]>ordered[1][1]?ordered[0][0]:null
 }
 const scores={sombras:0,infernal:0},awards={}
 for(const [jid,p] of participants){
  const action=p.plays[String(round)]
  const countered=majority[other(p.team)]===COUNTERS[action]
  const points=10+(countered?8:0)
  scores[p.team]+=points
  awards[jid]={team:p.team,action,points,countered}
 }
 return {round,scores,awards,majority,totalActions:participants.length}
}
export function guerraBuildAwards(players,results){
 const stats=Object.fromEntries(Object.entries(players||{}).map(([jid,p])=>[jid,{jid,name:p.name,team:p.team,actions:0,points:0}]))
 const totals={sombras:0,infernal:0}
 for(const result of results||[]){
  for(const team of Object.keys(totals))totals[team]+=Number(result.scores?.[team]||0)
  for(const [jid,x] of Object.entries(result.awards||{})){
   if(!stats[jid])continue
   stats[jid].actions++
   stats[jid].points+=x.points
  }
 }
 const active=Object.values(stats).filter(x=>x.actions>=2)
 const viable=Object.keys(GUERRA_TEAMS).every(team=>active.some(p=>p.team===team))
 const winner=viable?(totals.sombras===totals.infernal?'empate':totals.sombras>totals.infernal?'sombras':'infernal'):null
 const rewards=active.map(p=>({...p,souls:!viable?8:winner==='empate'||winner===p.team?15:8,xp:p.actions*GUERRA_XP_PER_ACTION,legendary:false}))
 if(viable)for(const team of Object.keys(GUERRA_TEAMS)){
  const ranked=rewards.filter(p=>p.team===team).sort((a,b)=>b.points-a.points||b.actions-a.actions||a.jid.localeCompare(b.jid))
  if(ranked.length)ranked[0].legendary=true
 }
 return {winner,viable,totals,rewards}
}
