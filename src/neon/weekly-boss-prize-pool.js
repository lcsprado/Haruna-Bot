// O premio em dinheiro do Superboss a partir de 20/11/2026 e um unico bolo.
// Nao acumula bonus fixos por colocacao, premio extra de Golem ou multiplicador de dinheiro.
export const WEEKLY_BOSS_POOL_START='2026-11-20'
export const WEEKLY_BOSS_POOL_CASH=50_000_000

export function isWeeklyBossPoolEdition(weekendKey){
 const key=String(weekendKey||'')
 return /^\d{4}-\d{2}-\d{2}$/.test(key)&&key>=WEEKLY_BOSS_POOL_START
}

// Reparte todos os R$ 50 milhoes pelo dano registrado, somando exatamente ao bolo.
// O arredondamento usa maiores restos e desempate pela ordem do ranking.
export function weeklyBossCashPoolShares(weekendKey,participants=[]){
 if(!isWeeklyBossPoolEdition(weekendKey))return null
 const rows=(Array.isArray(participants)?participants:[]).map((p,i)=>({
   jid:String(p?.jid||''),i,
   damage:Number.isSafeInteger(Number(p?.damage))&&Number(p.damage)>0
     ?BigInt(Number(p.damage)):0n
 })).filter(p=>p.jid&&p.damage>0n)
 const total=rows.reduce((sum,p)=>sum+p.damage,0n)
 const shares=new Map()
 if(total===0n)return shares
 const pool=BigInt(WEEKLY_BOSS_POOL_CASH)
 let distributed=0n
 for(const row of rows){
   const weighted=pool*row.damage
   row.cash=weighted/total
   row.remainder=weighted%total
   distributed+=row.cash
 }
 let centsToAssign=Number(pool-distributed)
 const order=[...rows].sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1)
 for(let i=0;i<centsToAssign;i++)order[i].cash+=1n
 for(const row of rows)shares.set(row.jid,Number(row.cash))
 return shares
}
