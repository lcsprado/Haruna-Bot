// Correção única do lote 1 de 29/10: 7x Preguiça -> 1 de cada Pecado.
// Não adiciona invocações, não altera outros lotes e não reabre o leilão.
// Transação, trava por jogador e marcador idempotente.
import {db} from './db.js'
import {PECADOS_ESSENCES} from './sete-pecados-catalog.js'

export const AUCTION_ESSENCE_REPAIR_KEY='auction_20261029_lot1_essence_split_20261030_v1'
const AUCTION_KEY='leilao_quatro_destinos_20261029_1900_v1'
const ORIGINAL='essencia_pecado_preguica'
const OTHER_ESSENCES=Object.freeze(PECADOS_ESSENCES.filter(id=>id!==ORIGINAL))

export function eligibleAuctionEssenceWinner(state){
  if(state?.phase!=='completed')return null
  const lot=Array.isArray(state?.history)
    ?state.history.find(row=>Number(row?.lot)===0):null
  if(!lot?.winner?.jid||!Number.isFinite(Number(lot.winner.bid))||Number(lot.winner.bid)<1)
    return null
  const prize=state?.lots?.[0]?.prize
  if(!Array.isArray(prize)||prize.length!==2)return null
  if(!prize.some(item=>item.id===ORIGINAL&&Number(item.qty)===7)||
    !prize.some(item=>item.id==='caixa_lendaria'&&Number(item.qty)===1))return null
  // Exige prova de entrega, não apenas lote arrematado.
  const delivered=Array.isArray(lot.rewards)&&lot.rewards.some(
    label=>/ess[eê]ncia de pregui[cç]a\s*[×x]\s*7/i.test(String(label))
  )
  return delivered?String(lot.winner.jid):null
}

export async function repairAuctionEssences({pool=db}={}){
  const c=await pool.connect()
  try{
    await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[AUCTION_KEY])
    const stateRow=await c.query('SELECT value FROM trevo_settings WHERE key=$1',[AUCTION_KEY])
    const jid=eligibleAuctionEssenceWinner(stateRow.rows[0]?.value)
    if(!jid){
      await c.query('COMMIT')
      return {status:'not-eligible'}
    }
    // Mesmo lock do !7pecados abrir (FOR UPDATE de users).
    const user=await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
    if(!user.rowCount){
      await c.query('COMMIT')
      return {status:'missing-user'}
    }
    const marker=await c.query('SELECT key FROM trevo_settings WHERE key=$1 FOR UPDATE',[AUCTION_ESSENCE_REPAIR_KEY])
    if(marker.rowCount){
      await c.query('COMMIT')
      return {status:'already-repaired'}
    }
    const stock=await c.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
      [jid,ORIGINAL]
    )
    if(Number(stock.rows[0]?.quantity||0)<7){
      // Não recriar prêmios caso o jogador já tenha usado as essências.
      await c.query('COMMIT')
      return {status:'original-essences-used-or-missing'}
    }
    const debit=await c.query(
      'UPDATE inventories SET quantity=quantity-6 WHERE jid=$1 AND item_id=$2 AND quantity>=7 RETURNING quantity',
      [jid,ORIGINAL]
    )
    if(!debit.rowCount)throw Error('Saldo de essências alterado durante a correção')
    await c.query(
      'INSERT INTO inventories(jid,item_id,quantity) '+
      'SELECT $1,t.item_id,1 FROM unnest($2::text[]) AS t(item_id) '+
      'ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',
      [jid,OTHER_ESSENCES]
    )
    await c.query(
      'INSERT INTO trevo_settings(key,value,updated_at) '+
      'VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint)',
      [AUCTION_ESSENCE_REPAIR_KEY,JSON.stringify({
        edition:'2026-10-29',lot:1,converted:6,retainedPreguica:1,
        added:OTHER_ESSENCES,at:Date.now()
      })]
    )
    await c.query('COMMIT')
    return {status:'repaired',totalEssences:7}
  }catch(e){
    await c.query('ROLLBACK').catch(()=>{})
    throw e
  }finally{c.release()}
}
