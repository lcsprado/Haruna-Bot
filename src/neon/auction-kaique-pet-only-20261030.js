// Retirada pontual do Guaxinim Errante ID 77, entregue a Kaique no leilão 29/10.
// O estorno foi tratado separadamente. NUNCA creditar/debitar dinheiro aqui.
// Não altera caixas, pets antigos, times, grupos ou leilões atuais.
import {db} from './db.js'

export const KAIQUE_PET_REMOVAL_MARKER='auction_20261029_kaique_guaxinim_id77_removed_20261030_v1'
const AUCTION_KEY='leilao_quatro_destinos_20261029_1900_v1'
const SPECIES='guaxinim_errante_20261027'
const KAIQUE='5511939089695@s.whatsapp.net'
const PRIOR_OWNER='5511948523167@s.whatsapp.net'
const TRANSFER_MARKER='reconciled_pet_to_previous_bidder_20261029'
const PET_ID=77
const LOT=1

export async function removeKaiqueGuaxinimId77({pool=db,apply=false}={}){
  const c=await pool.connect()
  let inTransaction=false
  try{
    await c.query('BEGIN')
    inTransaction=true
    await c.query("SET LOCAL statement_timeout='12000ms'")
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[AUCTION_KEY])

    const already=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KAIQUE_PET_REMOVAL_MARKER])
    if(already.rowCount){
      await c.query('ROLLBACK');inTransaction=false
      return {status:'already-removed',petId:PET_ID}
    }
    // Exigir rastreabilidade da transferência anterior. Não agir apenas pelo nome da espécie.
    const auction=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[AUCTION_KEY])
    const state=auction.rows[0]?.value
    if(!state||state.phase!=='completed')throw Error('Histórico do leilão indisponível')
    const prize=state.lots?.[LOT]?.prize
    if(!Array.isArray(prize)||!prize.some(item=>item.pet===SPECIES))
      throw Error('Lote do pet diverge do histórico')
    const entries=(state.history||[]).filter(entry=>Number(entry.lot)===LOT)
    if(entries.length!==1)throw Error('Histórico do lote não é único')
    const transfer=entries[0]?.[TRANSFER_MARKER]
    if(!transfer||transfer.originalWinner!==PRIOR_OWNER||transfer.newWinner!==KAIQUE||
      Number(transfer.petId)!==PET_ID||Number(transfer.newBid)!==47000000)
      throw Error('Origem do Guaxinim ID 77 não comprovada')

    const pet=await c.query(
      'SELECT id,jid,species,name,level,xp,active FROM pet_collection WHERE id=$1 FOR UPDATE',
      [PET_ID]
    )
    if(pet.rowCount===0){
      await c.query('ROLLBACK');inTransaction=false
      return {status:'already-absent',petId:PET_ID}
    }
    const p=pet.rows[0]
    if(p.jid!==KAIQUE||p.species!==SPECIES)
      throw Error('Pet ID 77 não está no cadastro esperado')
    if(Boolean(p.active)||Number(p.level)!==1||Number(p.xp)!==0)
      throw Error('Pet alterado/evoluído/ativo; bloqueado para evitar perda indevida')

    const team=await c.query('SELECT slot FROM pet_team WHERE pet_id=$1 LIMIT 1',[PET_ID])
    const exped=await c.query('SELECT id FROM pet_expeditions WHERE pet_id=$1 LIMIT 1',[PET_ID])
    if(team.rowCount||exped.rowCount)
      throw Error('Pet possui equipe ou histórico de expedição vinculado; revisão necessária')
    if(!apply){
      await c.query('ROLLBACK');inTransaction=false
      return {status:'dry-run-ok',petId:PET_ID,owner:'Kaique'}
    }

    const removed=await c.query(
      'DELETE FROM pet_collection WHERE id=$1 AND jid=$2 AND species=$3 AND active=FALSE RETURNING id',
      [PET_ID,KAIQUE,SPECIES]
    )
    if(removed.rowCount!==1)throw Error('Pet não removido, operação revertida')
    // Marcador idempotente de auditoria; mantém o histórico original do leilão.
    await c.query(
      'INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint)',
      [KAIQUE_PET_REMOVAL_MARKER,JSON.stringify({
        status:'removed',auction:AUCTION_KEY,lot:LOT,petId:PET_ID,
        owner:KAIQUE,species:SPECIES,at:Date.now(),cashChanged:false,
        boxesChanged:false
      })]
    )
    await c.query('COMMIT');inTransaction=false
    return {status:'removed',petId:PET_ID,cashChanged:false,boxesChanged:false}
  }catch(error){
    if(inTransaction)await c.query('ROLLBACK').catch(()=>{})
    return {status:'not-applied',reason:String(error?.message||error)}
  }finally{
    c.release()
  }
}
