// Regras puras de patrocínio do GT Alpha, sem acesso ao banco.
export const GT_SPONSORS=Object.freeze([
 {id:'oficina',name:'🧰 AutoCenter Alpha',goal:3,measure:'etapas',reward:'1 reparo com até R$ 200.000 de desconto',kind:'repair',cap:200000},
 {id:'pitstop',name:'🔧 Pit Stop Oficial',goal:3,measure:'pódios em provas',reward:'30% de desconto na próxima melhoria, limitado a R$ 300.000',kind:'upgrade',cap:300000},
 {id:'turbo',name:'🏁 TurboMax',goal:2,measure:'vitórias em provas',reward:'R$ 500.000 uma única vez',kind:'cash',cap:500000}
])
export function gtSponsorIncrement(id,heats,jid){
 if(id==='oficina')return 1
 if(id==='pitstop')return heats.filter(h=>h.positions.some(p=>p.jid===jid&&p.place<=3)).length
 if(id==='turbo')return heats.filter(h=>h.positions[0]?.jid===jid).length
 return 0
}
export function gtSponsorDiscount(id,cost){
 const value=Math.max(0,Math.floor(Number(cost)||0))
 if(id==='oficina')return Math.min(200000,value)
 if(id==='pitstop')return Math.min(300000,Math.floor(value*.3))
 return 0
}
