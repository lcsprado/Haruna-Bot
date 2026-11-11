// Lote de Raids V1: compra conveniência, não melhor farm.
// Feature flag ALPHA_RAID_BATCH_ENABLED=1 necessária para executar comandos/runner.
export const RAID_BATCH_POLICY=Object.freeze({
 maxPer24h:10,maxPerOrder:10,minimumManualWins:3,
 feeRate:.10,moneyRate:.80,playerXpRate:.60,heroXpRate:.60,petXpRate:.60,
 masteryXpRate:.50,fragmentsRate:.40,boxChanceRate:.25,gearChanceRate:.25,
 cadenceMs:8000,rollingWindowMs:24*60*60*1000
})
export const raidBatchEnabled=()=>process.env.ALPHA_RAID_BATCH_ENABLED==='1'
export function validateRaidBatchCount(count){
 const n=Number(count)
 if(!Number.isSafeInteger(n)||n<1||n>RAID_BATCH_POLICY.maxPerOrder)
  throw new Error('Informe de 1 a 10 Raids. Ex.: !raidlote 75 10.')
 return n
}
export function batchFee(keyPrice){
 const n=Number(keyPrice)
 if(!Number.isSafeInteger(n)||n<1)throw new Error('Preço de chave inválido.')
 return Math.ceil(n*RAID_BATCH_POLICY.feeRate)
}
export function batchReducedAmount(amount,type){
 const rates={money:'moneyRate',playerXp:'playerXpRate',heroXp:'heroXpRate',
  petXp:'petXpRate',masteryXp:'masteryXpRate',fragments:'fragmentsRate'}
 if(!Object.hasOwn(rates,type))throw new Error('Recompensa de Raid inválida.')
 return Math.max(0,Math.floor(Math.max(0,Number(amount)||0)*RAID_BATCH_POLICY[rates[type]]))
}
export function batchDropChance(normalChance,type){
 const rate=type==='box'?RAID_BATCH_POLICY.boxChanceRate:
  type==='gear'?RAID_BATCH_POLICY.gearChanceRate:null
 if(rate===null)throw new Error('Tipo de drop inválido.')
 return Math.max(0,Math.min(1,Number(normalChance)||0))*rate
}
export function batchChatJid(jid){
 if(typeof jid!=='string'||!jid.includes('@')||jid.length>180)
  throw new Error('Jogador inválido para lote.')
 return '__alpha_raid_batch__:'+jid
}
export function batchPlan(keyPrice,count,existingKeys=0){
 const n=validateRaidBatchCount(count),keys=Math.max(0,Math.min(n,Math.floor(Number(existingKeys)||0)))
 return {count:n,keyPrice,feeEach:batchFee(keyPrice),usedExistingKeys:keys,
  buyKeys:n-keys,keySpend:(n-keys)*keyPrice,automationSpend:n*batchFee(keyPrice),
  maximumSpend:(n-keys)*keyPrice+n*batchFee(keyPrice)}
}
