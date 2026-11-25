// Shared, dependency-free stone catalog for mining, enchantment, profile and combat.
export const STONE_RARITIES=Object.freeze(['common','rare','epic','legendary'])
const rarities=['Comum','Rara','Épica','Lendária']
const suffix=['','_rara','_epica','_lendaria']
const families=[
 ['forca','Força','atk',[5,10,20,35],['weapon'],'ATK'],
 ['fortaleza','Fortaleza','def',[5,10,20,35],['armor','helmet'],'DEF'],
 ['agilidade','Agilidade','spd',[2,4,8,15],['boots'],'VEL'],
 ['precisao','Precisão','crit',[.01,.02,.03,.05],['weapon','helmet'],'p.p. CRIT'],
 ['furia','Fúria','damage',[.02,.04,.06,.10],['weapon'],'p.p. dano']
]
export const STONES=Object.freeze(Object.fromEntries(families.flatMap(([family,name,stat,values,categories,unit])=>values.map((value,rank)=>{
 const id='pedra_'+family+suffix[rank]+'_alpha'
 const amount=['crit','damage'].includes(stat)?Math.round(value*100):value
 return [id,Object.freeze({name:'Pedra da '+name+(rank?' '+rarities[rank]:''),stat,value,categories,label:'+'+amount+' '+unit,rarity:STONE_RARITIES[rank],rank,family})]
}))))
export const STONE_EFFECTS=Object.freeze(Object.fromEntries(Object.entries(STONES).map(([id,s])=>[id,[s.stat,s.value]])))
export const MINING_RARITY_WEIGHTS=Object.freeze({
 madeira:[90,10,0,0],ferro:[75,22,3,0],aco:[60,30,9,1],ouro:[45,35,17,3],diamante:[30,40,23,7]
})
export function miningStoneVariant(baseId,pickaxeId,roll){
 const base=STONES[baseId],weights=MINING_RARITY_WEIGHTS[pickaxeId]
 if(!base||!weights||!Number.isFinite(roll)||roll<0||roll>=1)throw Error('Sorteio de raridade inválido.')
 let sum=0
 for(let rank=0;rank<weights.length;rank++){
  sum+=weights[rank]
  if(roll*100<sum)return 'pedra_'+base.family+suffix[rank]+'_alpha'
 }
 throw Error('Tabela de raridades inválida.')
}
// Keep the existing three-slot and two-percentage-slot limits. A superior
// stone may replace one weaker stone of the same family when a limit is reached.
export function planStoneApplication(rows,stoneId){
 const stone=STONES[stoneId]
 if(!stone)return null
 const total=rows.reduce((n,r)=>n+Number(r.quantity||0),0)
 const isPercent=s=>s&&['crit','damage'].includes(s.stat)
 const percent=rows.filter(r=>isPercent(STONES[r.stone_id])).reduce((n,r)=>n+Number(r.quantity||0),0)
 if(total<3&&(!isPercent(stone)||percent<2))return {replaceId:null,totalAfter:total+1}
 const weaker=rows.filter(r=>Number(r.quantity)>0&&STONES[r.stone_id]?.family===stone.family&&STONES[r.stone_id].rank<stone.rank).sort((a,b)=>STONES[a.stone_id].rank-STONES[b.stone_id].rank)[0]
 return weaker?{replaceId:weaker.stone_id,totalAfter:total}:null
}
