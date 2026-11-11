import {randomUUID} from 'node:crypto'
import {db} from './db.js'
import {getRaidCatalog,createRaid,startRaid,raidRound,getRaidStatus,cancelRaid} from './games.js'
import {RAID_BATCH_POLICY,raidBatchEnabled,validateRaidBatchCount,batchFee,batchChatJid,batchPlan} from './raid-batch-rules.js'

let ticker=null
let working=false
async function transaction(fn){
 const c=await db.connect()
 try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}
 catch(err){await c.query('ROLLBACK');throw err}finally{c.release()}
}
export async function initRaidBatch(){
 if(!raidBatchEnabled())return false
 await db.query(`CREATE TABLE IF NOT EXISTS raid_batch_jobs(
 id BIGSERIAL PRIMARY KEY,jid TEXT NOT NULL,level INTEGER NOT NULL,
 requested_count INTEGER NOT NULL CHECK(requested_count BETWEEN 1 AND 10),
 started_count INTEGER NOT NULL DEFAULT 0,completed_count INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled','paused')),
 cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
 claim_until_ms BIGINT NOT NULL DEFAULT 0,claim_token TEXT,
 notification_attempted BOOLEAN NOT NULL DEFAULT FALSE,
 created_at_ms BIGINT NOT NULL,updated_at_ms BIGINT NOT NULL,last_start_ms BIGINT,last_end_ms BIGINT,
 fee_per_attempt INTEGER NOT NULL,key_price INTEGER NOT NULL,
 total_fee_spend BIGINT NOT NULL DEFAULT 0,total_key_spend BIGINT NOT NULL DEFAULT 0,
 total_cash BIGINT NOT NULL DEFAULT 0,total_xp BIGINT NOT NULL DEFAULT 0,
 total_pet_xp BIGINT NOT NULL DEFAULT 0,total_mastery_xp BIGINT NOT NULL DEFAULT 0,
 total_fragments BIGINT NOT NULL DEFAULT 0,finish_reason TEXT)`)
 await db.query("CREATE UNIQUE INDEX IF NOT EXISTS raid_batch_one_active_per_player ON raid_batch_jobs(jid) WHERE status IN ('queued','running')")
 await db.query(`CREATE TABLE IF NOT EXISTS raid_batch_attempts(
 job_id BIGINT NOT NULL REFERENCES raid_batch_jobs(id),
 ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 10),
 status TEXT NOT NULL CHECK(status IN ('running','won','lost')),
 started_at_ms BIGINT NOT NULL,finished_at_ms BIGINT,
 fee_paid INTEGER NOT NULL,key_price INTEGER NOT NULL,key_bought BOOLEAN NOT NULL DEFAULT FALSE,
 cash BIGINT NOT NULL DEFAULT 0,xp BIGINT NOT NULL DEFAULT 0,
 pet_xp BIGINT NOT NULL DEFAULT 0,mastery_xp BIGINT NOT NULL DEFAULT 0,
 fragments BIGINT NOT NULL DEFAULT 0,reason TEXT,rounds INTEGER,
 PRIMARY KEY(job_id,ordinal))`)
 await db.query("CREATE INDEX IF NOT EXISTS raid_batch_attempts_recent ON raid_batch_attempts(started_at_ms,job_id)")
 await db.query(`CREATE TABLE IF NOT EXISTS raid_batch_treasury(
 job_id BIGINT NOT NULL,ordinal INTEGER NOT NULL,amount BIGINT NOT NULL CHECK(amount>0),
 recorded_at_ms BIGINT NOT NULL,PRIMARY KEY(job_id,ordinal),
 FOREIGN KEY(job_id,ordinal) REFERENCES raid_batch_attempts(job_id,ordinal))`)
 return true
}
export async function queueRaidBatch(jid,level,count){
 if(!raidBatchEnabled())throw new Error('!raidlote está em homologação e ainda não foi ativado.')
 const cfg=getRaidCatalog().find(x=>Number(x.level)===Number(level))
 if(!cfg)throw new Error('Raid inválida. Consulte !raid para verificar os níveis.')
 const quantity=validateRaidBatchCount(count)
 return transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['raid-batch-create:'+jid])
  const active=(await c.query("SELECT id FROM raid_batch_jobs WHERE jid=$1 AND status IN ('queued','running') FOR UPDATE",[jid])).rows[0]
  if(active)throw new Error('Você já possui lote ativo. Use !raidlote status.')
  const wins=(await c.query("SELECT COUNT(*)::int AS total FROM transactions WHERE to_jid=$1 AND type='minigame' AND note=$2",[jid,'raid_'+cfg.level])).rows[0]
  if(Number(wins?.total||0)<RAID_BATCH_POLICY.minimumManualWins)
   throw new Error('Conquiste 3 vitórias manuais na Raid Lv.'+cfg.level+' antes de automatizar.')
  const busy=await c.query(`SELECT 1 FROM trevo_games
   WHERE (game_type='raid' OR game_type LIKE 'raid:%')
   AND state->>'status' IN ('lobby','active')
   AND COALESCE(state->'players','{}'::jsonb) ? $1 LIMIT 1`,[jid])
  if(busy.rowCount)throw new Error('Finalize sua Raid manual antes de programar o lote.')
  const recent=(await c.query(`SELECT COUNT(*)::int AS total FROM raid_batch_attempts a
   JOIN raid_batch_jobs j ON j.id=a.job_id
   WHERE j.jid=$1 AND a.started_at_ms >= $2`,
   [jid,Date.now()-RAID_BATCH_POLICY.rollingWindowMs])).rows[0]
  const available=RAID_BATCH_POLICY.maxPer24h-Number(recent?.total||0)
  if(quantity>available)throw new Error('Disponíveis '+Math.max(0,available)+' tentativas automáticas nas últimas 24 horas.')
  const user=(await c.query('SELECT level FROM users WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(Number(user?.level||0)<Number(cfg.minLevel||cfg.level))throw new Error('Nível insuficiente.')
  const stats=(await c.query('SELECT hp FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(Number(stats?.hp||0)<=0)throw new Error('Cure seu personagem antes de iniciar.')
  const key=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jid,cfg.keyId])).rows[0]
  const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1',[jid])).rows[0]
  const required=batchFee(cfg.keyPrice)+(Number(key?.quantity||0)>0?0:cfg.keyPrice)
  if(Number(wallet?.cash||0)+Number(wallet?.bank||0)<required)
   throw new Error('Saldo insuficiente para a primeira chave e taxa de automação.')
  const now=Date.now()
  const created=await c.query(`INSERT INTO raid_batch_jobs
   (jid,level,requested_count,fee_per_attempt,key_price,created_at_ms,updated_at_ms)
   VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
   [jid,cfg.level,quantity,batchFee(cfg.keyPrice),cfg.keyPrice,now])
  return {id:Number(created.rows[0].id),level:cfg.level,name:cfg.name,
   plan:batchPlan(cfg.keyPrice,quantity,key?.quantity||0)}
 })
}
export async function cancelRaidBatch(jid){
 if(!raidBatchEnabled())throw new Error('!raidlote ainda está em homologação.')
 const {rows}=await db.query(`UPDATE raid_batch_jobs
 SET cancel_requested=TRUE,
 status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
 updated_at_ms=$2,finish_reason='cancelamento_pedido'
 WHERE jid=$1 AND status IN ('queued','running')
 RETURNING id,level,status,started_count,requested_count`,[jid,Date.now()])
 const job=rows[0]||null
 // Se cancelado antes de iniciar, liberar a sala privada sem consumir chave.
 if(job?.status==='cancelled'){
  const chat=batchChatJid(jid)
  const room=await getRaidStatus(chat,job.level).catch(()=>null)
  if(room?.status==='lobby')await cancelRaid(chat,jid,Number(job.level))
    .catch(err=>console.warn('[RaidLote] liberar lobby',String(err?.message||err).slice(0,100)))
 }
 return job
}
export async function raidBatchStatus(jid){
 if(!raidBatchEnabled())throw new Error('!raidlote ainda está em homologação.')
 return (await db.query('SELECT * FROM raid_batch_jobs WHERE jid=$1 ORDER BY id DESC LIMIT 1',[jid])).rows[0]||null
}
export async function raidBatchHistory(jid){
 if(!raidBatchEnabled())throw new Error('!raidlote ainda está em homologação.')
 return (await db.query(`SELECT id,level,status,requested_count,started_count,completed_count,
 total_cash,total_xp,total_pet_xp,total_mastery_xp,total_fragments,total_fee_spend,total_key_spend,finish_reason
 FROM raid_batch_jobs WHERE jid=$1 ORDER BY id DESC LIMIT 8`,[jid])).rows
}
export function formatRaidBatchStatus(job){
 if(!job)return '⚔️ Você ainda não possui lotes. Ex.: !raidlote 75 10'
 const fmt=n=>Number(n||0).toLocaleString('pt-BR')
 const statuses={queued:'⏳ Na fila',running:'⚔️ Em combate',completed:'🏆 Concluído',failed:'💀 Derrota',
  cancelled:'🛑 Cancelado',paused:'⚠️ Interrompido'}
 return [
 '⚔️ *RAIDLOTE #'+job.id+' — Lv.'+job.level+'*',
 statuses[job.status]||job.status+(job.cancel_requested?' • cancelamento solicitado':''),
 'Tentativas: '+fmt(job.started_count)+'/'+fmt(job.requested_count)+' • vitórias: '+fmt(job.completed_count),
 '💰 Dinheiro recebido: R$ '+fmt(job.total_cash)+' • ✨ XP: '+fmt(job.total_xp),
 '💸 Gastos: R$ '+fmt(job.total_fee_spend)+' taxas + R$ '+fmt(job.total_key_spend)+' chaves compradas',
 '🐾 Pet: '+fmt(job.total_pet_xp)+' XP • 🌈 Maestria: '+fmt(job.total_mastery_xp)+' XP',
 '🧩 Fragmentos: '+fmt(job.total_fragments),
 '🔑 Chave normal por tentativa • ⚙️ taxa: R$ '+fmt(job.fee_per_attempt),
 job.finish_reason?'📍 '+String(job.finish_reason).slice(0,130):''
 ].filter(Boolean).join('\n')
}
async function claimJob(){
 const now=Date.now(),token=randomUUID()
 const {rows}=await db.query(`UPDATE raid_batch_jobs SET claim_until_ms=$2,claim_token=$3
 WHERE id=(SELECT id FROM raid_batch_jobs WHERE status IN ('queued','running')
  AND claim_until_ms<$1 ORDER BY created_at_ms LIMIT 1 FOR UPDATE SKIP LOCKED)
  AND claim_until_ms<$1 RETURNING *`,[now,now+45000,token])
 return rows[0]||null
}
async function releaseJob(job){
 await db.query('UPDATE raid_batch_jobs SET claim_until_ms=0,claim_token=NULL WHERE id=$1 AND claim_token=$2',
 [job.id,job.claim_token])
}
async function markPaused(job,reason){
 await db.query(`UPDATE raid_batch_jobs SET status='paused',finish_reason=$2,updated_at_ms=$3
 WHERE id=$1 AND status IN ('queued','running') AND started_count=$4`,
 [job.id,String(reason).slice(0,160),Date.now(),Number(job.started_count)])
}
async function notifyOnce(id,notify){
 if(typeof notify!=='function')return
 const {rows}=await db.query(`UPDATE raid_batch_jobs SET notification_attempted=TRUE
 WHERE id=$1 AND status IN ('completed','failed','cancelled','paused')
 AND notification_attempted=FALSE RETURNING *`,[id])
 if(rows[0])await notify(rows[0].jid,formatRaidBatchStatus(rows[0]))
}
async function advanceJob(job){
 const chat=batchChatJid(job.jid)
 let room=await getRaidStatus(chat,job.level)
 try{
  if(!room){
   if(job.status==='running'){
    await markPaused(job,'Sessão ativa não encontrada. Bloqueio preventivo contra cobrança repetida.')
    return
   }
   const user=(await db.query('SELECT push_name FROM users WHERE jid=$1',[job.jid])).rows[0]
   await createRaid(chat,job.jid,user?.push_name||'Jogador',Number(job.level),{batch:{jobId:Number(job.id)}})
   room=await getRaidStatus(chat,job.level)
  }
  if(!room?.raidBatch||Number(room.raidBatch.jobId)!==Number(job.id))
   throw new Error('Sessão não pertence a este lote.')
  if(room.status==='lobby'){
   if(job.cancel_requested){
    await cancelRaid(chat,job.jid,Number(job.level))
    await db.query("UPDATE raid_batch_jobs SET status='cancelled' WHERE id=$1 AND started_count=0",[job.id])
    return
   }
   await startRaid(chat,job.jid,Number(job.level))
   room=await getRaidStatus(chat,job.level)
  }
  if(room?.status==='active'){
   // Mesmo raidRound do WhatsApp/Web; intervalos, curas, mortes e drops reais.
   await raidRound(chat,Number(job.level))
  }
 }catch(err){
  const message=String(err?.message||err)
  const current=await getRaidStatus(chat,job.level).catch(()=>null)
  if(current?.status==='active'){
   console.warn('[RaidLote] rodada retomável',job.id,message.slice(0,130))
   return
  }
  if(current?.status==='lobby')await cancelRaid(chat,job.jid,Number(job.level)).catch(()=>{})
  await markPaused(job,message)
 }
}
export async function tickRaidBatch(notify){
 if(!raidBatchEnabled()||working)return
 working=true
 try{
  const job=await claimJob()
  if(!job)return
  try{await advanceJob(job)}
  finally{
   await releaseJob(job)
   await notifyOnce(job.id,notify).catch(err=>console.warn('[RaidLote] notificação',String(err?.message||err).slice(0,110)))
  }
 }catch(err){console.error('[RaidLote] runner',String(err?.message||err).slice(0,165))}
 finally{working=false}
}
export function startRaidBatchScheduler(notify){
 if(!raidBatchEnabled()||ticker)return false
 ticker=setInterval(()=>void tickRaidBatch(notify),4000)
 ticker.unref?.()
 void tickRaidBatch(notify)
 return true
}
