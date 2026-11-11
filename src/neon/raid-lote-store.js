import crypto from 'node:crypto'
import {raidLoteQuote,RAID_LOTE_V1} from './raid-lote-policy.js'

// RAIDLOTE V1 — persistencia transacional em TESTE. Nao importar para ativar.
// Nenhuma operacao acontece no import; nunca chamar init em producao antes da homologacao.
const openStatuses=['queued','running']
const isPositiveInt=n=>Number.isSafeInteger(n)&&n>0
const validateRequestKey=key=>{
  if(typeof key!=='string'||key.length<8||key.length>160||!/^[-.\w:]+$/.test(key))
    throw new Error('Identificador de compra invalido')
  return key
}
export function raidLoteRoomId(attemptId){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(attemptId)))
    throw new Error('Identificador de tentativa invalido')
  return '__alpha_raid_lote__:'+attemptId
}
async function inTransaction(db,fn){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    const value=await fn(c)
    await c.query('COMMIT')
    return value
  }catch(error){
    try{await c.query('ROLLBACK')}catch{}
    throw error
  }finally{c.release()}
}
// Migration explicitamente invocada SOMENTE em TESTE.
// Sem job automatico; nenhum valor e transferido por init.
export async function initRaidLoteStore(db){
  await db.query(`
    CREATE TABLE IF NOT EXISTS raid_lote_jobs(
      id UUID PRIMARY KEY,
      jid TEXT NOT NULL,
      request_key TEXT NOT NULL,
      level INTEGER NOT NULL,
      requested INTEGER NOT NULL CHECK (requested BETWEEN 1 AND 10),
      started INTEGER NOT NULL DEFAULT 0 CHECK(started BETWEEN 0 AND 10),
      won_count INTEGER NOT NULL DEFAULT 0 CHECK(won_count BETWEEN 0 AND 10),
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK(status IN ('queued','running','won','lost','cancelled','failed')),
      cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
      current_attempt_id UUID,
      key_price BIGINT NOT NULL CHECK(key_price>=0),
      keys_total BIGINT NOT NULL CHECK(keys_total>=0),
      fee_total BIGINT NOT NULL CHECK(fee_total>=0),
      total_paid BIGINT NOT NULL CHECK(total_paid>=0),
      cash_paid BIGINT NOT NULL CHECK(cash_paid>=0),
      bank_paid BIGINT NOT NULL CHECK(bank_paid>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      UNIQUE(jid,request_key)
    )
  `)
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS raid_lote_one_open_job_per_player
    ON raid_lote_jobs(jid) WHERE status IN ('queued','running')
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS raid_lote_purchase_window
    ON raid_lote_jobs(jid,created_at DESC)
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS raid_lote_attempts(
      id UUID PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES raid_lote_jobs(id),
      seq INTEGER NOT NULL CHECK(seq BETWEEN 1 AND 10),
      raid_chat TEXT NOT NULL UNIQUE,
      level INTEGER NOT NULL,
      raid_started_at_ms BIGINT,
      status TEXT NOT NULL DEFAULT 'reserved'
        CHECK(status IN ('reserved','active','won','lost')),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      UNIQUE(job_id,seq)
    )
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS raid_lote_municipality(
      id SMALLINT PRIMARY KEY CHECK(id=1),
      balance BIGINT NOT NULL DEFAULT 0 CHECK(balance>=0)
    )
  `)
  await db.query("INSERT INTO raid_lote_municipality(id,balance) VALUES(1,0) ON CONFLICT(id) DO NOTHING")
}
export async function purchaseRaidLote(db,{jid,level,attempts,requestKey,confirmed},{getCatalog}={}){
  if(!jid||typeof jid!=='string')throw new Error('Jogador invalido')
  validateRequestKey(requestKey)
  if(confirmed!==true)throw new Error('Compra requer confirmacao explicita')
  if(typeof getCatalog!=='function')throw new Error('Catalogo de Raids obrigatorio')
  const catalog=await getCatalog()
  const cfg=catalog.find(r=>Number(r.level)===Number(level))
  if(!cfg)throw new Error('Raid indisponivel para compra')
  const quote=raidLoteQuote(cfg.keyPrice,attempts)
  return inTransaction(db,async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+jid])
    const prior=(await c.query(
      'SELECT * FROM raid_lote_jobs WHERE jid=$1 AND request_key=$2 FOR UPDATE',
      [jid,requestKey]
    )).rows[0]
    // Replay da mesma mensagem NAO gasta novamente, ainda que a luta ja tenha terminado.
    if(prior)return {job:prior,quote,alreadyPurchased:true}
    const active=(await c.query(
      "SELECT 1 FROM raid_lote_jobs WHERE jid=$1 AND status=ANY($2::text[]) FOR UPDATE",
      [jid,openStatuses]
    )).rows[0]
    if(active)throw new Error('Ja existe pacote de Raid em andamento')
    const last24h=(await c.query(`
      SELECT COALESCE(SUM(requested),0)::bigint AS purchased
      FROM raid_lote_jobs WHERE jid=$1 AND created_at>NOW()-INTERVAL '24 hours'
    `,[jid])).rows[0]
    if(Number(last24h?.purchased||0)+quote.attempts>RAID_LOTE_V1.maxAttempts)
      throw new Error('Limite de 10 tentativas compradas em 24 horas')
    const publicRaid=(await c.query(`
      SELECT 1 FROM trevo_games
      WHERE (game_type='raid' OR game_type LIKE 'raid:%')
        AND state->>'status' IN ('lobby','active')
        AND COALESCE(state->'players','{}'::jsonb) ? $1
      LIMIT 1
    `,[jid])).rows[0]
    if(publicRaid)throw new Error('Finalize a Raid em andamento antes de comprar o pacote')
    const u=(await c.query('SELECT level FROM users WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!u||Number(u.level)<Number(cfg.minLevel||cfg.level))throw new Error('Nivel insuficiente para a Raid')
    const hp=(await c.query('SELECT hp FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(hp?.hp||0)<=0)throw new Error('Cure seu personagem antes da compra')
    // As vitorias anteriores em raids manuais registram o premio como minigame/raid_N.
    // A futura recompensa do lote deve usar OUTRA origem e nunca contar como manual.
    const wins=(await c.query(`
      SELECT COUNT(*)::int AS n FROM transactions
      WHERE to_jid=$1 AND type='minigame' AND note=$2
    `,[jid,'raid_'+cfg.level])).rows[0]
    if(Number(wins?.n||0)<RAID_LOTE_V1.minimumManualWins)
      throw new Error('Necessarias 3 vitorias manuais anteriores nesta Raid')
    const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const cash=Number(wallet?.cash||0),bank=Number(wallet?.bank||0)
    if(!Number.isSafeInteger(cash)||!Number.isSafeInteger(bank)||cash<0||bank<0)
      throw new Error('Saldo inconsistente; compra bloqueada')
    if(cash+bank<quote.totalPrice)
      throw new Error('Saldo insuficiente para pagar o pacote integral')
    const fromCash=Math.min(cash,quote.totalPrice)
    const fromBank=quote.totalPrice-fromCash
    const id=crypto.randomUUID()
    await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2 WHERE jid=$3',[fromCash,fromBank,jid])
    await c.query(`
      INSERT INTO raid_lote_jobs(
        id,jid,request_key,level,requested,key_price,keys_total,fee_total,
        total_paid,cash_paid,bank_paid
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,[id,jid,requestKey,cfg.level,quote.attempts,quote.keyPrice,quote.keysTotal,
      quote.serviceTotal,quote.totalPrice,fromCash,fromBank])
    // Credito da taxa na Prefeitura na MESMA transacao do pagamento.
    await c.query('UPDATE raid_lote_municipality SET balance=balance+$1 WHERE id=1',[quote.serviceTotal])
    await c.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES
        ($1,'raid_shop',$2,'raid_lote_keys',$4),
        ($1,'alpha_prefeitura',$3,'raid_lote_service',$4)
    `,[jid,quote.keysTotal,quote.serviceTotal,'Pacote Raid Lv.'+cfg.level+' #'+id])
    return {job:{id,jid,level:cfg.level,requested:quote.attempts,started:0,won_count:0,status:'queued'},quote,alreadyPurchased:false}
  })
}
export async function getRaidLoteJob(db,jid){
  const {rows}=await db.query(`
    SELECT id,level,requested,started,won_count,status,cancel_requested,
      current_attempt_id,keys_total,fee_total,total_paid,created_at,updated_at,finished_at
    FROM raid_lote_jobs WHERE jid=$1 ORDER BY created_at DESC LIMIT 1
  `,[jid])
  return rows[0]||null
}
export async function getRaidLoteHistory(db,jid,limit=5){
  const n=Math.max(1,Math.min(10,Math.floor(Number(limit)||5)))
  const {rows}=await db.query(`
    SELECT id,level,requested,started,won_count,status,keys_total,fee_total,total_paid,created_at,finished_at
    FROM raid_lote_jobs WHERE jid=$1 ORDER BY created_at DESC LIMIT $2
  `,[jid,n])
  return rows
}
export async function cancelRaidLote(db,jid){
  return inTransaction(db,async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+jid])
    const {rows}=await c.query(`
      UPDATE raid_lote_jobs SET cancel_requested=TRUE,updated_at=NOW(),
        status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
        finished_at=CASE WHEN status='queued' THEN NOW() ELSE finished_at END
      WHERE jid=$1 AND status IN ('queued','running')
      RETURNING id,status,current_attempt_id,total_paid
    `,[jid])
    // Intencional: NAO reembolsa pacote, mesmo com tentativas nao usadas.
    return rows[0]||null
  })
}
export async function reserveNextRaidLoteAttempt(db,jobId){
  return inTransaction(db,async c=>{
    const {rows}=await c.query('SELECT * FROM raid_lote_jobs WHERE id=$1 FOR UPDATE',[jobId])
    const job=rows[0]
    if(!job||!openStatuses.includes(job.status))return {status:'inactive'}
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+job.jid])
    if(job.current_attempt_id){
      const {rows:existing}=await c.query('SELECT * FROM raid_lote_attempts WHERE id=$1 FOR UPDATE',[job.current_attempt_id])
      if(existing[0]&&!['won','lost'].includes(existing[0].status))return {status:'resume',attempt:existing[0],job}
      throw new Error('Tentativa vinculada inconsistente; reconciliar antes de prosseguir')
    }
    if(job.cancel_requested){
      await c.query("UPDATE raid_lote_jobs SET status='cancelled',finished_at=NOW(),updated_at=NOW() WHERE id=$1",[jobId])
      return {status:'cancelled'}
    }
    if(job.started>=job.requested){
      return {status:'exhausted'}
    }
    // Nao permite iniciar uma nova tentativa enquanto houver Raid ativa do mesmo jogador.
    const busy=(await c.query(`
      SELECT 1 FROM trevo_games WHERE (game_type='raid' OR game_type LIKE 'raid:%')
      AND state->>'status' IN ('lobby','active')
      AND COALESCE(state->'players','{}'::jsonb) ? $1 LIMIT 1
    `,[job.jid])).rows[0]
    if(busy)return {status:'player_busy'}
    const id=crypto.randomUUID(),seq=Number(job.started)+1
    const raidChat=raidLoteRoomId(id)
    await c.query(`
      INSERT INTO raid_lote_attempts(id,job_id,seq,raid_chat,level)
      VALUES($1,$2,$3,$4,$5)
    `,[id,jobId,seq,raidChat,job.level])
    await c.query(`
      UPDATE raid_lote_jobs SET started=$2,status='running',current_attempt_id=$3,updated_at=NOW()
      WHERE id=$1
    `,[jobId,seq,id])
    return {status:'reserved',attempt:{id,job_id:jobId,seq,raid_chat:raidChat,level:job.level},job}
  })
}
export async function attachRaidLoteAttempt(db,attemptId,startedAtMs){
  if(!isPositiveInt(startedAtMs))throw new Error('Horario de inicio invalido')
  return inTransaction(db,async c=>{
    const attempt=(await c.query('SELECT * FROM raid_lote_attempts WHERE id=$1 FOR UPDATE',[attemptId])).rows[0]
    if(!attempt)throw new Error('Tentativa nao encontrada')
    if(attempt.raid_started_at_ms!==null){
      if(Number(attempt.raid_started_at_ms)!==startedAtMs)throw new Error('Tentativa aponta para outro combate')
      return attempt
    }
    const raid=(await c.query('SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2 FOR UPDATE',
      [attempt.raid_chat,'raid:'+attempt.level])).rows[0]?.state
    if(!raid||Number(raid.startedAt)!==startedAtMs||raid.status!=='active')
      throw new Error('Combate nao coincide com a tentativa reservada')
    await c.query("UPDATE raid_lote_attempts SET raid_started_at_ms=$2,status='active' WHERE id=$1",[attemptId,startedAtMs])
    return {...attempt,raid_started_at_ms:startedAtMs,status:'active'}
  })
}
export async function settleRaidLoteAttempt(db,attemptId){
  return inTransaction(db,async c=>{
    const attempt=(await c.query('SELECT * FROM raid_lote_attempts WHERE id=$1 FOR UPDATE',[attemptId])).rows[0]
    if(!attempt)throw new Error('Tentativa nao encontrada')
    if(attempt.status==='won'||attempt.status==='lost')return {status:'already_settled',result:attempt.status}
    if(!attempt.raid_started_at_ms)return {status:'waiting_for_combat'}
    const raid=(await c.query('SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2 FOR UPDATE',
      [attempt.raid_chat,'raid:'+attempt.level])).rows[0]?.state
    if(!raid||Number(raid.startedAt)!==Number(attempt.raid_started_at_ms))
      throw new Error('Estado de combate ausente ou divergiu; nao consumir nova tentativa')
    if(!['completed','failed'].includes(raid.status))return {status:'in_progress'}
    const job=(await c.query('SELECT * FROM raid_lote_jobs WHERE id=$1 FOR UPDATE',[attempt.job_id])).rows[0]
    if(!job||String(job.current_attempt_id)!==String(attempt.id))
      throw new Error('Job aponta para outra tentativa; bloquear acerto')
    const won=raid.status==='completed'
    const finishedStatus=won?'won':'lost'
    await c.query('UPDATE raid_lote_attempts SET status=$2,finished_at=NOW() WHERE id=$1',[attemptId,finishedStatus])
    const newWins=Number(job.won_count)+(won?1:0)
    const jobStatus=job.cancel_requested?'cancelled':(!won?'lost':newWins>=Number(job.requested)?'won':'running')
    await c.query(`
      UPDATE raid_lote_jobs SET won_count=$2,current_attempt_id=NULL,status=$3,
        updated_at=NOW(),finished_at=CASE WHEN $3 IN ('won','lost','cancelled') THEN NOW() ELSE finished_at END
      WHERE id=$1
    `,[job.id,newWins,jobStatus])
    // Jamais realizar estorno: as tentativas nao iniciadas estavam quitadas no pacote.
    return {status:finishedStatus,jobStatus,wins:newWins,started:Number(job.started),paid:Number(job.total_paid)}
  })
}
