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


/** Consulta em lote, somente para jogadores ativos nas últimas 24 horas.
 * Pré-filtro não libera saldo: claimBolsaFamiliaAlpha revalida tudo no lock.
 * Uma consulta a cada 5 minutos evita varrer o banco por mensagem.
 */
export async function activeBolsaFamiliaAlphaCandidates(limit=20){
  if(!rebootEconomyEnabled())return []
  const size=Math.max(1,Math.min(20,Math.floor(Number(limit)||20)))
  const now=Date.now()
  const rows=(await db.query(`
    SELECT u.jid
    FROM wallets w
    JOIN users u ON u.jid=w.jid
    LEFT JOIN trevo_settings t ON t.key='v2:bolsa-familia-alpha:'||u.jid
    WHERE u.banned=FALSE
      AND u.jid ~ '^[0-9]{10,15}@s[.]whatsapp[.]net$'
      AND u.updated_at >= EXTRACT(EPOCH FROM NOW())::bigint-24*3600
      AND GREATEST(w.cash,0)+GREATEST(w.bank,0)<=$1
      AND COALESCE((t.value->>'lastClaimAt')::bigint,0) <= $2
      AND (
        SELECT COUNT(*) FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(t.value->'claims')='array'
            THEN t.value->'claims' ELSE '[]'::jsonb END
        ) x(claim_time)
        WHERE x.claim_time::bigint > $3
      ) < $4
      AND COALESCE((
        SELECT SUM(tr.amount) FROM transactions tr
        WHERE tr.from_jid=u.jid AND tr.type='transfer'
          AND tr.created_at >= $5
      ),0) < $6
    ORDER BY u.updated_at DESC,u.jid
    LIMIT $7`,
    [BOLSA_FAMILIA_ALPHA.maxBalance,now-BOLSA_FAMILIA_ALPHA.cooldownMs,
      now-BOLSA_FAMILIA_ALPHA.windowMs,BOLSA_FAMILIA_ALPHA.maxClaims,
      Math.floor((now-BOLSA_FAMILIA_ALPHA.cooldownMs)/1000),
      BOLSA_FAMILIA_ALPHA.recentPixLimit,size])).rows
  return rows.map(r=>String(r.jid))
}
