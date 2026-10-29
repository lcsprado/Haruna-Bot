// Apresentação: os encantamentos pertencem ao modelo e continuam após forjar.
// Nunca altera atributos persistidos, pedras ou o estado de jogo.
const displayFields=new Set(['atk','def','spd','crit'])
export function gearStatsWithEnchants(base={},rows=[],stones={}){
  const out={...base}
  for(const row of rows||[]){
    const stone=stones[row?.stone_id]
    if(!stone||!displayFields.has(stone.stat))continue
    const qty=Math.max(0,Math.min(3,Math.trunc(Number(row.quantity)||0)))
    out[stone.stat]=Number(out[stone.stat]||0)+Number(stone.value||0)*qty
  }
  return out
}

/**
 * Uma consulta para todos os modelos apresentados no menu.
 * Encantamentos pertencem ao (jogador, modelo), nao a cada nivel/copia.
 */
export async function equipmentEnchantmentsByItem(queryable,jid,itemIds=[]){
  const ids=[...new Set((itemIds||[]).filter(Boolean))]
  const byItem=new Map()
  if(!ids.length)return byItem
  const {rows}=await queryable.query(
    'SELECT item_id,stone_id,quantity FROM equipment_enchantments WHERE jid=$1 AND item_id=ANY($2::text[])',
    [jid,ids]
  )
  for(const row of rows){
    if(!ids.includes(row.item_id))continue
    if(!byItem.has(row.item_id))byItem.set(row.item_id,[])
    byItem.get(row.item_id).push(row)
  }
  return byItem
}
