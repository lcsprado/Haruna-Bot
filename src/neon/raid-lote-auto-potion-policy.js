// Cura preventiva exclusiva do Raidlote. Nao compra consumiveis e nao
// altera o fluxo da Raid manual. O motor gasta no maximo 1 pocao por rodada.
export const RAID_LOTE_AUTO_POTION_TRIGGER_PCT=40
export const RAID_LOTE_AUTO_POTION_TARGET_PCT=55

export function raidLoteAutoPotionNeeded({mode,hp,maxHp}={}){
  const current=Number(hp),maximum=Number(maxHp)
  return mode==='lote'&&Number.isFinite(current)&&Number.isFinite(maximum)&&
    maximum>0&&current>0&&current*100<=maximum*RAID_LOTE_AUTO_POTION_TRIGGER_PCT
}

export function raidLoteAutoPotionTargetHeal({hp,maxHp}={}){
  const current=Math.max(0,Number(hp)||0),maximum=Number(maxHp)
  if(!Number.isFinite(maximum)||maximum<=0)return 0
  return Math.max(1,Math.ceil(maximum*RAID_LOTE_AUTO_POTION_TARGET_PCT/100)-current)
}
