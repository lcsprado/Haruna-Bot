// Shared Web-to-WhatsApp relay. No second Baileys connection in the Web API.
// Durable status lives in PostgreSQL; LISTEN/NOTIFY is only the low-latency wakeup.
const TABLE='alpha_web_action_outbox'
const CHANNEL='alpha_web_action_wakeup_v1'
const SCHEMA=new WeakMap()
const ATTEMPT_LIMIT=4

export function ensureWebActionOutbox(db){
  if(!SCHEMA.has(db)){
    const init=(async()=>{
      await db.query(`CREATE TABLE IF NOT EXISTS ${TABLE}(
        id BIGSERIAL PRIMARY KEY,
        chat_jid TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('message','raid_auto')),
        payload JSONB NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        claim_until_ms BIGINT NOT NULL DEFAULT 0,
        next_retry_at_ms BIGINT NOT NULL DEFAULT 0,
        created_at_ms BIGINT NOT NULL,
        delivered_at_ms BIGINT,
        last_error TEXT
      )`)
      await db.query(`CREATE INDEX IF NOT EXISTS alpha_web_action_outbox_pending_idx
        ON ${TABLE}(state,next_retry_at_ms,id)`)
    })().catch(err=>{SCHEMA.delete(db);throw err})
    SCHEMA.set(db,init)
  }
  return SCHEMA.get(db)
}

export async function enqueueWebAction(db,{chat,kind,payload}){
  if(!String(chat||'').endsWith('@g.us')) throw new Error('Grupo inválido para aviso Web.')
  if(!['message','raid_auto'].includes(kind)) throw new Error('Tipo de aviso Web inválido.')
  if(kind==='message' && (!String(payload?.text||'').trim() || String(payload.text).length>6000))
    throw new Error('Aviso Web inválido.')
  if(kind==='raid_auto' && (!Number.isInteger(Number(payload?.level)) || Number(payload.level)<=0))
    throw new Error('Nível de Raid inválido.')
  await ensureWebActionOutbox(db)
  const {rows}=await db.query(`
    WITH event AS (
      INSERT INTO ${TABLE}(chat_jid,kind,payload,created_at_ms)
      VALUES($1,$2,$3::jsonb,$4) RETURNING id
    )
    SELECT id,pg_notify('${CHANNEL}',id::text) FROM event
  `,[chat,kind,JSON.stringify(payload),Date.now()])
  if(!rows[0])throw new Error('Aviso Web não foi registrado.')
  return Number(rows[0].id)
}

export async function deliverWebActionsOnce(db,{sendMessage,startRaidRun,isConnected=()=>true,log=console}){
  if(!isConnected())return {processed:0,delivered:0}
  await ensureWebActionOutbox(db)
  const now=Date.now()
  const {rows}=await db.query(`
    WITH reserved AS (
      SELECT id FROM ${TABLE}
      WHERE (
        (state='pending' AND next_retry_at_ms<=$1)
        OR (state='sending' AND claim_until_ms<$1)
      ) AND attempts<${ATTEMPT_LIMIT}
      ORDER BY id LIMIT 8 FOR UPDATE SKIP LOCKED
    )
    UPDATE ${TABLE} o
    SET state='sending',attempts=o.attempts+1,claim_until_ms=$2
    FROM reserved r WHERE o.id=r.id
    RETURNING o.id,o.chat_jid,o.kind,o.payload,o.attempts
  `,[now,now+45000])
  let delivered=0
  for(const row of rows){
    try{
      if(!isConnected())throw new Error('WhatsApp desconectado')
      if(row.kind==='message'){
        const ok=await sendMessage(row.chat_jid,String(row.payload?.text||''),row.payload?.mentions||[])
        if(ok===false)throw new Error('Envio não confirmado')
      }else if(row.kind==='raid_auto'){
        // False means a run is already active; this is a successful idempotent outcome.
        await startRaidRun(row.chat_jid,Number(row.payload?.level))
      }else throw new Error('Tipo desconhecido')
      await db.query(`UPDATE ${TABLE}
        SET state='sent',delivered_at_ms=$2,last_error=NULL
        WHERE id=$1 AND state='sending'`,[row.id,Date.now()])
      delivered++
    }catch(err){
      const attempt=Number(row.attempts||1)
      const message=String(err?.message||err).slice(0,140)
      await db.query(`UPDATE ${TABLE}
        SET state=CASE WHEN attempts>=${ATTEMPT_LIMIT} THEN 'failed' ELSE 'pending' END,
        next_retry_at_ms=$2,claim_until_ms=0,last_error=$3
        WHERE id=$1 AND state='sending'`,[row.id,Date.now()+Math.min(attempt*10000,30000),message])
      log.warn('[Web Relay] entrega pendente',JSON.stringify({kind:row.kind,attempt}))
    }
  }
  return {processed:rows.length,delivered}
}

export async function startWebActionConsumer(db,{sendMessage,startRaidRun,isConnected=()=>true,log=console,pollMs=20000}){
  await ensureWebActionOutbox(db)
  let closed=false,running=false,client=null,reconnectTimer=null
  async function drain(){
    if(closed||running||!isConnected())return
    running=true
    try{
      for(let batch=0;batch<4 && !closed;batch++){
        const r=await deliverWebActionsOnce(db,{sendMessage,startRaidRun,isConnected,log})
        if(!r.processed || r.processed<8)break
      }
    }catch(err){log.warn('[Web Relay] drenagem indisponível',String(err?.message||err).slice(0,140))}
    finally{running=false}
  }
  function scheduleReconnect(){
    if(closed||reconnectTimer)return
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;void connectListener()},5000)
    reconnectTimer.unref?.()
  }
  async function connectListener(){
    if(closed)return
    let next=null
    try{
      next=await db.connect()
      await next.query('LISTEN '+CHANNEL)
      if(closed){next.release();return}
      client=next
      next.on('notification',notification=>{
        if(notification.channel===CHANNEL)void drain()
      })
      const disconnected=()=>{
        if(client!==next)return
        client=null
        try{next.release(true)}catch{}
        scheduleReconnect()
      }
      next.on('error',disconnected)
      next.on('end',disconnected)
    }catch(err){
      if(next)try{next.release(true)}catch{}
      log.warn('[Web Relay] LISTEN indisponível; fallback de 20s ativo',String(err?.message||err).slice(0,140))
      scheduleReconnect()
    }
  }
  const fallback=setInterval(()=>void drain(),pollMs)
  fallback.unref?.()
  void connectListener()
  void drain()
  return {
    drain,
    close(){
      closed=true;clearInterval(fallback);if(reconnectTimer)clearTimeout(reconnectTimer)
      const previous=client;client=null
      if(previous)void previous.query('UNLISTEN '+CHANNEL).catch(()=>{}).finally(()=>previous.release())
    }
  }
}
