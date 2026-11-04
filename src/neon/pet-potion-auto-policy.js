// Limite global de autocura por jogador; curas manuais não entram nessa cota.
// Registrar e debitar na mesma transação evita consumo silencioso e inconsistências.
export const MAX_PET_AUTO_POTIONS_PER_DAY = 12

export async function spendAutoPetPotion(client,{jid,itemId,context='raid',petName='Pet'}={}) {
  if(!client||!jid||!itemId) throw new Error('Autocura: parâmetros inválidos.')
  const {rows}=await client.query(`
    SELECT COUNT(*)::integer AS used
    FROM transactions
    WHERE from_jid=$1 AND type='pet_auto_potion'
      AND created_at >= EXTRACT(EPOCH FROM (
        date_trunc('day',NOW() AT TIME ZONE 'America/Sao_Paulo')
          AT TIME ZONE 'America/Sao_Paulo'
      ))::bigint
  `,[jid])
  const used=Number(rows[0]?.used||0)
  if(used>=MAX_PET_AUTO_POTIONS_PER_DAY)
    return {spent:false,reason:'daily_limit',used,limit:MAX_PET_AUTO_POTIONS_PER_DAY}

  const debit=await client.query(
    'UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2 AND quantity>0 RETURNING quantity',
    [jid,itemId]
  )
  if(debit.rowCount!==1) return {spent:false,reason:'no_stock'}
  await client.query(`
    INSERT INTO transactions(from_jid,to_jid,amount,type,note)
    VALUES($1,'pet_auto',0,'pet_auto_potion',$2)
  `,[jid,`${String(context).slice(0,24)}|${itemId}|${String(petName).slice(0,100)}`])
  return {spent:true,remaining:Number(debit.rows[0].quantity),used:used+1,limit:MAX_PET_AUTO_POTIONS_PER_DAY}
}
