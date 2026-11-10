import {RAID_LOTE_RULES,raidLoteFee,isRaidLoteState,raidLoteRoom} from './raid-lote-policy.js'

// Persistência separada dos participantes e das Raids tradicionais.
export async function initRaidLoteTables(db){
  await db.query(`CREATE TABLE IF NOT EXISTS raid_lote_sessions(
    jid TEXT PRIMARY KEY,batch_id TEXT NOT NULL,name TEXT NOT NULL DEFAULT 'Jogador',
    level INTEGER NOT NULL,requested INTEGER NOT NULL,attempts_started INTEGER NOT NULL DEFAULT 0,
    victories INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'running',
    stop_requested BOOLEAN NOT NULL DEFAULT FALSE,current_started_at_ms BIGINT NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,finished_at_ms BIGINT NOT NULL DEFAULT 0,
    notified_at_ms BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT raid_lote_requested_check CHECK(requested BETWEEN 1 AND 10)
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS raid_lote_attempts(
    jid TEXT NOT NULL,batch_id TEXT NOT NULL,attempt_no INTEGER NOT NULL,
    level INTEGER NOT NULL,raid_started_at_ms BIGINT NOT NULL,
    started_at_ms BIGINT NOT NULL,status TEXT NOT NULL DEFAULT 'active',
    finished_at_ms BIGINT NOT NULL DEFAULT 0,
    fee BIGINT NOT NULL,key_price BIGINT NOT NULL,
    rewards JSONB NOT NULL DEFAULT '{}'::jsonb,fail_reason TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(jid,batch_id,attempt_no)
  )`)
  await db.query(`CREATE INDEX IF NOT EXISTS raid_lote_attempts_last24h
    ON raid_lote_attempts(jid,started_at_ms DESC)`)
  await db.query(`CREATE TABLE IF NOT EXISTS alpha_prefeitura_receipts(
    source_key TEXT PRIMARY KEY,from_jid TEXT NOT NULL,
    category TEXT NOT NULL,amount BIGINT NOT NULL CHECK(amount>0),
    created_at_ms BIGINT NOT NULL
  )`)
}

// Chamado dentro da MESMA transação de startRaid, antes de consumir a chave.
// Uma falha de início reverte chave, taxa, saldo, recibo e contador juntos.
export async function chargeRaidLoteStart(c,s,jid,keyPrice,startedAtMs){
  if(!isRaidLoteState(s))return null
  if(raidLoteRoom(jid)!==s.loteChat || s.host!==jid ||
     Object.keys(s.players||{}).length!==1)throw new Error('Sala de lote inválida.')
  const session=(await c.query(
    "SELECT * FROM raid_lote_sessions WHERE jid=$1 FOR UPDATE",[jid]
  )).rows[0]
  if(!session||session.batch_id!==s.loteBatchId||session.status!=='running'||
     session.stop_requested||Number(session.level)!==Number(s.level)){
    throw new Error('Lote encerrado ou não autorizado.')
  }
  if(Number(session.attempts_started)>=Number(session.requested))throw new Error('Limite de tentativas do lote atingido.')
  const attempts24=(await c.query(
    'SELECT COUNT(*)::int AS total FROM raid_lote_attempts WHERE jid=$1 AND started_at_ms>$2',
    [jid,startedAtMs-24*60*60*1000]
  )).rows[0]
  if(Number(attempts24?.total||0)>=RAID_LOTE_RULES.maxAttempts24h)
    throw new Error('Limite de 10 Raids automáticas em 24 horas atingido.')
  const fee=raidLoteFee(keyPrice)
  const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  const cash=Math.max(0,Number(wallet?.cash||0))
  const bank=Math.max(0,Number(wallet?.bank||0))
  if(cash+bank<fee)throw new Error('Saldo insuficiente para a taxa do serviço automático: R$ '+fee.toLocaleString('pt-BR'))
  const cashUse=Math.min(cash,fee),bankUse=fee-cashUse
  const walletUpdate=await c.query(
    'UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$3 AND cash >= $1 AND bank >= $2',
    [cashUse,bankUse,jid])
  if(walletUpdate.rowCount!==1)throw new Error('Saldo mudou durante a cobrança. Tente novamente.')
  const attemptNo=Number(session.attempts_started)+1
  const sourceKey='raid_lote:'+s.loteBatchId+':'+attemptNo
  await c.query(
    "INSERT INTO raid_lote_attempts(jid,batch_id,attempt_no,level,raid_started_at_ms,started_at_ms,fee,key_price) VALUES($1,$2,$3,$4,$5,$5,$6,$7)",
    [jid,s.loteBatchId,attemptNo,Number(s.level),startedAtMs,fee,keyPrice])
  await c.query(
    'UPDATE raid_lote_sessions SET attempts_started=$1,current_started_at_ms=$2,updated_at_ms=$2 WHERE jid=$3 AND batch_id=$4',
    [attemptNo,startedAtMs,jid,s.loteBatchId])
  await c.query(
    "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'prefeitura_alpha',$2,'raid_lote_fee',$3)",
    [jid,fee,sourceKey])
  await c.query(
    "INSERT INTO alpha_prefeitura_receipts(source_key,from_jid,category,amount,created_at_ms) VALUES($1,$2,'raid_lote', $3,$4)",
    [sourceKey,jid,fee,startedAtMs])
  return {attemptNo,fee}
}
