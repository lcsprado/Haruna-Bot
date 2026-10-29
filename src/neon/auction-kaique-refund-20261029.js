// Estorno privado e idempotente do lote 2 de 29/10.
// Devolve R$ 47 milhões ao Kaique e remove somente o pet entregue pelo lote.
// Não envia mensagens nem altera outros jogadores, pets ou caixas.
import {db} from './db.js'

const KEY='leilao_quatro_destinos_20261029_1900_v1'
const KAIQUE='5511939089695@s.whatsapp.net'
const ORIGINAL='5511948523167@s.whatsapp.net'
const AMOUNT=47000000
const PET_ID=77
const PET_SPECIES='guaxinim_errante_20261027'
const TRANSFER_MARKER='reconciled_pet_to_previous_bidder_20261029'
const REFUND_MARKER='kaique_pet_refunded_20261029'
const REFUND_TYPE='leilao_estorno_kaique_20261029'
const REFUND_NOTE=KEY+':lot:1:kaique-full-refund-pet-removed'

export async function undoKaiqueGuaxinim20261029({apply=false}={}){
  const c=await db.connect()
  let transactionOpen=false
  try{
    await c.query('BEGIN')
    transactionOpen=true
    await c.query("SET LOCAL statement_timeout='12000ms'")
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[KEY])
    const settings=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KEY])
    const state=settings.rows[0]?.value
    if(!state || state.phase!=='completed')throw Error('Leilão não encerrado ou histórico ausente')
    const lotIndex=(state.lots||[]).findIndex(l=>(l.prize||[]).some(p=>p.pet===PET_SPECIES))
    if(lotIndex!==1)throw Error('Lote do Guaxinim não corresponde ao lote 2')
    const entries=(state.history||[]).filter(h=>h.lot===lotIndex)
    if(entries.length!==1)throw Error('Histórico do lote 2 não é único')
    const record=entries[0]
    if(record[REFUND_MARKER]){
      await c.query('ROLLBACK')
      transactionOpen=false
      console.log('[KAIQUE 47M REFUND] already-applied')
      return {status:'already-applied'}
    }
    const transfer=record[TRANSFER_MARKER]
    if(!transfer || transfer.originalWinner!==ORIGINAL || Number(transfer.originalBid)!==47100000 ||
       transfer.newWinner!==KAIQUE || Number(transfer.newBid)!==AMOUNT ||
       Number(transfer.petId)!==PET_ID ||
       record.winner?.jid!==KAIQUE || Number(record.winner?.bid)!==AMOUNT)
      throw Error('Transferência anterior ou vencedor divergente; operação bloqueada')
    const user=await c.query('SELECT push_name FROM users WHERE jid=$1',[KAIQUE])
    if(user.rowCount!==1 || !/kaique/i.test(String(user.rows[0].push_name||'')))
      throw Error('Identidade do Kaique não confirmada')
    const charges=await c.query("SELECT id FROM transactions WHERE type='leilao_correcao_20261029' AND from_jid=$1 AND amount=$2 AND note=$3",[
      KAIQUE,AMOUNT,KEY+':lot:1:previous-bidder'
    ])
    if(charges.rowCount!==1)throw Error('Débito de 47 milhões não encontrado de forma única')
    const priorRefund=await c.query('SELECT id FROM transactions WHERE type=$1 AND to_jid=$2 AND note=$3',[
      REFUND_TYPE,KAIQUE,REFUND_NOTE
    ])
    if(priorRefund.rowCount!==0)throw Error('Estorno já existente sem marcador: exigir revisão manual')
    const pet=await c.query('SELECT id,jid,species,level,active FROM pet_collection WHERE id=$1 FOR UPDATE',[PET_ID])
    if(pet.rowCount!==1 || pet.rows[0].jid!==KAIQUE || pet.rows[0].species!==PET_SPECIES)
      throw Error('Pet ID 77 não está com Kaique ou espécie divergente')
    if(Boolean(pet.rows[0].active))throw Error('Pet está ativo: requer retirada segura da equipe')
    const team=await c.query('SELECT slot FROM pet_team WHERE pet_id=$1',[PET_ID])
    const expedition=await c.query('SELECT id FROM pet_expeditions WHERE pet_id=$1 AND resolved=FALSE LIMIT 1',[PET_ID])
    if(team.rowCount || expedition.rowCount)
      throw Error('Guaxinim está em equipe ou expedição; não remover automaticamente')
    const wallet=await c.query('SELECT jid,cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[KAIQUE])
    if(wallet.rowCount!==1)throw Error('Carteira do Kaique ausente')
    const before=Number(wallet.rows[0].cash)+Number(wallet.rows[0].bank)
    const details={petId:PET_ID,petLevel:pet.rows[0].level,refund:AMOUNT,before,totalAfter:before+AMOUNT}
    if(!apply){
      await c.query('ROLLBACK')
      transactionOpen=false
      console.log('[KAIQUE 47M REFUND] DRY_RUN_OK',JSON.stringify(details))
      return {status:'dry-run-ok',...details}
    }
    const credited=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2 RETURNING cash,bank',[AMOUNT,KAIQUE])
    if(credited.rowCount!==1 || Number(credited.rows[0].cash)+Number(credited.rows[0].bank)!==before+AMOUNT)
      throw Error('Saldo pós-estorno divergente')
    const removed=await c.query('DELETE FROM pet_collection WHERE id=$1 AND jid=$2 AND species=$3 RETURNING id',[PET_ID,KAIQUE,PET_SPECIES])
    if(removed.rowCount!==1)throw Error('Guaxinim não removido')
    await c.query('INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$2,$3,$4,$5)',[
      'system',KAIQUE,AMOUNT,REFUND_TYPE,REFUND_NOTE
    ])
    record[REFUND_MARKER]={amount:AMOUNT,petId:PET_ID,at:Date.now(),boxesUntouched:true}
    record.winner=null
    record.rewards=[]
    record.cancelled=true
    await c.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE key=$1',[
      KEY,JSON.stringify(state)
    ])
    await c.query('COMMIT')
    transactionOpen=false
    console.log('[KAIQUE 47M REFUND] APPLIED',JSON.stringify(details))
    return {status:'applied',...details}
  }catch(err){
    if(transactionOpen)await c.query('ROLLBACK').catch(()=>{})
    console.error('[KAIQUE 47M REFUND] NOT_APPLIED:',err?.message||String(err))
    return {status:'not-applied',error:String(err?.message||err)}
  }finally{c.release()}
}
