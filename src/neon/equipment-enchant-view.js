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
