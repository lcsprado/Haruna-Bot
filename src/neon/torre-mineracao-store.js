// Mineração da Torre — integração transacional, habilitação explícita por ambiente.
// Não executa migração ou comando na importação. Produção exige três flags e banco Aiven verificado.
import {randomUUID,randomInt} from 'node:crypto'
import {miningSessionQuote,newMiningSeed,miningSessionOutcome,MINING_INCOME_VERSION} from './mining-session-v2.js'
import {MINING_PICKAXES,MINING_STONE_TABLE,miningQuote,miningPurchaseQuote,miningRepairQuote,miningStartQuote,settleMiningExpedition,MINING_DURATION_SECONDS} from './torre-mineracao-4h.js'
import {ensureUser,grantExpInTransaction} from './db.js'
import {assertMiningRuntime,miningActivityLock} from './torre-mineracao-activity.js'

const nowSeconds=()=>Math.floor(Date.now()/1000)
export async function initMiningStore(db,env=process.env){
  assertMiningRuntime(env)
  await db.query(`
    CREATE TABLE IF NOT EXISTS mining_pickaxes (
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      pickaxe_id TEXT NOT NULL,
      uses_remaining SMALLINT NOT NULL CHECK (uses_remaining>=0 AND uses_remaining<=16),
      capacity_version SMALLINT NOT NULL DEFAULT 2,
      acquired_at BIGINT NOT NULL,
      PRIMARY KEY(jid,pickaxe_id)
    );
    ALTER TABLE mining_pickaxes ADD COLUMN IF NOT EXISTS capacity_version SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE mining_pickaxes DROP CONSTRAINT IF EXISTS mining_pickaxes_uses_remaining_check;
    ALTER TABLE mining_pickaxes ADD CONSTRAINT mining_pickaxes_uses_remaining_check CHECK(uses_remaining>=0 AND uses_remaining<=16);
    UPDATE mining_pickaxes SET uses_remaining=uses_remaining+8,capacity_version=2 WHERE capacity_version=1;
    ALTER TABLE mining_pickaxes ALTER COLUMN capacity_version SET DEFAULT 2;
    CREATE TABLE IF NOT EXISTS mining_expeditions (
      id UUID PRIMARY KEY,
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      pickaxe_id TEXT NOT NULL,
      request_key TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      ends_at BIGINT NOT NULL CHECK (ends_at>started_at),
      status TEXT NOT NULL CHECK(status IN ('running','claimed','cancelled')),
      stone_id TEXT,
      claimed_at BIGINT,
      UNIQUE(jid,request_key)
    );
    ALTER TABLE mining_expeditions ADD COLUMN IF NOT EXISTS policy_version SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE mining_expeditions ADD COLUMN IF NOT EXISTS roll_seed TEXT;
    ALTER TABLE mining_expeditions ADD COLUMN IF NOT EXISTS stone_counts JSONB;
    CREATE UNIQUE INDEX IF NOT EXISTS mining_one_running_per_player
      ON mining_expeditions(jid) WHERE status='running';
    CREATE TABLE IF NOT EXISTS mining_action_receipts (
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      request_key TEXT NOT NULL,
      action TEXT NOT NULL,
      result JSONB NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY(jid,request_key)
    );
    CREATE INDEX IF NOT EXISTS mining_expedition_player_history
      ON mining_expeditions(jid,started_at DESC);
    CREATE TABLE IF NOT EXISTS mining_event_awards (
      event_id TEXT NOT NULL,
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK(source IN ('cerco','evento_inaugural')),
      pickaxe_id TEXT NOT NULL,
      awarded_at BIGINT NOT NULL,
      PRIMARY KEY(event_id,jid)
    );
  `)
}
async function transaction(db,fn){
  const c=await db.connect()
  try {
    await c.query('BEGIN')
    const result=await fn(c)
    await c.query('COMMIT')
    return result
  }catch(err){
    await c.query('ROLLBACK').catch(()=>{})
    throw err
  }finally{c.release()}
}
async function assertAvailable(client,jid,now){
  // Uma consulta consistente e sequencial no mesmo client transacional.
  // Evita a fila concorrente deprecated do pg e reduz viagens até o PostgreSQL.
  const flags=(await client.query(`
    SELECT
      EXISTS(SELECT 1 FROM player_sleep WHERE jid=$1 AND ends_at>$2) AS sleeping,
      EXISTS(SELECT 1 FROM player_carpinar WHERE jid=$1 AND ends_at>$2) AS carpinar,
      EXISTS(SELECT 1 FROM raid_lote_jobs WHERE jid=$1 AND status IN ('queued','running')) AS raidlote,
      EXISTS(SELECT 1 FROM trevo_games WHERE
        (game_type='raid' OR game_type LIKE 'raid:%')
        AND state->>'status' IN ('lobby','active')
        AND COALESCE(state->'players','{}'::jsonb) ? $1) AS raid
  `,[jid,now])).rows[0]
  if(flags?.sleeping)throw new Error('😴 Você está dormindo e não pode minerar.')
  if(flags?.carpinar)throw new Error('🌾 Você está carpindo e não pode minerar.')
  if(flags?.raidlote)throw new Error('⚔️ Você está no Raidlote e não pode minerar.')
  if(flags?.raid)throw new Error('⚔️ Você está em Raid e não pode minerar.')
}
function requestKey(value){
  if(typeof value!=='string'||!/^[-A-Za-z0-9_:]{8,160}$/.test(value))
    throw new Error('Solicitação sem identificador válido.')
  return value
}
async function oldReceipt(client,jid,key,action){
  const prev=(await client.query('SELECT action,result FROM mining_action_receipts WHERE jid=$1 AND request_key=$2',[jid,key])).rows[0]
  if(!prev)return null
  if(prev.action!==action)throw new Error('Chave de solicitação reutilizada para outra operação.')
  return {...prev.result,repeated:true}
}
async function saveReceipt(client,jid,key,action,result,now){
  await client.query('INSERT INTO mining_action_receipts(jid,request_key,action,result,created_at) VALUES($1,$2,$3,$4::jsonb,$5)',
    [jid,key,action,JSON.stringify(result),now])
  return result
}
async function debitCash(client,jid,amount){
  if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Valor inválido.')
  if(amount===0)return
  const paid=await client.query(
    'UPDATE wallets SET cash=cash-$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2 AND cash>=$1 RETURNING jid',
    [amount,jid]
  )
  if(!paid.rowCount)throw new Error('💰 Dinheiro insuficiente na carteira. Saque do banco antes de comprar ou reparar.')
}
export async function getMiningPickaxes(db,jid){
  assertMiningRuntime();await ensureUser(jid)
  const rows=(await db.query('SELECT pickaxe_id,uses_remaining FROM mining_pickaxes WHERE jid=$1 ORDER BY acquired_at',[jid])).rows
  return rows.map(r=>({...miningQuote(r.pickaxe_id),usesRemaining:Number(r.uses_remaining)}))
}
export async function getMiningStatus(db,jid){
  assertMiningRuntime();await ensureUser(jid)
  const row=(await db.query("SELECT id,pickaxe_id,started_at,ends_at,status,policy_version,roll_seed FROM mining_expeditions WHERE jid=$1 AND status='running' ORDER BY started_at DESC LIMIT 1",[jid])).rows[0]
  if(!row)return null
  const remainingSeconds=Math.max(0,Number(row.ends_at)-nowSeconds())
  const {roll_seed,...safe}=row
  return {...safe,remainingSeconds,ready:remainingSeconds===0,progress:[2,MINING_INCOME_VERSION].includes(Number(row.policy_version))?miningSessionOutcome(row,nowSeconds()):null}
}
export async function buyMiningPickaxe(db,{jid,pickaxeId,key}){
  assertMiningRuntime();const quote=miningPurchaseQuote(pickaxeId)
  requestKey(key);await ensureUser(jid)
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const existing=await oldReceipt(c,jid,key,'buy')
    if(existing){
      if(existing.pickaxeId!==pickaxeId)throw new Error('Solicitação repetida com picareta divergente.')
      return existing
    }
    const owned=(await c.query('SELECT 1 FROM mining_pickaxes WHERE jid=$1 AND pickaxe_id=$2',[jid,pickaxeId])).rowCount>0
    if(owned)throw new Error('Você já possui essa picareta.')
    await debitCash(c,jid,quote.priceCash)
    const now=nowSeconds()
    await c.query('INSERT INTO mining_pickaxes(jid,pickaxe_id,uses_remaining,acquired_at) VALUES($1,$2,$3,$4)',
      [jid,pickaxeId,miningQuote(pickaxeId).maxUses,now])
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'mining_pickaxe_buy',$3)",
      [jid,quote.priceCash,pickaxeId])
    return saveReceipt(c,jid,key,'buy',{status:'bought',...quote},now)
  })
}
// Ganho de picareta exclusiva via integracao futura do evento ou Cerco.
// Não há comando público para conceder recompensas; nenhum prêmio é disparado aqui.
export async function grantMiningPickaxeReward(db,{jid,pickaxeId,source,key}){
  assertMiningRuntime();requestKey(key);await ensureUser(jid)
  const quote=miningQuote(pickaxeId)
  if(!['cerco','evento_inaugural'].includes(source)||quote.source!==source)
    throw new Error('Origem de prêmio inválida para essa picareta.')
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const old=await oldReceipt(c,jid,key,'grant')
    if(old){
      if(old.pickaxeId!==pickaxeId||old.source!==source)throw new Error('Prêmio repetido com dados divergentes.')
      return old
    }
    const owned=(await c.query('SELECT 1 FROM mining_pickaxes WHERE jid=$1 AND pickaxe_id=$2',[jid,pickaxeId])).rowCount>0
    const now=nowSeconds()
    if(!owned){
      await c.query('INSERT INTO mining_pickaxes(jid,pickaxe_id,uses_remaining,acquired_at) VALUES($1,$2,$3,$4)',
        [jid,pickaxeId,quote.maxUses,now])
    }
    return saveReceipt(c,jid,key,'grant',{status:owned?'already_owned':'granted',pickaxeId,source,maxUses:quote.maxUses},now)
  })
}

// Atribuição proveniente de resultado FINAL de evento, somente por integração interna.
// O contrato define o tipo da picareta; não elege vencedores nem expõe comando ao jogador.
// Chave composta (evento, jogador) garante ausência de entrega repetida.
export async function awardMiningFromFinalEvent(db,{eventId,source,jid}){
  assertMiningRuntime()
  if(!/^[a-z0-9][a-z0-9:_-]{7,95}$/.test(eventId||''))throw new Error('Identificador do evento inválido.')
  const pickaxeId=source==='cerco'?'ouro':source==='evento_inaugural'?'diamante':null
  if(!pickaxeId)throw new Error('Evento não é elegível para premiação de mineração.')
  await ensureUser(jid)
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const prev=(await c.query(
      'SELECT source,pickaxe_id FROM mining_event_awards WHERE event_id=$1 AND jid=$2 FOR UPDATE',
      [eventId,jid])).rows[0]
    if(prev){
      if(prev.source!==source||prev.pickaxe_id!==pickaxeId)
        throw new Error('Evento já premiado com uma categoria diferente.')
      return {status:'repeated',pickaxeId,source,eventId}
    }
    const now=nowSeconds()
    const owned=(await c.query(
      'SELECT 1 FROM mining_pickaxes WHERE jid=$1 AND pickaxe_id=$2',
      [jid,pickaxeId])).rowCount>0
    if(!owned)await c.query(
      'INSERT INTO mining_pickaxes(jid,pickaxe_id,uses_remaining,acquired_at) VALUES($1,$2,$3,$4)',
      [jid,pickaxeId,miningQuote(pickaxeId).maxUses,now])
    await c.query(
      'INSERT INTO mining_event_awards(event_id,jid,source,pickaxe_id,awarded_at) VALUES($1,$2,$3,$4,$5)',
      [eventId,jid,source,pickaxeId,now])
    return {status:owned?'registered_already_owned':'awarded',pickaxeId,source,eventId}
  })
}

export async function repairMiningPickaxe(db,{jid,pickaxeId,key}){
  assertMiningRuntime();requestKey(key);miningQuote(pickaxeId);await ensureUser(jid)
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const old=await oldReceipt(c,jid,key,'repair')
    if(old){
      if(old.pickaxeId!==pickaxeId)throw new Error('Solicitação repetida com picareta divergente.')
      return old
    }
    const owned=(await c.query('SELECT uses_remaining FROM mining_pickaxes WHERE jid=$1 AND pickaxe_id=$2 FOR UPDATE',[jid,pickaxeId])).rows[0]
    if(!owned)throw new Error('Você não possui essa picareta.')
    const quote=miningRepairQuote(pickaxeId,Number(owned.uses_remaining))
    if(quote.costCash===0)return saveReceipt(c,jid,key,'repair',{status:'full',...quote},nowSeconds())
    await debitCash(c,jid,quote.costCash)
    await c.query('UPDATE mining_pickaxes SET uses_remaining=$3 WHERE jid=$1 AND pickaxe_id=$2',[jid,pickaxeId,quote.usesAfterRepair])
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'mining_pickaxe_repair',$3)",
      [jid,quote.costCash,pickaxeId])
    return saveReceipt(c,jid,key,'repair',{status:'repaired',...quote},nowSeconds())
  })
}
export async function startMiningExpedition(db,{jid,pickaxeId,key,durationSeconds=3600}){
  assertMiningRuntime();requestKey(key);miningQuote(pickaxeId);await ensureUser(jid)
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const prev=(await c.query('SELECT id,pickaxe_id,started_at,ends_at,policy_version FROM mining_expeditions WHERE jid=$1 AND request_key=$2',[jid,key])).rows[0]
    if(prev){
      if(prev.pickaxe_id!==pickaxeId||Number(prev.ends_at)-Number(prev.started_at)!==durationSeconds)throw new Error('Confirmação repetida com outra picareta ou duração.')
      return {...prev,repeated:true}
    }
    const now=nowSeconds()
    const old=(await c.query("SELECT 1 FROM mining_expeditions WHERE jid=$1 AND status='running' LIMIT 1",[jid])).rows[0]
    if(old)throw new Error('⛏️ Resgate ou cancele a expedição anterior antes de iniciar outra.')
    await assertAvailable(c,jid,now)
    const owned=(await c.query('SELECT uses_remaining FROM mining_pickaxes WHERE jid=$1 AND pickaxe_id=$2 FOR UPDATE',[jid,pickaxeId])).rows[0]
    if(!owned)throw new Error('Você não possui essa picareta.')
    const quote=miningSessionQuote(pickaxeId,Number(owned.uses_remaining),durationSeconds)
    const id=randomUUID()
    await c.query('UPDATE mining_pickaxes SET uses_remaining=$3 WHERE jid=$1 AND pickaxe_id=$2',[jid,pickaxeId,quote.usesAfter])
    await c.query("INSERT INTO mining_expeditions(id,jid,pickaxe_id,request_key,started_at,ends_at,status,policy_version,roll_seed) VALUES($1,$2,$3,$4,$5,$6,'running',$8,$7)",
      [id,jid,pickaxeId,key,now,now+durationSeconds,newMiningSeed(),MINING_INCOME_VERSION])
    return {id,pickaxe_id:pickaxeId,started_at:now,ends_at:now+durationSeconds,usesAfter:quote.usesAfter,usesCost:quote.usesCost}
  })
}
// Both early exit and normal claim use the same lock and atomic payout.
// Legacy active sessions retain the original single drop and original rewards.
export async function cancelMiningExpedition(db,jid){
  return claimMiningExpedition(db,jid,{early:true})
}
export async function claimMiningExpedition(db,jid,{early=false}={}){
  assertMiningRuntime();await ensureUser(jid)
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const row=(await c.query("SELECT * FROM mining_expeditions WHERE jid=$1 AND status='running' FOR UPDATE",[jid])).rows[0]
    if(!row)return {status:'none'}
    const now=nowSeconds(),finished=now>=Number(row.ends_at),modern=[2,MINING_INCOME_VERSION].includes(Number(row.policy_version))
    if(!finished&&!early)return {status:'running',remainingSeconds:Number(row.ends_at)-now}
    if(!finished&&early&&!modern){
      await c.query("UPDATE mining_expeditions SET status='cancelled' WHERE id=$1",[row.id])
      return {status:'cancelled'}
    }
    let outcome
    if(modern)outcome=miningSessionOutcome(row,now)
    else{
      const legacy=settleMiningExpedition({pickaxeId:row.pickaxe_id,startedAt:Number(row.started_at),now,stoneRoll:randomInt(0,1000000)/1000000,kindRoll:randomInt(0,1000000)/1000000})
      if(legacy.status!=='done')throw Error('Expedição não concluída.')
      outcome={...legacy,stones:legacy.stoneId?{[legacy.stoneId]:1}:{}}
    }
    if(modern&&outcome.ticks===0){
      await c.query("UPDATE mining_expeditions SET status='cancelled' WHERE id=$1",[row.id])
      return {status:'cancelled'}
    }
    const wallet=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2 RETURNING jid',[outcome.cash,jid])
    if(wallet.rowCount!==1)throw Error('Carteira não encontrada.')
    const exp=await grantExpInTransaction(c,jid,outcome.xp)
    for(const [stoneId,qty] of Object.entries(outcome.stones)){
      await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',[jid,stoneId,qty])
    }
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'mining_reward',$3)",[jid,outcome.cash,'mining:'+row.id])
    await c.query("UPDATE mining_expeditions SET status='claimed',stone_id=$2,claimed_at=$3,stone_counts=$4::jsonb WHERE id=$1",[row.id,Object.keys(outcome.stones)[0]||null,now,JSON.stringify(outcome.stones)])
    return {...outcome,status:'claimed',early:!finished,pickaxeId:row.pickaxe_id,awardedXp:Number(exp?.awardedGain??outcome.xp),id:row.id}
  })
}
