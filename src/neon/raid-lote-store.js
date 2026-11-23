import crypto from 'node:crypto'
import {raidLoteQuote,RAID_LOTE_V1,raidLoteDurationPlan,raidLoteWaitsForSchedule,RAID_LOTE_V2_INTERVAL_MINUTES,RAID_LOTE_V2_MAX_ATTEMPTS} from './raid-lote-policy.js'
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
import {assertRaid70V2Start} from './reboot-economy-policy.js'
import {initRaidLoteNoticeOutbox,enqueueRaidLoteNotice} from './raid-lote-notice-outbox.js'

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
      requested INTEGER NOT NULL CHECK (requested BETWEEN 1 AND 1000000),
      started INTEGER NOT NULL DEFAULT 0 CHECK(started BETWEEN 0 AND 1000000),
      won_count INTEGER NOT NULL DEFAULT 0 CHECK(won_count BETWEEN 0 AND 1000000),
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK(status IN ('queued','running','won','lost','cancelled','failed','completed','funds_exhausted')),
      cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
      current_attempt_id UUID,
      key_price BIGINT NOT NULL CHECK(key_price>=0),
      keys_total BIGINT NOT NULL CHECK(keys_total>=0),
      fee_total BIGINT NOT NULL CHECK(fee_total>=0),
      total_paid BIGINT NOT NULL CHECK(total_paid>=0),
      owned_keys_spent INTEGER NOT NULL DEFAULT 0 CHECK(owned_keys_spent BETWEEN 0 AND 1000000),
      keys_bought INTEGER NOT NULL DEFAULT 0 CHECK(keys_bought BETWEEN 0 AND 1000000),
      cash_paid BIGINT NOT NULL CHECK(cash_paid>=0),
      bank_paid BIGINT NOT NULL CHECK(bank_paid>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      lease_token TEXT,
      lease_until TIMESTAMPTZ,
      auction_pass_manual_rewards BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(jid,request_key)
    )
  `)
  await db.query("ALTER TABLE raid_lote_jobs ADD COLUMN IF NOT EXISTS lease_token TEXT")
  await db.query("ALTER TABLE raid_lote_jobs ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ")
  await db.query("ALTER TABLE raid_lote_jobs ADD COLUMN IF NOT EXISTS auction_pass_manual_rewards BOOLEAN NOT NULL DEFAULT FALSE")
  await db.query("ALTER TABLE raid_lote_jobs ADD COLUMN IF NOT EXISTS duration_hours SMALLINT CHECK (duration_hours IN (4,8,12))")
  await db.query("ALTER TABLE raid_lote_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ")
  await db.query("ALTER TABLE raid_lote_jobs ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'prepaid'")
  await db.query("ALTER TABLE raid_lote_jobs ADD COLUMN IF NOT EXISTS session_ends_at TIMESTAMPTZ")
  // Só migra constraints quando ainda estiverem na versão antiga.
  // Evita DROP/ADD e locks desnecessários a cada boot.
  async function ensureCheck(table,name,expression,marker){
    const {rows}=await db.query(
      'SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2',
      [table,name])
    if(rows[0]?.definition?.includes(marker))return
    if(rows.length)await db.query('ALTER TABLE '+table+' DROP CONSTRAINT '+name)
    await db.query('ALTER TABLE '+table+' ADD CONSTRAINT '+name+' CHECK ('+expression+')')
  }
  for(const col of ['requested','started','won_count','owned_keys_spent','keys_bought']){
    await ensureCheck('raid_lote_jobs','raid_lote_jobs_'+col+'_check',
      col+(col==='requested'?' BETWEEN 1 AND 1000000':' BETWEEN 0 AND 1000000'),'1000000')
  }
  await ensureCheck('raid_lote_jobs','raid_lote_jobs_status_check',
    "status IN ('queued','running','won','lost','cancelled','failed','completed','funds_exhausted')",
    'funds_exhausted')
  await ensureCheck('raid_lote_jobs','raid_lote_jobs_billing_mode_check',
    "billing_mode IN ('prepaid','per_attempt')",'per_attempt')
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
      seq INTEGER NOT NULL CHECK(seq BETWEEN 1 AND 1000000),
      raid_chat TEXT NOT NULL UNIQUE,
      level INTEGER NOT NULL,
      raid_started_at_ms BIGINT,
      status TEXT NOT NULL DEFAULT 'reserved'
        CHECK(status IN ('reserved','active','won','lost')),
      reward_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      UNIQUE(job_id,seq)
    )
  `)
  await db.query("ALTER TABLE raid_lote_attempts ADD COLUMN IF NOT EXISTS reward_summary JSONB NOT NULL DEFAULT '{}'::jsonb")
  await ensureCheck('raid_lote_attempts','raid_lote_attempts_seq_check','seq BETWEEN 1 AND 1000000','1000000')
  await db.query(`
    CREATE TABLE IF NOT EXISTS raid_lote_municipality(
      id SMALLINT PRIMARY KEY CHECK(id=1),
      balance BIGINT NOT NULL DEFAULT 0 CHECK(balance>=0)
    )
  `)
  await db.query("INSERT INTO raid_lote_municipality(id,balance) VALUES(1,0) ON CONFLICT(id) DO NOTHING")
  await initRaidLoteNoticeOutbox(db)
}
export async function purchaseRaidLote(db,{jid,level,attempts,durationHours=null,requestKey,confirmed},{getCatalog}={}){
  if(!jid||typeof jid!=='string')throw new Error('Jogador invalido')
  validateRequestKey(requestKey)
  if(confirmed!==true)throw new Error('Compra requer confirmacao explicita')
  if(typeof getCatalog!=='function')throw new Error('Catalogo de Raids obrigatorio')
  const catalog=await getCatalog()
  const cfg=catalog.find(r=>Number(r.level)===Number(level))
  if(!cfg)throw new Error('Raid indisponivel para compra')
  // Não cobrar pacote que não pode iniciar uma Raid cooperativa.
  assertRaid70V2Start({level:cfg.level,partySize:1,mode:'lote'})
  const v2=classesOnlyRebootEnabled()
  const plan=v2?raidLoteDurationPlan(durationHours):null
  if(v2)throw new Error('RaidLote 2.0 usa sessões contínuas; utilize startTimedRaidLoteSession')
  if(!v2&&durationHours!=null)throw new Error('Pacote por horas disponível somente na V2')
  const initialQuote=raidLoteQuote(cfg.keyPrice,attempts)
  return inTransaction(db,async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+jid])
    const prior=(await c.query(
      'SELECT * FROM raid_lote_jobs WHERE jid=$1 AND request_key=$2 FOR UPDATE',
      [jid,requestKey]
    )).rows[0]
    // Replay da mesma mensagem NAO gasta novamente, ainda que a luta ja tenha terminado.
    if(prior){
      if(Number(prior.level)!==Number(cfg.level)||Number(prior.requested)!==initialQuote.attempts||Number(prior.duration_hours||0)!==Number(plan?.hours||0))
        throw new Error('Repeticao de pedido com nivel ou quantidade divergente')
      const originalQuote={
        attempts:Number(prior.requested),keyPrice:Number(prior.key_price),
        ownedKeysUsed:Number(prior.owned_keys_spent),keysToBuy:Number(prior.keys_bought),
        keysTotal:Number(prior.keys_total),serviceTotal:Number(prior.fee_total),
        totalPrice:Number(prior.total_paid),
        fullPackageValue:Number(prior.key_price)*Number(prior.requested)+Number(prior.fee_total),
        prepaid:true,refundable:false
      }
      return {job:prior,quote:originalQuote,alreadyPurchased:true}
    }
    // Exclusao mutua com Carpinar: o mesmo advisory lock e usado ao
    // iniciar trabalho AFK; a validacao no banco impede corridas entre comandos.
    const carpinar=(await c.query(
      "SELECT 1 FROM player_carpinar WHERE jid=$1 AND ends_at>EXTRACT(EPOCH FROM NOW())::BIGINT LIMIT 1",
      [jid]
    )).rows[0]
    if(carpinar)throw new Error('🌾 Você está carpindo. Termine a jornada antes de ativar o Raidlote.')
    const active=(await c.query(
      "SELECT 1 FROM raid_lote_jobs WHERE jid=$1 AND status=ANY($2::text[]) FOR UPDATE",
      [jid,openStatuses]
    )).rows[0]
    if(active)throw new Error('Ja existe pacote de Raid em andamento')
    // Só os três pacotes vinculados ao Passe Supremo têm recompensas-base
    // de Raid manual. O modo é fixado na compra e não muda após expiração.
    const pass=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',
      ['auction_raid_lote_pass_20261115:'+jid])).rows[0]?.value
    const passActive=!v2&&Number(pass?.activatedAt)>0&&Number(pass?.expiresAt)>Date.now()&&
      Number(pass?.maxPackages)===3
    let usedPassPackages=0
    if(passActive){
      const used=(await c.query(
        'SELECT COUNT(*)::int AS n FROM raid_lote_jobs WHERE jid=$1 AND created_at>=to_timestamp($2/1000.0) AND created_at<to_timestamp($3/1000.0)',
        [jid,pass.activatedAt,pass.expiresAt]
      )).rows[0]
      usedPassPackages=Number(used?.n||0)
    }
    // Pacotes já comprados sob a versão anterior ocupam vaga no passe,
    // sem pagamentos retroativos nem concessão de um quarto pacote especial.
    const auctionPassManualRewards=passActive&&usedPassPackages<3
    // Renova as 00:00 de Brasilia, nao 24h apos a compra anterior.
    // Calcula o inicio do dia no fuso do jogo antes de comparar TIMESTAMPTZ;
    // o limite vale para todos os pacotes comprados na mesma data local.
    const today=(await c.query(`
      SELECT COALESCE(SUM(requested),0)::bigint AS purchased
      FROM raid_lote_jobs
      WHERE jid=$1
        AND created_at >= ((NOW() AT TIME ZONE $2::text)::date::timestamp AT TIME ZONE $2::text)
        AND billing_mode='prepaid'
    `,[jid,RAID_LOTE_V1.dailyResetTimeZone])).rows[0]
    if(!auctionPassManualRewards&&Number(today?.purchased||0)+initialQuote.attempts>RAID_LOTE_V1.maxAttempts)
      throw new Error('Limite de 10 tentativas por dia. Renova as 00:00 (horario de Brasilia).')
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
    // Chaves existentes sao consumidas NA COMPRA, e jamais cobradas de novo.
    const inventory=(await c.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',
      [jid,cfg.keyId]
    )).rows[0]
    const ownedKeys=Number(inventory?.quantity||0)
    const quote=raidLoteQuote(cfg.keyPrice,attempts,ownedKeys)
    const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const cash=Number(wallet?.cash||0),bank=Number(wallet?.bank||0)
    if(!Number.isSafeInteger(cash)||!Number.isSafeInteger(bank)||cash<0||bank<0)
      throw new Error('Saldo inconsistente; compra bloqueada')
    if(cash+bank<quote.totalPrice)
      throw new Error('Saldo insuficiente para pagar o pacote integral')
    const fromCash=Math.min(cash,quote.totalPrice)
    const fromBank=quote.totalPrice-fromCash
    const id=crypto.randomUUID()
    if(quote.ownedKeysUsed>0){
      const spent=await c.query(
        'UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3 AND quantity >= $1 RETURNING quantity',
        [quote.ownedKeysUsed,jid,cfg.keyId]
      )
      if(spent.rowCount!==1)throw new Error('Chaves mudaram durante a compra; tente novamente')
    }
    await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2 WHERE jid=$3',[fromCash,fromBank,jid])
    await c.query(`
      INSERT INTO raid_lote_jobs(
        id,jid,request_key,level,requested,key_price,keys_total,fee_total,
        total_paid,cash_paid,bank_paid,owned_keys_spent,keys_bought,
        auction_pass_manual_rewards,duration_hours,next_attempt_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        CASE WHEN $15::smallint IS NULL THEN NULL ELSE NOW()+($16::integer*INTERVAL '1 minute') END)
    `,[id,jid,requestKey,cfg.level,quote.attempts,quote.keyPrice,quote.keysTotal,
      quote.serviceTotal,quote.totalPrice,fromCash,fromBank,quote.ownedKeysUsed,quote.keysToBuy,auctionPassManualRewards,plan?.hours??null,RAID_LOTE_V2_INTERVAL_MINUTES])
    // Credito da taxa na Prefeitura na MESMA transacao do pagamento.
    await c.query('UPDATE raid_lote_municipality SET balance=balance+$1 WHERE id=1',[quote.serviceTotal])
    await c.query(`
      INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES
        ($1,'raid_shop',$2,'raid_lote_keys',$4),
        ($1,'alpha_prefeitura',$3,'raid_lote_service',$4)
    `,[jid,quote.keysTotal,quote.serviceTotal,'Pacote Raid Lv.'+cfg.level+' #'+id+' (chaves proprias '+quote.ownedKeysUsed+')'])
    return {job:{id,jid,level:cfg.level,requested:quote.attempts,started:0,won_count:0,status:'queued',auction_pass_manual_rewards:auctionPassManualRewards,duration_hours:plan?.hours??null},quote,alreadyPurchased:false}
  })
}

// V2: sessões de tempo, sem compra antecipada ou quantidade fixa.
// A primeira cobrança é feita pelo worker na reserva da primeira tentativa.
export async function startTimedRaidLoteSession(db,{jid,level,durationHours,requestKey,confirmed},{getCatalog}={}){
  if(!jid||typeof jid!=='string')throw new Error('Jogador inválido')
  validateRequestKey(requestKey)
  if(confirmed!==true)throw new Error('Ativação requer confirmação explícita')
  if(!classesOnlyRebootEnabled())throw new Error('Sessões contínuas exigem Alpha Bot 2.0')
  if(typeof getCatalog!=='function')throw new Error('Catálogo de Raids obrigatório')
  const plan=raidLoteDurationPlan(durationHours)
  const cfg=(await getCatalog()).find(r=>Number(r.level)===Number(level))
  if(!cfg)throw new Error('Raid indisponível')
  assertRaid70V2Start({level:cfg.level,partySize:1,mode:'lote'})
  return inTransaction(db,async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+jid])
    const old=(await c.query('SELECT * FROM raid_lote_jobs WHERE jid=$1 AND request_key=$2 FOR UPDATE',[jid,requestKey])).rows[0]
    if(old){
      if(old.billing_mode!=='per_attempt'||Number(old.level)!==Number(cfg.level)||Number(old.duration_hours)!==plan.hours)
        throw new Error('Confirmação repetida com parâmetros divergentes')
      return {job:old,alreadyPurchased:true,firstPrice:null}
    }
    // Exclusao mutua com Carpinar: o mesmo advisory lock e usado ao
    // iniciar trabalho AFK; a validacao no banco impede corridas entre comandos.
    const carpinar=(await c.query(
      "SELECT 1 FROM player_carpinar WHERE jid=$1 AND ends_at>EXTRACT(EPOCH FROM NOW())::BIGINT LIMIT 1",
      [jid]
    )).rows[0]
    if(carpinar)throw new Error('🌾 Você está carpindo. Termine a jornada antes de ativar o Raidlote.')
    const active=(await c.query("SELECT 1 FROM raid_lote_jobs WHERE jid=$1 AND status IN ('queued','running') FOR UPDATE",[jid])).rows[0]
    if(active)throw new Error('Já existe Raidlote em andamento')
    const busy=(await c.query("SELECT 1 FROM trevo_games WHERE (game_type='raid' OR game_type LIKE 'raid:%') AND state->>'status' IN ('lobby','active') AND COALESCE(state->'players','{}'::jsonb) ? $1 LIMIT 1",[jid])).rows[0]
    if(busy)throw new Error('Finalize a Raid atual antes de ativar o automático')
    const user=(await c.query('SELECT level FROM users WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!user||Number(user.level)<Number(cfg.minLevel||cfg.level))throw new Error('Nível insuficiente')
    const hp=(await c.query('SELECT hp FROM stats WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(Number(hp?.hp||0)<=0)throw new Error('Cure o personagem antes de ativar')
    const wins=(await c.query("SELECT COUNT(*)::int AS n FROM transactions WHERE to_jid=$1 AND type='minigame' AND note=$2",[jid,'raid_'+cfg.level])).rows[0]
    if(Number(wins?.n||0)<RAID_LOTE_V1.minimumManualWins)
      throw new Error('Necessárias 3 vitórias manuais anteriores nesta Raid')
    const inventory=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,cfg.keyId])).rows[0]
    const quote=raidLoteQuote(cfg.keyPrice,1,Number(inventory?.quantity||0))
    const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!wallet||Number(wallet.cash)+Number(wallet.bank)<quote.totalPrice)
      throw new Error('Saldo insuficiente para a primeira Raid, incluindo taxa de automação')
    const id=crypto.randomUUID()
    await c.query(`
      INSERT INTO raid_lote_jobs(id,jid,request_key,level,requested,key_price,
        keys_total,fee_total,total_paid,cash_paid,bank_paid,
        duration_hours,billing_mode,session_ends_at,next_attempt_at)
      VALUES($1,$2,$3,$4,$5,$6,0,0,0,0,0,$7::smallint,'per_attempt',
        NOW()+($7::smallint*INTERVAL '1 hour'),NOW())
    `,[id,jid,requestKey,cfg.level,RAID_LOTE_V2_MAX_ATTEMPTS,cfg.keyPrice,plan.hours])
    return {job:{id,jid,level:cfg.level,requested:RAID_LOTE_V2_MAX_ATTEMPTS,started:0,won_count:0,
      status:'queued',billing_mode:'per_attempt',duration_hours:plan.hours},
      firstPrice:quote,alreadyPurchased:false}
  })
}

export async function getRaidLoteJob(db,jid){
  const {rows}=await db.query(`
    SELECT id,level,requested,started,won_count,status,cancel_requested,
      current_attempt_id,keys_total,fee_total,total_paid,owned_keys_spent,keys_bought,auction_pass_manual_rewards,duration_hours,next_attempt_at,billing_mode,session_ends_at,created_at,updated_at,finished_at
    FROM raid_lote_jobs WHERE jid=$1 ORDER BY created_at DESC LIMIT 1
  `,[jid])
  return rows[0]||null
}
export async function getRaidLoteAttemptReports(db,jid,jobId){
  const {rows}=await db.query(`
    SELECT a.seq,a.status,a.reward_summary,a.started_at,a.finished_at
    FROM raid_lote_attempts a JOIN raid_lote_jobs j ON j.id=a.job_id
    WHERE a.job_id=$1 AND j.jid=$2 ORDER BY a.seq
  `,[jobId,jid])
  return rows
}
export async function getRaidLoteHistory(db,jid,limit=5){
  const n=Math.max(1,Math.min(10,Math.floor(Number(limit)||5)))
  const {rows}=await db.query(`
    SELECT id,level,requested,started,won_count,status,keys_total,fee_total,total_paid,owned_keys_spent,keys_bought,auction_pass_manual_rewards,duration_hours,next_attempt_at,billing_mode,session_ends_at,created_at,finished_at
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
export async function reserveNextRaidLoteAttempt(db,jobId,{getCatalog}={}){
  return inTransaction(db,async c=>{
    const info=(await c.query('SELECT jid FROM raid_lote_jobs WHERE id=$1',[jobId])).rows[0]
    if(!info)return {status:'inactive'}
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+info.jid])
    const job=(await c.query('SELECT * FROM raid_lote_jobs WHERE id=$1 FOR UPDATE',[jobId])).rows[0]
    if(!job||!openStatuses.includes(job.status))return {status:'inactive'}
    if(job.current_attempt_id){
      const {rows:existing}=await c.query('SELECT * FROM raid_lote_attempts WHERE id=$1 FOR UPDATE',[job.current_attempt_id])
      if(existing[0]&&!['won','lost'].includes(existing[0].status))return {status:'resume',attempt:existing[0],job}
      throw new Error('Tentativa vinculada inconsistente; reconciliar antes de prosseguir')
    }
    if(job.cancel_requested){
      await c.query("UPDATE raid_lote_jobs SET status='cancelled',finished_at=NOW(),updated_at=NOW() WHERE id=$1",[jobId])
      return {status:'cancelled'}
    }
    const continuous=job.billing_mode==='per_attempt'
    if(continuous&&(!job.session_ends_at||new Date(job.session_ends_at).getTime()<=Date.now())){
      await c.query("UPDATE raid_lote_jobs SET status='completed',finished_at=NOW(),updated_at=NOW() WHERE id=$1",[jobId])
      await enqueueRaidLoteNotice(c,job.id,job.jid)
      return {status:'expired'}
    }
    if(job.started>=job.requested){
      return {status:'exhausted'}
    }
    // Não reservar nem escrever enquanto a próxima tentativa programada não venceu.
    if(raidLoteWaitsForSchedule(job))return {status:'waiting_schedule'}
    // Nao permite iniciar uma nova tentativa enquanto houver Raid ativa do mesmo jogador.
    const busy=(await c.query(`
      SELECT 1 FROM trevo_games WHERE (game_type='raid' OR game_type LIKE 'raid:%')
      AND state->>'status' IN ('lobby','active')
      AND COALESCE(state->'players','{}'::jsonb) ? $1 LIMIT 1
    `,[job.jid])).rows[0]
    if(busy)return {status:'player_busy'}
    const id=crypto.randomUUID(),seq=Number(job.started)+1
    if(continuous){
      // Cobrança exatamente uma vez, na MESMA transação que reserva a tentativa.
      // Chave já possuída é consumida; saldo paga a chave quando necessário,
      // mais 10% de serviço em cada tentativa. Sem fundos, encerra sem nova luta.
      if(typeof getCatalog!=='function')throw new Error('Catálogo de Raids não fornecido; sem débito')
      // O preço da chave é persistido na ativação, mas o ID vem do catálogo.
      const cfg=getCatalog().find(r=>Number(r.level)===Number(job.level))
      if(!cfg?.keyId)throw new Error('Catálogo de chave indisponível; sem débito')
      const owned=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[job.jid,cfg.keyId])).rows[0]
      const quote=raidLoteQuote(Number(job.key_price),1,Number(owned?.quantity||0))
      const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[job.jid])).rows[0]
      if(!wallet)throw new Error('Carteira não encontrada; pacote preservado')
      const cash=Number(wallet.cash),bank=Number(wallet.bank)
      if(!Number.isSafeInteger(cash)||!Number.isSafeInteger(bank)||cash<0||bank<0)
        throw new Error('Carteira inconsistente; pacote preservado')
      if(cash+bank<quote.totalPrice){
        await c.query("UPDATE raid_lote_jobs SET status='funds_exhausted',finished_at=NOW(),updated_at=NOW() WHERE id=$1",[jobId])
        await enqueueRaidLoteNotice(c,job.id,job.jid)
        return {status:'funds_exhausted'}
      }
      if(quote.ownedKeysUsed>0){
        const used=await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2 AND quantity>0 RETURNING quantity',[job.jid,cfg.keyId])
        if(used.rowCount!==1)throw new Error('Chave mudou durante a cobrança')
      }
      const paidCash=Math.min(cash,quote.totalPrice),paidBank=quote.totalPrice-paidCash
      await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2 WHERE jid=$3',[paidCash,paidBank,job.jid])
      await c.query('UPDATE raid_lote_municipality SET balance=balance+$1 WHERE id=1',[quote.serviceTotal])
      await c.query(`
        INSERT INTO transactions(from_jid,to_jid,amount,type,note)
        VALUES ($1,'raid_shop',$2,'raid_lote_keys',$4),
               ($1,'alpha_prefeitura',$3,'raid_lote_service',$4)
      `,[job.jid,quote.keysTotal,quote.serviceTotal,'RaidLote sessão #'+jobId+' tentativa '+seq])
      await c.query(`
        UPDATE raid_lote_jobs SET total_paid=total_paid+$2,cash_paid=cash_paid+$3,
          bank_paid=bank_paid+$4,keys_total=keys_total+$5,fee_total=fee_total+$6,
          owned_keys_spent=owned_keys_spent+$7,keys_bought=keys_bought+$8
        WHERE id=$1
      `,[jobId,quote.totalPrice,paidCash,paidBank,quote.keysTotal,quote.serviceTotal,quote.ownedKeysUsed,quote.keysToBuy])
    }
    const raidChat=raidLoteRoomId(id)
    await c.query(`
      INSERT INTO raid_lote_attempts(id,job_id,seq,raid_chat,level)
      VALUES($1,$2,$3,$4,$5)
    `,[id,jobId,seq,raidChat,job.level])
    await c.query(`
      UPDATE raid_lote_jobs SET started=$2,status='running',current_attempt_id=$3,updated_at=NOW(),
        next_attempt_at=CASE WHEN billing_mode='per_attempt' THEN NOW() WHEN duration_hours IS NULL THEN NULL ELSE NOW()+($4::integer*INTERVAL '1 minute') END
      WHERE id=$1
    `,[jobId,seq,id,RAID_LOTE_V2_INTERVAL_MINUTES])
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
    const info=(await c.query(`
      SELECT a.job_id,j.jid FROM raid_lote_attempts a
      JOIN raid_lote_jobs j ON j.id=a.job_id WHERE a.id=$1
    `,[attemptId])).rows[0]
    if(!info)throw new Error('Tentativa nao encontrada')
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+info.jid])
    const job=(await c.query('SELECT * FROM raid_lote_jobs WHERE id=$1 FOR UPDATE',[info.job_id])).rows[0]
    const attempt=(await c.query('SELECT * FROM raid_lote_attempts WHERE id=$1 FOR UPDATE',[attemptId])).rows[0]
    if(attempt.status==='won'||attempt.status==='lost')return {status:'already_settled',result:attempt.status}
    if(!attempt.raid_started_at_ms)return {status:'waiting_for_combat'}
    if(!job||String(job.current_attempt_id)!==String(attempt.id))
      throw new Error('Job aponta para outra tentativa; bloquear acerto')
    const raid=(await c.query('SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2 FOR UPDATE',
      [attempt.raid_chat,'raid:'+attempt.level])).rows[0]?.state
    if(!raid||Number(raid.startedAt)!==Number(attempt.raid_started_at_ms))
      throw new Error('Estado de combate ausente ou divergiu; nao consumir nova tentativa')
    if(!['completed','failed'].includes(raid.status))return {status:'in_progress'}
    if(raid.mode!=='lote'||raid.loteAttemptId!==String(attempt.id))
      throw new Error('Combate nao pertence a esta tentativa de pacote')
    if(raid.status==='completed'&&(!attempt.reward_summary||!Array.isArray(attempt.reward_summary.rewards)))
      throw new Error('Vitória sem recibo transacional de recompensa; reconciliar antes de prosseguir')
    const won=raid.status==='completed'
    const finishedStatus=won?'won':'lost'
    await c.query('UPDATE raid_lote_attempts SET status=$2,finished_at=NOW() WHERE id=$1',[attemptId,finishedStatus])
    const newWins=Number(job.won_count)+(won?1:0)
    let jobStatus
    if(job.billing_mode==='per_attempt'){
      const dead=Number((await c.query('SELECT hp FROM stats WHERE jid=$1 FOR UPDATE',[job.jid])).rows[0]?.hp||0)<=0
      const expired=(await c.query('SELECT NOW()>=session_ends_at AS expired FROM raid_lote_jobs WHERE id=$1',[job.id])).rows[0]?.expired===true
      jobStatus=job.cancel_requested?'cancelled':dead?'lost':expired?'completed':'running'
    }else{
      jobStatus=job.cancel_requested?'cancelled':(!won?'lost':newWins>=Number(job.requested)?'won':'running')
    }
    await c.query(`
      UPDATE raid_lote_jobs SET won_count=$2,current_attempt_id=NULL,status=$3,
        updated_at=NOW(),finished_at=CASE WHEN $3 IN ('won','lost','cancelled') THEN NOW() ELSE finished_at END
      WHERE id=$1
    `,[job.id,newWins,jobStatus])
    // Persistir a pendencia na MESMA transacao do encerramento, antes do commit.
    // Falha de conexao WhatsApp nao reabre o job nem repete as recompensas.
    if(['won','lost','cancelled','completed','funds_exhausted'].includes(jobStatus)){
      await enqueueRaidLoteNotice(c,job.id,job.jid)
    }
    // Jamais realizar estorno: as tentativas nao iniciadas estavam quitadas no pacote.
    return {status:finishedStatus,jobStatus,wins:newWins,started:Number(job.started),paid:Number(job.total_paid)}
  })
}
