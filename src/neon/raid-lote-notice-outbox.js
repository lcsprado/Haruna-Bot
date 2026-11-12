// RAIDLOTE: recibo privado persistente. O envio nao controla nem repete a recompensa.
// O pacote e seus premios ja foram liquidados antes de criar esta notificacao.
import {summarizeRaidLoteXp} from './raid-lote-xp-summary.js'
import {formatRaidLoteMaterials} from './raid-lote-material-summary.js'

const safeInt=x=>Math.max(0,Math.floor(Number(x)||0))
const money=x=>safeInt(x).toLocaleString('pt-BR')
const privateJid=jid=>/^\d{10,15}@s\.whatsapp\.net$/.test(String(jid||''))
const finishedStatuses=['won','lost','cancelled']

export function formatRaidLotePrivateReceipt(job,reports=[]){
  if(!job||!finishedStatuses.includes(job.status))throw new Error('Pacote nao concluido')
  const records=Array.isArray(reports)?reports:[]
  const earned=records.filter(row=>row.status==='won')
  const cash=earned.reduce((sum,row)=>sum+(row.reward_summary?.rewards||[]).reduce((n,r)=>n+safeInt(r.cash),0),0)
  const petXp=earned.reduce((sum,row)=>sum+(row.reward_summary?.rewards||[]).reduce((n,r)=>n+safeInt(r.petXp),0),0)
  const masteryXp=earned.reduce((sum,row)=>sum+(row.reward_summary?.rewards||[]).reduce((n,r)=>n+safeInt(r.masteryXp),0),0)
  const {totalXp,bonusXp}=summarizeRaidLoteXp(earned)
  const heading=job.status==='won'?'PACOTE CONCLUÍDO':job.status==='lost'?'PACOTE ENCERRADO POR DERROTA':'PACOTE CANCELADO'
  return '⚔️ *RAIDLOTE V1 — '+heading+'*'
    +'\n🎯 Raid Lv.'+safeInt(job.level)+' • '+earned.length+'/'+safeInt(job.requested)+' vitórias'
    +'\n🔑 Tentativas iniciadas: '+safeInt(job.started)
    +'\n💰 Dinheiro ganho: R$ '+money(cash)
    +'\n✨ XP do jogador: +'+money(totalXp)
    +'\n🐾 XP dos pets: +'+money(petXp)
    +(masteryXp>0?'\n🏅 XP de maestria: +'+money(masteryXp):'')
    +(bonusXp>0?'\n⏳ Bônus de ampulheta/elixir: +'+money(bonusXp)+' XP (incluído no XP acima)':'')
    +formatRaidLoteMaterials(records)
    +'\n💳 Valor pago no pacote: R$ '+money(job.total_paid)
    +'\n📌 Recompensas já contabilizadas; este aviso não credita nada novamente.'
    +'\n🧾 Recibo: '+String(job.id||'').slice(0,8)
}

export async function initRaidLoteNoticeOutbox(db){
  await db.query(`
    CREATE TABLE IF NOT EXISTS raid_lote_notice_outbox (
      job_id UUID PRIMARY KEY REFERENCES raid_lote_jobs(id),
      jid TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','sending','retry','sent')),
      attempts INTEGER NOT NULL DEFAULT 0,
      retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    )
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS raid_lote_notice_pending_idx
    ON raid_lote_notice_outbox(status,retry_at) WHERE sent_at IS NULL
  `)
}

// Chamado na MESMA transacao que encerra o job. Nao se perde entre o
// encerramento da ultima Raid e a entrega da mensagem ao WhatsApp.
export async function enqueueRaidLoteNotice(client,jobId,jid){
  if(!privateJid(jid))throw new Error('Destino de recibo privado sem numero verificado')
  await client.query(`
    INSERT INTO raid_lote_notice_outbox(job_id,jid)
    VALUES($1,$2)
    ON CONFLICT(job_id) DO NOTHING
  `,[jobId,jid])
}

export async function flushRaidLoteNotices({db,sendMessage,isConnected},{max=3}={}){
  if(typeof sendMessage!=='function'||typeof isConnected!=='function')throw new Error('Dependencias de entrega ausentes')
  const summary={sent:0,retry:0,pending:0}
  if(!isConnected())return summary
  for(let n=0;n<Math.min(5,Math.max(1,safeInt(max)));n++){
    if(!isConnected())break
    const claim=await db.query(`
      WITH chosen AS (
        SELECT job_id FROM raid_lote_notice_outbox
        WHERE status IN ('pending','retry','sending')
          AND retry_at<=NOW() AND sent_at IS NULL
        ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE raid_lote_notice_outbox n
      SET status='sending',attempts=attempts+1,retry_at=NOW()+INTERVAL '90 seconds'
      FROM chosen c WHERE n.job_id=c.job_id
      RETURNING n.job_id,n.jid,n.attempts
    `)
    const item=claim.rows[0]
    if(!item)break
    try{
      if(!privateJid(item.jid))throw new Error('Destino sem numero verificado')
      if(!isConnected())throw new Error('Conexao WhatsApp fechada antes da entrega')
      const {rows:jobs}=await db.query(`
        SELECT id,jid,status,level,requested,started,won_count,total_paid
        FROM raid_lote_jobs WHERE id=$1 AND jid=$2
      `,[item.job_id,item.jid])
      const job=jobs[0]
      if(!job||!finishedStatuses.includes(job.status))throw new Error('Pacote final nao localizado')
      const {rows:reports}=await db.query(`
        SELECT seq,status,reward_summary FROM raid_lote_attempts
        WHERE job_id=$1 ORDER BY seq
      `,[item.job_id])
      const report=formatRaidLotePrivateReceipt(job,reports)
      await sendMessage(item.jid,report)
      await db.query(`
        UPDATE raid_lote_notice_outbox
        SET status='sent',sent_at=NOW(),retry_at=NOW(),last_error=''
        WHERE job_id=$1 AND status='sending'
      `,[item.job_id])
      summary.sent++
      console.log('[RAIDLOTE RECIBO] enviado',String(item.job_id).slice(0,8))
    }catch(err){
      const detail=String(err?.message||err).slice(0,160)
      const attempts=safeInt(item.attempts)
      // O erro "Connection Closed" nao e definitivo; reinicio do Render
      // tambem nao faz o recibo desaparecer. Backoff maximo de 30 minutos.
      const seconds=Math.min(1800,15*Math.pow(2,Math.min(7,attempts-1)))
      await db.query(`
        UPDATE raid_lote_notice_outbox
        SET status='retry',retry_at=NOW()+($2::integer*INTERVAL '1 second'),last_error=$3
        WHERE job_id=$1 AND status='sending'
      `,[item.job_id,seconds,detail])
      summary.retry++
      console.warn('[RAIDLOTE RECIBO] envio pendente',String(item.job_id).slice(0,8),detail)
      if(!isConnected())break
    }
  }
  return summary
}

export function createRaidLoteNoticeWorker({db,sendMessage,isConnected}){
  if(!db?.query)throw new Error('Banco obrigatorio')
  let busy=false
  const tickOnce=async()=>{
    if(busy)return {status:'already_running'}
    busy=true
    try{return await flushRaidLoteNotices({db,sendMessage,isConnected})}
    finally{busy=false}
  }
  const start=({intervalMs=8000}={})=>{
    if(!Number.isFinite(intervalMs)||intervalMs<8000)throw new Error('Intervalo minimo 8 segundos')
    const timer=setInterval(()=>{void tickOnce().catch(err=>
      console.error('[RAIDLOTE RECIBO] worker',err?.message||err)
    )},intervalMs)
    timer.unref?.()
    return {stop:()=>clearInterval(timer),tickOnce}
  }
  return Object.freeze({tickOnce,start})
}
