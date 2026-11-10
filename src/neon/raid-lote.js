import crypto from 'node:crypto'
import {db} from './db.js'
import {createRaid,startRaid,raidRound,getRaidCatalog,cancelRaid} from './games.js'
import {initRaidLoteTables} from './raid-lote-ledger.js'
import {RAID_LOTE_RULES,raidLoteRoom,raidLoteFee} from './raid-lote-policy.js'

export const raidLoteEnabled=()=>process.env.ALPHA_RAID_LOTE_ENABLED==='1'
const fmt=n=>Number(n||0).toLocaleString('pt-BR')
const now=()=>Date.now()
let interval=null,working=false,notifyUser=null,launchCombat=null

async function atomic(fn){
 const c=await db.connect()
 try{await c.query('BEGIN');const out=await fn(c);await c.query('COMMIT');return out}
 catch(e){await c.query('ROLLBACK');throw e}
 finally{c.release()}
}
export function describeRaidLoteRules(level=null){
 const cat=getRaidCatalog(),cfg=cat.find(x=>Number(x.level)===Number(level))
 let msg='⚔️ *RAIDS AUTOMÁTICAS EM LOTE*\n\n'
 msg+='Até *10 Raids por 24h* em sequência, uma de cada vez.\n'
 msg+='💰 Dinheiro: *80%* • ✨ XP: *60%* • 🐾 XP pet: *60%*\n'
 msg+='🌈 XP herói: *60%* • Maestria: *50%*\n'
 msg+='🧩 Fragmentos: *40%* • 🎁 Caixa/gear: *25% da chance normal*\n'
 msg+='🔑 Uma chave por tentativa • 🏛️ Prefeitura: *10% do preço da chave*\n'
 msg+='💀 Se morrer, falhar ou acabar o saldo, o lote para; sem reembolso das tentativas iniciadas.\n'
 msg+='🛡️ Requer *3 vitórias anteriores* no nível escolhido.\n'
 msg+='⌛ Mesma cadência e tempo de luta da Raid normal. Eventos temporários e missões de combate não rendem bônus no lote.\n'
 msg+='📩 Execução e relatório no privado. Não ocupa salas dos grupos.\n'
 if(cfg){
  const fee=raidLoteFee(cfg.keyPrice)
  msg+='\n🔑 *Raid Lv.'+cfg.level+'* • Chave R$ '+fmt(cfg.keyPrice)+' + serviço R$ '+fmt(fee)+' por tentativa.'
  msg+='\n🔟 10 tentativas: R$ '+fmt(10*(cfg.keyPrice+fee))+' em valores nominais (chaves já possuídas serão consumidas).'
 }
 msg+='\n\n▶️ *!raidlote 75 10* • 📊 *!raidlote status*\n🛑 *!raidlote parar* (para após a tentativa atual)'
 return msg
}

export async function startRaidLote(jid,name,level,qty){
 if(!raidLoteEnabled())throw new Error('Raids em lote ainda não estão liberadas.')
 const cfg=getRaidCatalog().find(r=>Number(r.level)===Number(level))
 if(!cfg)throw new Error('Nível inválido. Consulte !raidlote para os níveis disponíveis.')
 if(!Number.isSafeInteger(qty)||qty<1||qty>RAID_LOTE_RULES.maxBatch)
  throw new Error('Informe de 1 a 10 Raids. Ex.: !raidlote 75 10')
 const batchId=crypto.randomUUID(),created=now(),fee=raidLoteFee(cfg.keyPrice)
 return atomic(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['raid-lote-session:'+jid])
  const existing=(await c.query('SELECT * FROM raid_lote_sessions WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(existing?.status==='running')throw new Error('Seu lote já está em execução. Use !raidlote status.')
  const recent=(await c.query('SELECT COUNT(*)::int AS n FROM raid_lote_attempts WHERE jid=$1 AND started_at_ms>$2',[jid,created-86400000])).rows[0]
  const slots=RAID_LOTE_RULES.maxAttempts24h-Number(recent?.n||0)
  if(qty>slots)throw new Error('Restam '+Math.max(0,slots)+' tentativas automáticas nesta janela de 24h.')
  const other=(await c.query(`SELECT state->>'level' AS level FROM trevo_games
    WHERE (game_type='raid' OR game_type LIKE 'raid:%') AND state->>'status' IN ('active','lobby')
    AND (state->'players') ? $1 LIMIT 1`,[jid])).rows[0]
  if(other)throw new Error('Você já está em uma Raid Lv.'+other.level+'. Conclua-a antes de iniciar o lote.')
  const profile=(await c.query('SELECT u.level,s.hp FROM users u JOIN stats s ON s.jid=u.jid WHERE u.jid=$1',[jid])).rows[0]
  if(Number(profile?.level||0)<Number(cfg.minLevel||cfg.level))
    throw new Error('Sua conta não possui nível suficiente para a Raid Lv.'+cfg.level+'.')
  if(Number(profile?.hp||0)<=0)throw new Error('Você está sem HP. Cure-se antes de iniciar o lote.')
  const wins=(await c.query(
    "SELECT COUNT(*)::int AS n FROM transactions WHERE to_jid=$1 AND type='minigame' AND note=$2",
    [jid,'raid_'+cfg.level]
  )).rows[0]
  if(Number(wins?.n||0)<RAID_LOTE_RULES.manualWinsRequired)
    throw new Error('Antes do automático, vença a Raid Lv.'+cfg.level+' ao menos 3 vezes manualmente.')
  const key=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jid,cfg.keyId])).rows[0]
  const w=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1',[jid])).rows[0]
  const required=fee+(Number(key?.quantity||0)>0?0:cfg.keyPrice)
  if(Number(w?.cash||0)+Number(w?.bank||0)<required)
    throw new Error('Saldo para a primeira tentativa insuficiente: R$ '+fmt(required)+' (chave + serviço, conforme inventário).')
  await c.query(`INSERT INTO raid_lote_sessions(
    jid,batch_id,name,level,requested,created_at_ms,updated_at_ms
   ) VALUES($1,$2,$3,$4,$5,$6,$6)
   ON CONFLICT(jid) DO UPDATE SET batch_id=EXCLUDED.batch_id,name=EXCLUDED.name,
   level=EXCLUDED.level,requested=EXCLUDED.requested,attempts_started=0,victories=0,
   status='running',stop_requested=FALSE,current_started_at_ms=0,last_error='',
   created_at_ms=EXCLUDED.created_at_ms,updated_at_ms=EXCLUDED.updated_at_ms,
   finished_at_ms=0,notified_at_ms=0`,
   [jid,batchId,name||'Jogador',cfg.level,qty,created])
  return {level:cfg.level,requested:qty,keyPrice:cfg.keyPrice,fee,batchId}
 })
}

export async function stopRaidLote(jid){
 return atomic(async c=>{
  const s=(await c.query('SELECT * FROM raid_lote_sessions WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(!s||s.status!=='running')return {active:false}
  await c.query(`UPDATE raid_lote_sessions SET stop_requested=TRUE,updated_at_ms=$2
    WHERE jid=$1`,[jid,now()])
  return {active:true,attemptsStarted:Number(s.attempts_started),stopAfterCurrent:Number(s.current_started_at_ms)>0}
 })
}

export async function getRaidLoteStatus(jid){
 const s=(await db.query('SELECT * FROM raid_lote_sessions WHERE jid=$1',[jid])).rows[0]
 if(!s)return null
 const attempts=(await db.query('SELECT status,fee,key_price,rewards,attempt_no FROM raid_lote_attempts WHERE jid=$1 AND batch_id=$2 ORDER BY attempt_no',[jid,s.batch_id])).rows
 return {...s,attempts}
}
export function raidLoteStatusText(s){
 if(!s)return '⚔️ Nenhum lote registrado. Use !raidlote para consultar as regras.'
 const wins=s.attempts.filter(x=>x.status==='won')
 const fees=s.attempts.reduce((a,x)=>a+Number(x.fee||0),0)
 const keys=s.attempts.reduce((a,x)=>a+Number(x.key_price||0),0)
 const cash=wins.reduce((a,x)=>a+Number(x.rewards?.cash||0),0)
 const xp=wins.reduce((a,x)=>a+Number(x.rewards?.xp||0),0)
 const frags=wins.reduce((a,x)=>a+Number(x.rewards?.material?.qty||0),0)
 const status={running:'⚔️ Em andamento',completed:'🏆 Concluído',failed:'💀 Fracassou',stopped:'🛑 Interrompido'}[s.status]||s.status
 return '⚔️ *LOTE RAID Lv.'+s.level+'*\n'+status+
  '\n🔁 Tentativas iniciadas: '+s.attempts_started+'/'+s.requested+
  '\n🏆 Vitórias: '+wins.length+'\n💀 Derrotas: '+s.attempts.filter(x=>x.status==='failed').length+
  '\n🔑 Chaves utilizadas (valor nominal): R$ '+fmt(keys)+
  '\n🏛️ Taxas pagas à Prefeitura: R$ '+fmt(fees)+
  '\n💰 Dinheiro recebido: R$ '+fmt(cash)+
  '\n✨ XP do jogador: '+fmt(xp)+
  '\n🧩 Materiais recebidos: '+fmt(frags)+
  (s.stop_requested?'\n🛑 Cancelamento solicitado; a tentativa iniciada continua até terminar.':'')+
  (s.last_error?'\n⚠️ '+s.last_error:'')
}
async function closeSession(jid,batchId,status,reason=''){
 await db.query(`UPDATE raid_lote_sessions SET status=$3,last_error=$4,
  updated_at_ms=$5,finished_at_ms=$5
  WHERE jid=$1 AND batch_id=$2 AND status='running'`,
  [jid,batchId,status,String(reason||'').slice(0,230),now()])
}
async function finishAttempt(s,state){
 if(!state?.startedAt)return
 return atomic(async c=>{
  const parent=(await c.query('SELECT * FROM raid_lote_sessions WHERE jid=$1 FOR UPDATE',[s.jid])).rows[0]
  if(!parent||parent.status!=='running'||parent.batch_id!==s.batch_id)return
  const attempt=(await c.query(`SELECT * FROM raid_lote_attempts
    WHERE jid=$1 AND batch_id=$2 AND raid_started_at_ms=$3 FOR UPDATE`,
    [s.jid,s.batch_id,Number(state.startedAt)])).rows[0]
  if(!attempt||attempt.status!=='active')return
  const won=state.status==='completed',status=won?'won':'failed'
  const rewards=won?state.loteRewards||{}:{}
  const finished=now()
  await c.query(`UPDATE raid_lote_attempts SET status=$4,rewards=$5::jsonb,
    finished_at_ms=$6,fail_reason=$7 WHERE jid=$1 AND batch_id=$2 AND attempt_no=$3`,
    [s.jid,s.batch_id,attempt.attempt_no,status,JSON.stringify(rewards),finished,
    won?'':String(state.failReason||'derrota').slice(0,120)])
  const victories=Number(parent.victories)+(won?1:0)
  const closed=!won||parent.stop_requested||Number(parent.attempts_started)>=Number(parent.requested)
  const newStatus=!won?'failed':parent.stop_requested?'stopped':closed?'completed':'running'
  await c.query(`UPDATE raid_lote_sessions SET victories=$3,status=$4,
    current_started_at_ms=0,finished_at_ms=$5,updated_at_ms=$5,last_error=$6
    WHERE jid=$1 AND batch_id=$2`,
    [s.jid,s.batch_id,victories,newStatus,finished,won?'':String(state.failReason||'derrota')])
 })
}
async function tickOne(s){
 const chat=raidLoteRoom(s.jid),gameType='raid:'+s.level
 const state=(await db.query('SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2',
  [chat,gameType])).rows[0]?.state
 if(state?.loteBatchId===s.batch_id&&state.status==='active'){
  if(launchCombat)await launchCombat(chat,s.level)
  return
 }
 if(state?.loteBatchId===s.batch_id&&['completed','failed'].includes(state.status)){
  await finishAttempt(s,state)
  return
 }
 if(s.stop_requested){
  await closeSession(s.jid,s.batch_id,'stopped')
  return
 }
 if(Number(s.current_started_at_ms)>0){
  // O registro ativo nunca pode desaparecer silenciosamente: evita consumir outra chave.
  await closeSession(s.jid,s.batch_id,'stopped','Raid não localizada após reinício. Nenhuma nova chave cobrada.')
  return
 }
 if(Number(s.attempts_started)>=Number(s.requested)){
  await closeSession(s.jid,s.batch_id,'completed')
  return
 }
 try{
  if(state?.status==='lobby'&&state?.loteBatchId!==s.batch_id){
   await cancelRaid(chat,s.jid,s.level)
  }
  if(state?.status!=='lobby'||state?.loteBatchId!==s.batch_id){
   await createRaid(chat,s.jid,s.name,s.level,{loteBatchId:s.batch_id})
  }
  await startRaid(chat,s.jid,s.level)
  if(launchCombat)await launchCombat(chat,s.level)
 }catch(e){
  // Erros transitórios de banco podem ser retomados sem nova cobrança.
  const str=String(e?.message||e)
  if(e?.code==='40P01'||/deadlock|timeout de conex[aã]o|temporariamente/i.test(str))throw e
  // Caso o start falhe, desfaz apenas a SALA aguardando; chave no inventário fica.
  try{await cancelRaid(chat,s.jid,s.level)}catch{}
  await closeSession(s.jid,s.batch_id,'stopped',str)
 }
}
async function notifyClosedSessions(){
 if(!notifyUser)return
 const rows=(await db.query(`SELECT jid,batch_id FROM raid_lote_sessions
  WHERE status IN ('completed','failed','stopped') AND notified_at_ms=0
  ORDER BY finished_at_ms ASC LIMIT 10`)).rows
 for(const row of rows){
  const status=await getRaidLoteStatus(row.jid)
  if(!status||status.batch_id!==row.batch_id)continue
  const marked=await db.query(`UPDATE raid_lote_sessions SET notified_at_ms=$3
   WHERE jid=$1 AND batch_id=$2 AND notified_at_ms=0 RETURNING jid`,
   [row.jid,row.batch_id,now()])
  if(!marked.rowCount)continue
  try{await notifyUser(row.jid,raidLoteStatusText(status))}
  catch(e){console.warn('[Raid Lote] resumo não entregue; disponível em !raidlote status:',String(e?.message||e).slice(0,130))}
 }
}
async function tickRaidLote(){
 if(working||!raidLoteEnabled())return
 working=true
 try{
  const sessions=(await db.query(`SELECT * FROM raid_lote_sessions
    WHERE status='running' ORDER BY updated_at_ms ASC LIMIT 5`)).rows
  for(const s of sessions){
   const client=await db.connect()
   let locked=false
   try{
    locked=Boolean((await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok',
     ['raid-lote-worker:'+s.jid])).rows[0]?.ok)
    if(locked)await tickOne(s)
   }catch(e){console.warn('[Raid Lote] tentativa será reavaliada:',String(e?.message||e).slice(0,180))}
   finally{
    if(locked)try{await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',
     ['raid-lote-worker:'+s.jid])}catch{}
    client.release()
   }
  }
  await notifyClosedSessions()
 }catch(e){console.error('[Raid Lote] watchdog',String(e?.message||e).slice(0,180))}
 finally{working=false}
}
export function startRaidLoteScheduler({runRaid,sendPrivate}){
 launchCombat=runRaid;notifyUser=sendPrivate
 if(interval)clearInterval(interval)
 interval=setInterval(()=>{void tickRaidLote()},4000)
 interval.unref?.()
 void tickRaidLote()
 return ()=>{if(interval){clearInterval(interval);interval=null}}
}
export {initRaidLoteTables}
