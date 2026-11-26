// Partial indexes touch only equipment-related ledger records.
const debitTypes="'equipment_upgrade','equipment_star_forge','equipment_star_forge_shield','equipment_star_forge_collab_fragments','equipment_shop_forge5','equipment_inventory_auto_forge'"
const resetTypes="'owner_reset_total','owner_reset_inventory'"
const saleTypes="'sale','sale_batch'"
export const PAID_GEAR_HISTORY_INDEXES=Object.freeze([
 `CREATE INDEX IF NOT EXISTS transactions_paid_gear_debit_idx ON transactions (from_jid,(split_part(note,' ',1)),id) WHERE type IN (${debitTypes})`,
 `CREATE INDEX IF NOT EXISTS transactions_paid_gear_sale_idx ON transactions (to_jid,(split_part(note,' ',1)),id) WHERE from_jid='shop' AND type IN (${saleTypes})`,
 `CREATE INDEX IF NOT EXISTS transactions_paid_gear_reset_idx ON transactions (from_jid,id DESC) WHERE type IN (${resetTypes})`
])
export const PAID_GEAR_HISTORY_SQL=`
WITH cutoff AS (
 SELECT COALESCE(MAX(id),0) AS id FROM transactions WHERE from_jid=$1 AND type IN (${resetTypes})
)
SELECT type,note,amount,item_id FROM (
 SELECT t.id,type,note,amount,split_part(note,' ',1) AS item_id
 FROM transactions t WHERE from_jid=$1 AND type IN (${debitTypes})
 AND split_part(note,' ',1)=ANY($2::text[]) AND t.id>(SELECT id FROM cutoff)
 UNION ALL
 SELECT t.id,type,note,amount,split_part(note,' ',1) AS item_id
 FROM transactions t WHERE to_jid=$1 AND from_jid='shop' AND type IN (${saleTypes})
 AND split_part(note,' ',1)=ANY($2::text[]) AND t.id>(SELECT id FROM cutoff)
) ledger ORDER BY id`
