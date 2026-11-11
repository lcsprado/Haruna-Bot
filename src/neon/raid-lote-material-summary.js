// Resumo dos materiais efetivamente creditados em cada vitoria do Raid Lote.
// Os recibos de recompensa ja sao persistidos atomicamente com a Raid.
export function summarizeRaidLoteMaterials(reports=[]){
 const items=new Map()
 for(const attempt of Array.isArray(reports)?reports:[]){
  if(attempt?.status!=='won')continue
  const rewards=Array.isArray(attempt.reward_summary?.rewards)?attempt.reward_summary.rewards:[]
  for(const reward of rewards){
   const material=reward?.material
   const qty=Number(material?.qty||0)
   if(!material||!Number.isSafeInteger(qty)||qty<=0)continue
   const id=String(material.id||material.name||'material')
   const name=String(material.name||material.id||'Material').replace(/[\r\n*]/g,' ').slice(0,80)
   const previous=items.get(id)
   items.set(id,{id,name,qty:qty+(previous?.qty||0)})
  }
 }
 const ordered=[...items.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
 return {total:ordered.reduce((sum,item)=>sum+item.qty,0),items:ordered}
}
export function formatRaidLoteMaterials(reports=[]){
 const summary=summarizeRaidLoteMaterials(reports)
 if(!summary.items.length)return '\n🧩 Fragmentos/materiais ganhos: 0'
 return '\n🧩 Fragmentos/materiais ganhos: +'+summary.total.toLocaleString('pt-BR')
  +summary.items.map(item=>'\n   • '+item.name+' ×'+item.qty.toLocaleString('pt-BR')).join('')
}
