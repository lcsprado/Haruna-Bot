// Mineração da Torre — integração transacional, sob flag EXCLUSIVA de teste.
// Não executa migração ou comando na importação. Não habilitar no banco de produção.
import {randomUUID,randomInt} from 'node:crypto'
import {MINING_PICKAXES,MINING_STONE_TABLE,miningQuote,miningPurchaseQuote,miningRepairQuote,miningStartQuote,settleMiningExpedition,MINING_DURATION_SECONDS} from './torre-mineracao-4h.js'
import {ensureUser,grantExpInTransaction} from './db.js'
import {miningHomologationEnabled,assertMiningHomologation,miningActivityLock} from './torre-mineracao-activity.js'

const nowSeconds=()=>Math.floor(Date.now()/1000)
export async function initMiningStore(db,env=process.env){
  assertMiningHomologation(env)
  await db.query(`
    CREATE TABLE IF NOT EXISTS mining_pickaxes (
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      pickaxe_id TEXT NOT NULL,
      uses_remaining SMALLINT NOT NULL CHECK (uses_remaining>=0 AND uses_remaining<=8),
      acquired_at BIGINT NOT NULL,
      PRIMARY KEY(jid,pickaxe_id)
    );
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
  const [sleep,carpinar,lote,raid]=await Promise.all([
    client.query('SELECT 1 FROM player_sleep WHERE jid=$1 AND ends_at>$2 LIMIT 1',[jid,now]),
    client.query('SELECT 1 FROM player_carpinar WHERE jid=$1 AND ends_at>$2 LIMIT 1',[jid,now]),
    client.query("SELECT 1 FROM raid_lote_jobs WHERE jid=$1 AND status IN ('queued','running') LIMIT 1",[jid]),
    client.query("SELECT 1 FROM trevo_games WHERE (game_type='raid' OR game_type LIKE 'raid:%') AND state->>'status' IN ('lobby','active') AND COALESCE(state->'players','{}'::jsonb) ? $1 LIMIT 1",[jid])
  ])
  if(sleep.rowCount)throw new Error('😴 Você está dormindo e não pode minerar.')
  if(carpinar.rowCount)throw new Error('🌾 Você está carpindo e não pode minerar.')
  if(lote.rowCount)throw new Error('⚔️ Você está no Raidlote e não pode minerar.')
  if(raid.rowCount)throw new Error('⚔️ Você está em Raid e não pode minerar.')
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
  assertMiningHomologation();await ensureUser(jid)
  const rows=(await db.query('SELECT pickaxe_id,uses_remaining FROM mining_pickaxes WHERE jid=$1 ORDER BY acquired_at',[jid])).rows
  return rows.map(r=>({...miningQuote(r.pickaxe_id),usesRemaining:Number(r.uses_remaining)}))
}
export async function getMiningStatus(db,jid){
  assertMiningHomologation();await ensureUser(jid)
  const row=(await db.query("SELECT id,pickaxe_id,started_at,ends_at,status FROM mining_expeditions WHERE jid=$1 AND status='running' ORDER BY started_at DESC LIMIT 1",[jid])).rows[0]
  if(!row)return null
  const remainingSeconds=Math.max(0,Number(row.ends_at)-nowSeconds())
  return {...row,remainingSeconds,ready:remainingSeconds===0}
}
export async function buyMiningPickaxe(db,{jid,pickaxeId,key}){
  assertMiningHomologation();const quote=miningPurchaseQuote(pickaxeId)
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
export async function repairMiningPickaxe(db,{jid,pickaxeId,key}){
  assertMiningHomologation();requestKey(key);miningQuote(pickaxeId);await ensureUser(jid)
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
export async function startMiningExpedition(db,{jid,pickaxeId,key}){
  assertMiningHomologation();requestKey(key);miningQuote(pickaxeId);await ensureUser(jid)
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const prev=(await c.query('SELECT id,pickaxe_id,ends_at FROM mining_expeditions WHERE jid=$1 AND request_key=$2',[jid,key])).rows[0]
    if(prev){
      if(prev.pickaxe_id!==pickaxeId)throw new Error('Confirmação repetida com outra picareta.')
      return {...prev,repeated:true}
    }
    const now=nowSeconds()
    const old=(await c.query("SELECT 1 FROM mining_expeditions WHERE jid=$1 AND status='running' LIMIT 1",[jid])).rows[0]
    if(old)throw new Error('⛏️ Resgate ou cancele a expedição anterior antes de iniciar outra.')
    await assertAvailable(c,jid,now)
    const owned=(await c.query('SELECT uses_remaining FROM mining_pickaxes WHERE jid=$1 AND pickaxe_id=$2 FOR UPDATE',[jid,pickaxeId])).rows[0]
    if(!owned)throw new Error('Você não possui essa picareta.')
    const quote=miningStartQuote(pickaxeId,Number(owned.uses_remaining))
    const id=randomUUID()
    await c.query('UPDATE mining_pickaxes SET uses_remaining=$3 WHERE jid=$1 AND pickaxe_id=$2',[jid,pickaxeId,quote.usesAfter])
    await c.query("INSERT INTO mining_expeditions(id,jid,pickaxe_id,request_key,started_at,ends_at,status) VALUES($1,$2,$3,$4,$5,$6,'running')",
      [id,jid,pickaxeId,key,now,now+MINING_DURATION_SECONDS])
    return {id,pickaxe_id:pickaxeId,started_at:now,ends_at:now+MINING_DURATION_SECONDS,usesAfter:quote.usesAfter}
  })
}
export async function cancelMiningExpedition(db,jid){
  assertMiningHomologation();await ensureUser(jid)
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const row=(await c.query("SELECT id,ends_at FROM mining_expeditions WHERE jid=$1 AND status='running' FOR UPDATE",[jid])).rows[0]
    if(!row)return {status:'none'}
    if(Number(row.ends_at)<=nowSeconds())throw new Error('Expedição concluída. Use !minerar resgatar.')
    await c.query("UPDATE mining_expeditions SET status='cancelled' WHERE id=$1",[row.id])
    // Durabilidade gasta no início NÃO é devolvida e não há prêmio de cancelamento.
    return {status:'cancelled'}
  })
}
export async function claimMiningExpedition(db,jid){
  assertMiningHomologation();await ensureUser(jid)
  return transaction(db,async c=>{
    await miningActivityLock(c,jid)
    const row=(await c.query("SELECT * FROM mining_expeditions WHERE jid=$1 AND status='running' FOR UPDATE",[jid])).rows[0]
    if(!row)return {status:'none'}
    const now=nowSeconds()
    if(now<Number(row.ends_at))return {status:'running',remainingSeconds:Number(row.ends_at)-now}
    // Dois sorteios seguros, realizados apenas na PRIMEIRA transação de resgate.
    const outcome=settleMiningExpedition({
      pickaxeId:row.pickaxe_id,startedAt:Number(row.started_at),now,
      stoneRoll:randomInt(0,1000000)/1000000,kindRoll:randomInt(0,1000000)/1000000
    })
    if(outcome.status!=='done')throw new Error('Expedição não concluída.')
    await c.query('UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2',[outcome.cash,jid])
    const exp=await grantExpInTransaction(c,jid,outcome.xp)
    if(outcome.stoneId){
      await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
        ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1`,[jid,outcome.stoneId])
    }
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'mining_reward',$3)",
      [jid,outcome.cash,'mining:'+row.id])
    await c.query("UPDATE mining_expeditions SET status='claimed',stone_id=$2,claimed_at=$3 WHERE id=$1",[row.id,outcome.stoneId,now])
    return {...outcome,status:'claimed',pickaxeId:row.pickaxe_id,awardedXp:Number(exp?.awardedGain??outcome.xp),id:row.id}
  })
}
