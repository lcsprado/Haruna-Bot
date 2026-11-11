// Auction prizes: forge eligible equipment at ★★★★★ Lv.10 in the same prize transaction.
// Non-equipment (XP, consumables, vouchers, pets, materials and relics) is not forgeable.
import {syncEffectiveGear} from './equipment-star-logic.js'

export const AUCTION_FORGE_CATEGORIES=Object.freeze(['weapon','armor','boots','helmet','shield'])

export async function grantAuctionInventoryItem(client,jid,itemId,quantity=1){
 const qty=Number(quantity)
 if(!Number.isSafeInteger(qty)||qty<1)throw new Error('Quantidade de prêmio inválida.')
 const metadata=(await client.query('SELECT name,category FROM items WHERE id=$1',[itemId])).rows[0]
 if(!metadata)throw new Error('Item de prêmio não encontrado: '+itemId)
 await client.query(
  'INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',
  [jid,itemId,qty]
 )
 const forged=AUCTION_FORGE_CATEGORIES.includes(String(metadata.category||''))
 if(forged){
  // A forja é por modelo de item (uma cópia estrelada); eventuais reservas continuam independentes.
  await client.query(`INSERT INTO equipment_star_forges(jid,item_id,stars,level,updated_at)
   VALUES($1,$2,5,10,EXTRACT(EPOCH FROM NOW())::BIGINT)
   ON CONFLICT(jid,item_id) DO UPDATE SET stars=5,level=10,updated_at=EXCLUDED.updated_at`,
   [jid,itemId])
  await syncEffectiveGear(client,jid,itemId)
 }
 return {name:metadata.name,qty,forged,description:metadata.name+' ×'+qty+(forged?' • FORJADO ★★★★★ Lv.10':'')}
}
