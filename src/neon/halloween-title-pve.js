// Título do Altar Halloween: passiva de +10% somente para XP de Boss/Raid.
// Leitura isolada; nenhum crédito retroativo, transferência ou comando admin.
export const HALLOWEEN_TITLE_ID='titulo_soberano_almas_halloween_20261031'
export const HALLOWEEN_TITLE_XP_BONUS=0.10
export function halloweenTitleBonusXp(amount,owned=false){
 const base=Math.max(0,Math.floor(Number(amount)||0))
 return owned?Math.round(base*(1+HALLOWEEN_TITLE_XP_BONUS)):base
}
export async function ownsHalloweenTitle(client,jid){
 const r=await client.query('SELECT 1 FROM inventories WHERE jid=$1 AND item_id=$2 AND quantity>0 LIMIT 1',
   [jid,HALLOWEEN_TITLE_ID])
 return r.rowCount>0||Boolean(r.rows?.length)
}
export async function halloweenPveXp(client,jid,baseXp){
 return halloweenTitleBonusXp(baseXp,await ownsHalloweenTitle(client,jid))
}
