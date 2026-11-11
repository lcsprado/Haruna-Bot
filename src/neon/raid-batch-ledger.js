import {batchFee,RAID_BATCH_POLICY,batchReducedAmount} from './raid-batch-rules.js'

// Todas as operações de cobrança e liquidação participam DA MESMA
// transação que consome a chave, salva HP e paga o prêmio.
export async function startRaidBatchAttempt(c,s,cfg){
 const batch=s?.raidBatch
 if(!batch)return null
 if(!Number.isSafeInteger(Number(batch.jobId))||!Number.isSafeInteger(Number(batch.ordinal)))
  throw new Error('Lote sem identificação segura.')
 const {rows}=await c.query('SELECT * FROM raid_batch_jobs WHERE id=$1 FOR UPDATE',[batch.jobId])
 const job=rows[0]
 const jid=String(job?.jid||''),ordinal=Number(batch.ordinal)
 if(!job||jid!==s.host||Number(job.level)!==Number(cfg.level)
     ||!['queued','running'].includes(job.status)
     ||Boolean(job.cancel_requested)
     ||ordinal!==Number(job.started_count)+1||ordinal>Number(job.requested_count))
  throw new Error('Lote suspenso, alterado ou com tentativa repetida.')
 if(Object.keys(s.players||{}).length!==1||!s.players[jid])
  throw new Error('Lote automático é individual e não aceita carona.')
 const usage=(await c.query(`
  SELECT COUNT(*)::int AS total FROM raid_batch_attempts a
  JOIN raid_batch_jobs j ON j.id=a.job_id
  WHERE j.jid=$1 AND a.started_at_ms >= $2 AND a.status IN ('running','won','lost')
 `,[jid,Date.now()-RAID_BATCH_POLICY.rollingWindowMs])).rows[0]
 if(Number(usage?.total||0)>=RAID_BATCH_POLICY.maxPer24h)
  throw new Error('Limite de 10 Raids automáticas em 24h atingido.')
 const fee=batchFee(cfg.keyPrice)
 const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
 const cash=Number(wallet?.cash||0),bank=Number(wallet?.bank||0)
 if(!wallet||cash+bank<fee)throw new Error('Saldo insuficiente para taxa da automação de R$ '+fee.toLocaleString('pt-BR')+'.')
 const inserted=await c.query(`
  INSERT INTO raid_batch_attempts(job_id,ordinal,status,started_at_ms,fee_paid,key_price,key_bought)
  VALUES($1,$2,'running',$3,$4,$5,$6)
  ON CONFLICT(job_id,ordinal) DO NOTHING RETURNING ordinal
 `,[job.id,ordinal,Date.now(),fee,cfg.keyPrice,Boolean(batch.keyPurchased)])
 if(inserted.rowCount!==1)throw new Error('Tentativa já faturada; nenhum débito repetido.')
 const fromCash=Math.min(cash,fee)
 await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2 WHERE jid=$3',[fromCash,fee-fromCash,jid])
 await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
  VALUES($1,'prefeitura_alpha',$2,'raid_batch_fee',$3)`,
  [jid,fee,'!raidlote #'+job.id+' tentativa '+ordinal+' Lv.'+cfg.level])
 await c.query(`INSERT INTO raid_batch_treasury(job_id,ordinal,amount,recorded_at_ms)
  VALUES($1,$2,$3,$4)`,[job.id,ordinal,fee,Date.now()])
 await c.query(`UPDATE raid_batch_jobs SET started_count=started_count+1,status='running',
  updated_at_ms=$2,last_start_ms=$2,total_fee_spend=total_fee_spend+$3,
  total_key_spend=total_key_spend+$4 WHERE id=$1`,[job.id,Date.now(),fee,batch.keyPurchased?cfg.keyPrice:0])
 return {jobId:job.id,ordinal,fee}
}
export async function settleRaidBatchAttempt(c,s,won,reason='none',rewards=[]){
 if(!s?.raidBatch)return null
 const {jobId,ordinal}=s.raidBatch
 const r=rewards.find(x=>x.jid===s.host)||{}
 const total={
  cash:won?Math.floor(Number(r.cash)||0):0,
  xp:won?Math.floor(Number(r.awardedExp??r.exp)||0):0,
  petXp:won?(Array.isArray(r.petXpTeam)?r.petXpTeam.reduce((n,p)=>n+Math.max(0,Number(p.creditedXp??p.xp)||0),0):Math.floor(Number(r.petXp)||0)):0,
  masteryXp:won?Math.floor(Number(r.masteryReport?.earned)||0):0,
  fragments:won?Math.floor(Number(r.material?.qty)||0):0
 }
 const {rows}=await c.query('SELECT * FROM raid_batch_jobs WHERE id=$1 FOR UPDATE',[jobId])
 const job=rows[0]
 if(!job||job.jid!==s.host||Number(job.started_count)!==Number(ordinal))
  throw new Error('Lote inconsistente no fechamento; revertendo o prêmio.')
 const finished=await c.query(`
  UPDATE raid_batch_attempts SET status=$3,finished_at_ms=$4,
   cash=$5,xp=$6,pet_xp=$7,mastery_xp=$8,fragments=$9,
   reason=$10,rounds=$11
  WHERE job_id=$1 AND ordinal=$2 AND status='running'
  RETURNING ordinal
 `,[jobId,ordinal,won?'won':'lost',Date.now(),total.cash,total.xp,total.petXp,
 total.masteryXp,total.fragments,reason,Number(s.round||0)])
 if(finished.rowCount!==1)
  throw new Error('Tentativa de Raid já liquidada, prêmio duplicado bloqueado.')
 const completed=Number(job.completed_count)+(won?1:0)
 const status=!won?'failed':job.cancel_requested?'cancelled':
  completed>=Number(job.requested_count)?'completed':'queued'
 await c.query(`
  UPDATE raid_batch_jobs SET completed_count=$2,status=$3,
   total_cash=total_cash+$4,total_xp=total_xp+$5,total_pet_xp=total_pet_xp+$6,
   total_mastery_xp=total_mastery_xp+$7,total_fragments=total_fragments+$8,
   last_end_ms=$9,updated_at_ms=$9,finish_reason=$10
  WHERE id=$1
 `,[jobId,completed,status,total.cash,total.xp,total.petXp,total.masteryXp,
 total.fragments,Date.now(),won?'victory':reason])
 return {status,completed,totals:total}
}
