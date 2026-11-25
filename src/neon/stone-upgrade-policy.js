// Applied stones have independent levels. Legacy rows contain quantity only (Lv.1).
export const STONE_UPGRADE_RATES=Object.freeze([[100,0,0],[95,5,0],[90,10,0],[80,17,3],[70,25,5],[60,32,8],[50,38,12],[40,42,18],[30,45,25]].map(Object.freeze))
const PRICE=Object.freeze({common:300,rare:600,epic:1000,legendary:1800})
export function stoneLevels(row){
 const n=Math.max(0,Math.min(3,Math.trunc(Number(row?.quantity)||0)))
 const ls=Array.isArray(row?.upgrade_levels)?row.upgrade_levels:[]
 return Array.from({length:n},(_,i)=>Math.max(1,Math.min(10,Math.trunc(Number(ls[i])||1))))
}
export function stoneLevelValue(base,level=1){return Number(base)*(1+(Math.max(1,Math.min(10,Number(level)||1))-1)*.4/9)}
export function stoneRowValue(base,row){return stoneLevels(row).reduce((n,lv)=>n+stoneLevelValue(base,lv),0)}
export function stoneUpgradeQuote(stone,level){
 if(!Number.isInteger(level)||level<1||level>9||!PRICE[stone?.rarity])throw Error('Encantamento inválido ou já no Lv.10.')
 const [success,failure,breakage]=STONE_UPGRADE_RATES[level-1]
 return {level,next:level+1,cost:PRICE[stone.rarity]*level,success,failure,breakage,before:stoneLevelValue(stone.value,level),after:stoneLevelValue(stone.value,level+1)}
}
export function stoneUpgradeOutcome(quote,roll){
 if(!Number.isInteger(roll)||roll<0||roll>=100)throw Error('Sorteio inválido.')
 return roll<quote.success?'success':roll<quote.success+quote.failure?'failure':'breakage'
}
export function stoneLevelLabel(stone,level){
 const pct=['crit','damage'].includes(stone.stat),unit=({atk:'ATK',def:'DEF',spd:'VEL',crit:'p.p. CRIT',damage:'p.p. dano'})[stone.stat]
 return '+'+Number((stoneLevelValue(stone.value,level)*(pct?100:1)).toFixed(2)).toLocaleString('pt-BR')+' '+unit
}
