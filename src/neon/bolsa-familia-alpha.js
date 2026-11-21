import {db,ensureUser} from './db.js'
import {rebootEconomyEnabled} from './reboot-economy-policy.js'
import {assessBolsaFamiliaAlpha,BOLSA_FAMILIA_ALPHA} from './bolsa-familia-alpha-policy.js'

const claimKey=jid=>'v2:bolsa-familia-alpha:'+jid

export async function claimBolsaFamiliaAlpha(jid){
  if(!rebootEconomyEnabled())return {ok:false,status:'disabled'}
  if(!/^\d{10,15}@s\.whatsapp\.net$/.test(String(jid||'')))return {ok:false,status:'identity'}
  await ensureUser(jid)
  const c=await db.connect()
  let inTransaction=false
  try{
    await c.query('BEGIN')
    inTransaction=true
    // Trava a carteira antes da elegibilidade: impede dois resgates paralelos
    // do mesmo jogador, inclusive enviados de grupos diferentes.
    const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!wallet)throw Error('Carteira do jogador não encontrada.')
    const now=Date.now()
    const key=claimKey(jid)
    const claimRow=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]
    const pix=(await c.query(`SELECT COALESCE(SUM(amount),0)::bigint AS total
      FROM transactions
      WHERE from_jid=$1 AND type='transfer' AND created_at >= $2`,
      [jid,Math.floor((now-BOLSA_FAMILIA_ALPHA.cooldownMs)/1000)])).rows[0]
    const result=assessBolsaFamiliaAlpha({
      cash:Number(wallet.cash),
      bank:Number(wallet.bank),
      claims:claimRow?.value?.claims||[],
      pixSent:Number(pix?.total||0),
      now
    })
    if(!result.ok){
      await c.query('ROLLBACK')
      inTransaction=false
      return result
    }
    const p=BOLSA_FAMILIA_ALPHA
    const updated=(await c.query(
      'UPDATE wallets SET cash=cash+$2,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$1 RETURNING cash,bank',
      [jid,p.cash])).rows[0]
    await c.query(`INSERT INTO inventories(jid,item_id,quantity)
      VALUES($1,$2,$3) ON CONFLICT(jid,item_id)
      DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,
      [jid,p.potionId,p.potionCount])
    await c.query(`INSERT INTO trevo_settings(key,value,updated_at)
      VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint)
      ON CONFLICT(key) DO UPDATE
      SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
      [key,JSON.stringify({claims:result.claims,lastClaimAt:now,totalClaims:Number(claimRow?.value?.totalClaims||0)+1})])
    await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES('system',$1,$2,'bolsa_familia_alpha',$3)`,
      [jid,p.cash,'Auxílio V2: +2 Poções Médias vinculadas'])
    await c.query('COMMIT')
    inTransaction=false
    return {ok:true,status:'granted',cash:p.cash,potions:p.potionCount,potionId:p.potionId,
      balanceBefore:result.balance,
      cashAfter:Number(updated.cash),bankAfter:Number(updated.bank),
      nextAt:now+p.cooldownMs,claimsThisWeek:result.claims.length,maxClaims:p.maxClaims}
  }catch(error){
    if(inTransaction)await c.query('ROLLBACK').catch(()=>{})
    throw error
  }finally{
    c.release()
  }
}
