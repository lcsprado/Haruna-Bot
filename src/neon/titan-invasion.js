export const TITAN_EVENT_ID='invasao_titas_20261017'
export const TITAN_EVENT_KEY='invasao-titas-20261017-2130-v1'
export const TITAN_START=Date.parse('2026-10-17T21:30:00-03:00')
export const TITAN_END=Date.parse('2026-10-17T22:10:00-03:00')
export const TITAN_PHASES=Object.freeze([
  {name:'🔥 Titã Vulcânico',hp:450000,atk:120},
  {name:'🗿 Colosso Ancestral',hp:650000,atk:150},
  {name:'⚡ Imperador dos Titãs',hp:900000,atk:180}
])
export function createTitanState(index,ledger={},startedAt=Date.now()){
 const phase=TITAN_PHASES[index]
 return {mode:'event',eventId:TITAN_EVENT_ID,scheduleKey:TITAN_EVENT_KEY,
   active:true,origin:'scheduled',phaseIndex:index,phaseCount:3,
   name:phase.name,hp:phase.hp,maxHp:phase.hp,atk:phase.atk,
   participants:{},ledger,startedAt,endsAt:TITAN_END}
}
export function rollupTitanDamage(state){
 const ledger={...(state.ledger||{})},phase=Number(state.phaseIndex||0)
 for(const [jid,player] of Object.entries(state.participants||{})){
   const old=ledger[jid]||{name:player.name||'Jogador',damage:0,phases:[]}
   old.name=player.name||old.name
   old.damage+=Math.max(0,Number(player.damage||0))
   if(Number(player.damage||0)>0&&!old.phases.includes(phase)) old.phases.push(phase)
   ledger[jid]=old
 }
 return ledger
}
export function rankTitanPlayers(ledger){
 const ranked=Object.entries(ledger).map(([jid,p])=>({jid,name:p.name,
  damage:Number(p.damage||0),phases:p.phases||[]}))
  .filter(p=>p.damage>0).sort((a,b)=>b.damage-a.damage)
 const total=ranked.reduce((a,p)=>a+p.damage,0)||1
 const eligible=ranked.filter(p=>p.damage/total>=.01||p.phases.length>=2)
 return ranked.map(p=>({...p,share:p.damage/total,
  rank:eligible.findIndex(x=>x.jid===p.jid)+1}))
}
export function titanRewards(rank){
 return rank===1?{cash:750000,exp:18000}
  :rank===2?{cash:500000,exp:14000}
  :rank===3?{cash:350000,exp:10000}
  :rank>3?{cash:150000,exp:5000}:{cash:0,exp:0}
}
