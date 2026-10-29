// Reconciliação única e transacional do lote 2 do leilão de 29/10.
// Não envia mensagem a grupos. Só executa com todos os fatos comprovados no banco.
import {db} from './db.js'

const KEY='leilao_quatro_destinos_20261029_1900_v1'
const ORIGINAL='5511948523167@s.whatsapp.net'
const NEXT='5511939089695@s.whatsapp.net'
const ORIGINAL_BID=47100000
const PREVIOUS_BID=47000000
const PET_ID=77
const PET_SPECIES='guaxinim_errante_20261027'
const MARKER='reconciled_pet_to_previous_bidder_20261029'

export async function reconcileAuctionPetOct29(){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    await c.query("SET LOCAL statement_timeout='12000ms'")
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[KEY])
    const r=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KEY])
    const state=r.rows[0]?.value
    if(!state || state.phase!=='completed')throw Error('Leilão ainda não concluído ou ausente')
    const slot=(state.lots||[]).findIndex(l=>(l.prize||[]).some(p=>p.pet===PET_SPECIES))
    if(slot!==1)throw Error('Lote de pet mudou, revisão suspensa')
    const record=(state.history||[]).find(h=>h.lot===slot)
    if(record?.[MARKER]){
      await c.query('ROLLBACK')
      console.log('[AUCTION PET REFUND] already-applied')
      return {status:'already-applied'}
    }
    if(record?.winner?.jid!==ORIGINAL || Number(record.winner.bid)!==ORIGINAL_BID)
      throw Error('Vencedor ou valor original divergente; revisão suspensa')
    if(!Array.isArray(record.rewards) || !record.rewards.some(x=>String(x).includes('Guaxinim Errante')) || !record.rewards.some(x=>String(x).includes('Caixa Épica')))
      throw Error('Composição do prêmio divergente; revisão suspensa')
    const tx=await c.query("SELECT id FROM transactions WHERE type='leilao_quatro_destinos_20261029' AND from_jid=$1 AND amount=$2 AND note=$3",[
      ORIGINAL,ORIGINAL_BID,KEY+':lot:'+slot
    ])
    if(tx.rowCount!==1)throw Error('Não há transação única do arremate original')
    const prior=await c.query("SELECT bid_version FROM auction_bid_notice_outbox WHERE auction_key=$1 AND message LIKE '%LOTE 2/4%' AND message LIKE '%Kaique Rodrigues%' AND message LIKE '%R$ 47.000.000%' LIMIT 1",[KEY])
    if(prior.rowCount!==1)throw Error('Lance anterior do Kaique não comprovado')
    const u=await c.query('SELECT jid,push_name FROM users WHERE jid=$1',[NEXT])
    if(u.rowCount!==1 || !/kaique/i.test(String(u.rows[0].push_name||'')))throw Error('Cadastro do Kaique não confirmado')
    const oldPet=await c.query("SELECT id FROM pet_collection WHERE jid=$1 AND species=$2 AND id<>$3",[ORIGINAL,PET_SPECIES,PET_ID])
    if(oldPet.rowCount<1)throw Error('Pet antigo não encontrado; manter ambos intactos')
    const pet=await c.query('SELECT id,jid,species,level,xp,active FROM pet_collection WHERE id=$1 FOR UPDATE',[PET_ID])
    if(pet.rowCount!==1 || pet.rows[0].jid!==ORIGINAL || pet.rows[0].species!==PET_SPECIES || Number(pet.rows[0].level)!==1 || Boolean(pet.rows[0].active))
      throw Error('Pet recebido não corresponde ao arremate original')
    const team=await c.query('SELECT slot FROM pet_team WHERE pet_id=$1',[PET_ID])
    const exped=await c.query("SELECT id FROM pet_expeditions WHERE pet_id=$1 AND resolved=FALSE LIMIT 1",[PET_ID])
    if(team.rowCount || exped.rowCount)throw Error('Pet do leilão foi equipado ou enviado a expedição; revisão manual necessária')
    const boxes=await c.query("SELECT quantity FROM inventories WHERE jid=$1 AND item_id='caixa_epica' FOR UPDATE",[ORIGINAL])
    if(boxes.rowCount!==1 || Number(boxes.rows[0].quantity)<2)throw Error('As 2 Caixas Épicas já não estão disponíveis no inventário original')
    const wallets=await c.query('SELECT jid,cash,bank FROM wallets WHERE jid IN ($1,$2) ORDER BY jid FOR UPDATE',[ORIGINAL,NEXT])
    if(wallets.rowCount!==2)throw Error('Carteiras incompletas')
    const winnerWallet=wallets.rows.find(w=>w.jid===NEXT)
    if(Number(winnerWallet.cash)+Number(winnerWallet.bank)<PREVIOUS_BID)
      throw Error('Saldo atual do Kaique insuficiente para pagar o lance registrado')
    const cashDebit=Math.min(PREVIOUS_BID,Number(winnerWallet.cash))
    const bankDebit=PREVIOUS_BID-cashDebit
    await c.query("UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$3",[cashDebit,bankDebit,NEXT])
    await c.query("UPDATE wallets SET bank=bank+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2",[ORIGINAL_BID,ORIGINAL])
    await c.query("UPDATE pet_collection SET jid=$1,active=FALSE WHERE id=$2 AND jid=$3",[NEXT,PET_ID,ORIGINAL])
    await c.query("UPDATE inventories SET quantity=quantity-2 WHERE jid=$1 AND item_id='caixa_epica' AND quantity>=2",[ORIGINAL])
    await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'caixa_epica',2) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+2",[NEXT])
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'leilao_reembolso_20261029',$3)",[
      ORIGINAL,ORIGINAL_BID,KEY+':lot:1:refund-duplicate-pet'
    ])
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'leilao_correcao_20261029',$3)",[
      NEXT,PREVIOUS_BID,KEY+':lot:1:previous-bidder'
    ])
    record[MARKER]={originalWinner:ORIGINAL,originalBid:ORIGINAL_BID,newWinner:NEXT,newBid:PREVIOUS_BID,petId:PET_ID,boxes:2,at:Date.now()}
    record.winner={jid:NEXT,name:'Kaique Rodrigues',bid:PREVIOUS_BID}
    record.rewards=['🐾 Guaxinim Errante Nv.1','Caixa Épica ×2']
    await c.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE key=$1',[
      KEY,JSON.stringify(state)
    ])
    await c.query('COMMIT')
    console.log('[AUCTION PET REFUND] APPLIED',JSON.stringify({lot:2,petId:PET_ID,refund:ORIGINAL_BID,newBid:PREVIOUS_BID}))
    return {status:'applied',refund:ORIGINAL_BID,newBid:PREVIOUS_BID}
  }catch(err){
    await c.query('ROLLBACK').catch(()=>{})
    console.error('[AUCTION PET REFUND] NOT APPLIED:',err?.message||String(err))
    return {status:'not-applied',error:String(err?.message||err)}
  }finally{c.release()}
}
