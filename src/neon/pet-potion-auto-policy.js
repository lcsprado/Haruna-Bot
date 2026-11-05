// Autocura em Boss e Raid: não aplica um teto diário oculto.
// Cada uso continua debitando exatamente uma poção e registrando auditoria
// na mesma transação. O motor de combate limita a uma poção por pet/rodada.
export const MAX_PET_AUTO_POTIONS_PER_DAY = 0 // 0 = sem limite diário artificial

export async function spendAutoPetPotion(client,{jid,itemId,context='raid',petName='Pet'}={}) {
  if(!client||!jid||!itemId) throw new Error('Autocura: parâmetros inválidos.')
  const debit=await client.query(
    'UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2 AND quantity>0 RETURNING quantity',
    [jid,itemId]
  )
  if(debit.rowCount!==1) return {spent:false,reason:'no_stock'}
  await client.query(`
    INSERT INTO transactions(from_jid,to_jid,amount,type,note)
    VALUES($1,'pet_auto',0,'pet_auto_potion',$2)
  `,[jid,`${String(context).slice(0,24)}|${itemId}|${String(petName).slice(0,100)}`])
  return {spent:true,remaining:Number(debit.rows[0].quantity),limit:null}
}
