// Pure planning for loot sale. No database writes, no player-state mutation.
const positiveInteger=x=>Number.isInteger(Number(x))&&Number(x)>0&&Number(x)<=9999
export function planLootBatch(items=[],inventory=[],predicate=()=>true){
  const ownedItems=new Map((inventory||[]).map(i=>[String(i.item_id||''),i]))
  const requested=new Map()
  const failures=[]
  for(const item of items||[]){
    if(String(item?.rarity||'common')==='legendary'||!predicate(item))continue
    const id=String(item?.itemId||'')
    const quantity=Number(item?.qty||0)
    if(!id||!positiveInteger(quantity)){failures.push(String(item?.name||id||'Item')+' (quantidade inválida)');continue}
    const current=requested.get(id)
    if(current){current.qty+=quantity;continue}
    requested.set(id,{itemId:id,name:String(item?.name||id),qty:quantity})
  }
  const selections=[]
  for(const item of requested.values()){
    const actual=ownedItems.get(item.itemId)
    if(!actual){failures.push(item.name+' (já processado ou não encontrado)');continue}
    if(actual.sellable===false){failures.push(item.name+' (item protegido)');continue}
    const upgraded=(Array.isArray(actual.upgraded_copies)?actual.upgraded_copies:[])
      .reduce((total,copy)=>total+Math.max(0,Number(copy?.quantity||0)),0)
    const forged=Number(actual.forged_level||0)>0?1:0
    const held=upgraded+forged
    const available=Math.max(0,Math.min(
      Math.max(0,Number(actual.sellable_quantity||0)),
      Number(actual.quantity||0)-held
    ))
    if(item.qty>available){
      failures.push(item.name+(available<1?' (sem cópia livre; já processado ou protegido)':' (quantidade reservada ou já processada)'))
      continue
    }
    if(!positiveInteger(item.qty)){failures.push(item.name+' (quantidade inválida)');continue}
    selections.push({itemId:item.itemId,qty:item.qty})
  }
  return {selections,failures}
}
