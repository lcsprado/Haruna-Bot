// Regras puras da Guerra das Almas: independentes de banco, sorte, nível e equipamentos.
export const GUERRA_TEAMS=Object.freeze({sombras:'💜 Legião das Sombras',infernal:'🔥 Ordem Infernal'})
export const GUERRA_ACTIONS=Object.freeze({atacar:'⚔️ Atacar',defender:'🛡️ Defender',saquear:'💰 Saquear'})
export const GUERRA_ROUND_MS=5*60*1000
export const GUERRA_SECRET_ROUND_MS=2*60*1000
export const GUERRA_ROUNDS=8
export const GUERRA_JOIN_MS=5*60*1000
export const GUERRA_TOTAL_MS=GUERRA_JOIN_MS+GUERRA_ROUNDS*GUERRA_ROUND_MS
export const GUERRA_TEAM_CAP=2
export function guerraCanJoin(players,team){
 if(!Object.hasOwn(GUERRA_TEAMS,team))return false
 const counts=Object.fromEntries(Object.keys(GUERRA_TEAMS).map(t=>[t,Object.values(players||{}).filter(p=>p.team===t).length]))
 return counts[team]<GUERRA_TEAM_CAP&&counts[team]<=counts[team==='sombras'?'infernal':'sombras']
}
// Inscrição segue aberta durante as duas primeiras rodadas,
// sem estender a duração das partidas nem recuperar ações perdidas.
export const GUERRA_LATE_JOIN_ROUNDS=2
export function guerraSignupDeadline(start,{joinMs=GUERRA_JOIN_MS,roundMs=GUERRA_ROUND_MS}={}){
 return Number(start)+joinMs+GUERRA_LATE_JOIN_ROUNDS*roundMs
}
export function guerraSignupOpen({start,now,final=false,joinMs=GUERRA_JOIN_MS,roundMs=GUERRA_ROUND_MS}={}){
 return !final&&Number.isFinite(Number(start))&&Number.isFinite(Number(now))&&
  Number(now)>=Number(start)&&Number(now)<guerraSignupDeadline(start,{joinMs,roundMs})
}
export const GUERRA_SOULS=Object.freeze({winner:15,loser:8})
export const GUERRA_XP_PER_ACTION=80
const COUNTERS=Object.freeze({atacar:'saquear',defender:'atacar',saquear:'defender'})
// A missão do turno é pública. Jogadas são privadas; bônus de objetivo é menor que um contra-ataque.
export const GUERRA_OBJECTIVES=Object.freeze([
 {action:'saquear',name:'💰 Cofre Amaldiçoado'},
 {action:'defender',name:'🛡️ Fortaleza das Sombras'},
 {action:'atacar',name:'⚔️ Invasão do Altar'}
])
export function guerraObjective(round){return GUERRA_OBJECTIVES[(Math.max(1,Number(round)||1)-1)%GUERRA_OBJECTIVES.length]}
export const GUERRA_OBJECTIVE_POINTS=4
export function guerraRoundAt(start,now,{joinMs=GUERRA_JOIN_MS,roundMs=GUERRA_ROUND_MS}={}){
 const elapsed=Number(now)-Number(start)
 return elapsed<joinMs?0:Math.min(GUERRA_ROUNDS,Math.floor((elapsed-joinMs)/roundMs)+1)
}
export function guerraRoundEnd(start,round,{joinMs=GUERRA_JOIN_MS,roundMs=GUERRA_ROUND_MS}={}){
 return Number(start)+joinMs+Number(round)*roundMs
}
const other=team=>team==='sombras'?'infernal':'sombras'
export function guerraScoreRound(players,round,{objectiveBonus=false}={}){
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
  const objective=Boolean(objectiveBonus)&&action===guerraObjective(round).action
  const points=10+(countered?8:0)+(objective?GUERRA_OBJECTIVE_POINTS:0)
  scores[p.team]+=points
  awards[jid]={team:p.team,action,points,countered,objective}
 }
 return {round,scores,awards,majority,totalActions:participants.length,objective:objectiveBonus?guerraObjective(round):null}
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
