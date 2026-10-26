// Regras puras do turno global de Halloween.
// Cada jogador conserva seu próprio relógio de ataque; não há bônus por JID ou grupo.
export const HALLOWEEN_TICK_MS=10_000
const MAX_CATCH_UP_MS=HALLOWEEN_TICK_MS*3
const MAX_ATTACKS_PER_TICK=2
const num=(n,backup=0)=>Number.isFinite(Number(n))?Number(n):backup

// VEL 100 = 1 ataque/10s; a cada 12 VEL acima de 100, +1% de frequência.
// Teto de +25% para que um equipamento não destrua o equilíbrio e o custo do bot.
export function halloweenAttackInterval(spd=100){
 const speed=Math.max(0,num(spd,100))
 const frequency=1+Math.min(.25,Math.max(0,speed-100)/1200)
 return Math.round(HALLOWEEN_TICK_MS/frequency)
}

// A falta de um tick ou reconexão não cria ataques retroativos ilimitados.
// last_attack é atualizado tanto em acertos quanto em esquivas do Boss.
export function halloweenAttackDue(now,lastAttack,spd){
 const time=num(now,0),previous=num(lastAttack,0)
 const interval=halloweenAttackInterval(spd)
 if(time<=0)return {slots:0,interval,lastAttack:previous}
 if(previous<=0||time-previous>MAX_CATCH_UP_MS)return {slots:1,interval,lastAttack:time}
 const elapsed=Math.max(0,time-previous)
 const slots=Math.min(MAX_ATTACKS_PER_TICK,Math.floor((elapsed+200)/interval))
 return {slots,interval,lastAttack:previous}
}
export function halloweenNextAttackAt(now,previous,interval){
 if(previous<=0||now-previous>MAX_CATCH_UP_MS)return now
 return Math.min(now,previous+interval)
}

// Ordena pela oportunidade mais antiga; quando iguais, maior VEL age primeiro.
// Empates completos fazem rodízio entre rodadas para evitar privilégio de JID.
export function halloweenOrderedAttackers(players,now,cycle=1){
 const list=[...(players||[])]
 const alphabetical=[...list].sort((a,b)=>String(a.jid).localeCompare(String(b.jid)))
 const ranks=new Map(alphabetical.map((row,i)=>[row.jid,i]))
 const shift=list.length?(Math.floor(num(now,0)/HALLOWEEN_TICK_MS)+Math.max(0,num(cycle,1)))%list.length:0
 const rank=row=>(ranks.get(row.jid)-shift+list.length)%Math.max(1,list.length)
 const next=row=>{
  const last=num(row.last_attack,0)
  if(last<=0||now-last>MAX_CATCH_UP_MS)return now
  return last+halloweenAttackInterval(row.speed)
 }
 return list.sort((a,b)=>next(a)-next(b)||num(b.speed)-num(a.speed)||rank(a)-rank(b))
}
