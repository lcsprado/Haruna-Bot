// Evento exclusivo de 11/11/2026: 5 salas, 3 portas e risco de dinheiro virtual.
// Todas as chances e penalidades sao exibidas ANTES do jogador escolher.
export const COFRE_DESTINO_KEY='cofre_destino_20261111_2000_v1'
export const COFRE_DESTINO_START=Date.parse('2026-11-11T20:00:00-03:00')
export const COFRE_DESTINO_END=Date.parse('2026-11-11T22:00:00-03:00')
export const COFRE_DESTINO_ROOMS=5
export const COFRE_DESTINO_WAIT_MS=5*60*1000
export const COFRE_DESTINO_CASH_CAP=4_000_000
export const COFRE_DESTINO_XP_CAP=12_000
export const COFRE_DESTINO_FRAG_ID='fragmento_ascensao_pecados_20261024'
export const COFRE_DESTINO_PRIZES=Object.freeze([
 Object.freeze({cash:2_000_000,fragments:15}),
 Object.freeze({cash:1_000_000,fragments:10}),
 Object.freeze({cash:500_000,fragments:5})
])
export const COFRE_DESTINO_DOORS=Object.freeze([
 Object.freeze({number:1,name:'🛡️ Segurança',chance:100,winCash:30_000,winXp:500,loseCash:0}),
 Object.freeze({number:2,name:'💎 Tesouro Instável',chance:40,winCash:350_000,winXp:1500,loseCash:100_000}),
 Object.freeze({number:3,name:'☠️ Abismo Proibido',chance:10,winCash:2_000_000,winXp:3500,loseCash:250_000})
])
export const isCofreDestinoCheckpoint=round=>round===2||round===4||round===5
export function cofreDestinoResolveChoice({door,roll,availableBalance,earnedCash=0,earnedXp=0,maxHp=100,hp=100}){
 const rule=COFRE_DESTINO_DOORS.find(x=>x.number===Number(door))
 if(!rule)throw new Error('Porta inválida.')
 if(!Number.isInteger(roll)||roll<0||roll>=100)throw new Error('Sorteio inválido.')
 if(!Number.isSafeInteger(availableBalance)||availableBalance<0)throw new Error('Saldo inválido.')
 if(availableBalance<rule.loseCash)throw new Error('Saldo insuficiente para assumir a perda máxima desta porta.')
 if(!Number.isSafeInteger(earnedCash)||earnedCash<0)throw new Error('Tesouro acumulado inválido.')
 if(!Number.isSafeInteger(earnedXp)||earnedXp<0)throw new Error('XP acumulado inválido.')
 if(!Number.isSafeInteger(maxHp)||maxHp<1||!Number.isSafeInteger(hp)||hp<1||hp>maxHp)throw new Error('HP inválido.')
 const success=roll<rule.chance
 const cash=success?Math.max(0,Math.min(rule.winCash,COFRE_DESTINO_CASH_CAP-earnedCash)):0
 const xp=success?Math.max(0,Math.min(rule.winXp,COFRE_DESTINO_XP_CAP-earnedXp)):0
 const loss=success?0:rule.loseCash
 const hpNext=success
  ?Math.min(maxHp,hp+(rule.number===1?Math.max(1,Math.ceil(maxHp*.20)):0))
  :Math.max(0,hp-Math.max(1,Math.ceil(maxHp*(rule.number===2?.23:.47))))
 return {door:rule.number,roll,success,cash,xp,loss,hpNext,risk:rule.loseCash,chance:rule.chance}
}
export function cofreDestinoDebit(cash,bank,loss){
 if(![cash,bank,loss].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('Saldo inválido.')
 if(cash+bank<loss)throw new Error('Saldo insuficiente.')
 const takeCash=Math.min(cash,loss)
 return {cash:cash-takeCash,bank:bank-(loss-takeCash)}
}
export function rankCofreDestino(rows=[]){
 return rows.filter(r=>r?.state?.phase==='finished'&&Number(r.state.round)===COFRE_DESTINO_ROOMS&&Number(r.state.hp)>0)
  .map(r=>({
   jid:r.jid,name:String(r.name||'Jogador').slice(0,80),
   round:Number(r.state.round),hp:Number(r.state.hp),
   earned:Number(r.state.earnedCash||0),lost:Number(r.state.lostCash||0),
   net:Number(r.state.earnedCash||0)-Number(r.state.lostCash||0),
   finishedAt:Number(r.state.finishedAt||0)
  }))
  .sort((a,b)=>b.round-a.round||b.net-a.net||b.hp-a.hp||a.finishedAt-b.finishedAt||a.jid.localeCompare(b.jid))
}
