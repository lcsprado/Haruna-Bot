// Baileys pede a mensagem ORIGINAL para reencriptar um envio que o telefone
// mostrou como "Aguardando mensagem". A cache em memoria some no redeploy.
// Persistimos APENAS textos enviados pelo proprio bot, com TTL curto.
// Nunca persistir midia, credenciais Signal, mensagens recebidas ou anexos.
const MAX_ID_LENGTH=180
const MAX_BODY_LENGTH=32000
const MAX_PAYLOAD_BYTES=110000
const RETENTION_HOURS=48
const isChat=chat=>/^(?:\d{10,18}@(s\.whatsapp\.net|g\.us)|\d{10,20}@lid)$/.test(String(chat||''))
const messageId=key=>{
  const id=String(key?.id||'')
  return id.length>0&&id.length<=MAX_ID_LENGTH?id:null
}
const redactError=err=>String(err?.code||err?.name||'query_failed').slice(0,80)

export function createDurableOutboundRetry({db,memory,log=()=>{}}={}){
  if(!db?.query||!memory?.remember||!memory?.getMessage)
    throw new Error('Dependencias do cache de reenvio ausentes')
  let ready=false,writeCount=0

  const init=async()=>{
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_outbound_retry (
        message_id TEXT PRIMARY KEY,
        chat_jid TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '48 hours')
      )
    `)
    await db.query(`
      CREATE INDEX IF NOT EXISTS whatsapp_outbound_retry_expiry_idx
      ON whatsapp_outbound_retry(expires_at)
    `)
    await db.query('DELETE FROM whatsapp_outbound_retry WHERE expires_at<NOW()')
    ready=true
    return true
  }

  const remember=async(sent,{chat,content}={})=>{
    // Mesmo se o banco estiver indisponivel, reenvios na instancia atual continuam.
    const cached=memory.remember(sent)
    const id=messageId(sent?.key)
    const text=content?.text
    if(!ready||!cached||!id||!isChat(chat)||typeof text!=='string'||
       text.length===0||text.length>MAX_BODY_LENGTH||!sent?.message)return cached

    let payload
    try{payload=JSON.stringify(sent.message)}catch{return cached}
    if(!payload||Buffer.byteLength(payload,'utf8')>MAX_PAYLOAD_BYTES)return cached
    try{
      await db.query(`
        INSERT INTO whatsapp_outbound_retry(message_id,chat_jid,payload,expires_at)
        VALUES($1,$2,$3::jsonb,NOW()+INTERVAL '48 hours')
        ON CONFLICT(message_id) DO NOTHING
      `,[id,String(chat),payload])
      writeCount++
      if(writeCount%250===0){
        // Limpeza oportunista: nenhuma rotina extra de polling e nenhum
        // conteudo guardado indefinidamente.
        await db.query('DELETE FROM whatsapp_outbound_retry WHERE expires_at<NOW()')
      }
    }catch(err){log('write_failed',redactError(err))}
    return cached
  }

  const lookup=async key=>{
    const id=messageId(key)
    if(!id)return {message:undefined,source:'invalid'}
    const inMemory=memory.getMessage(key)
    if(inMemory)return {message:inMemory,source:'memory'}
    if(!ready)return {message:undefined,source:'unavailable'}
    try{
      const result=await db.query(`
        SELECT payload FROM whatsapp_outbound_retry
        WHERE message_id=$1 AND expires_at>NOW() LIMIT 1
      `,[id])
      const original=result.rows?.[0]?.payload
      if(original&&typeof original==='object'&&!Array.isArray(original)){
        memory.remember({key:{id},message:original})
        return {message:original,source:'database'}
      }
    }catch(err){log('read_failed',redactError(err))}
    return {message:undefined,source:'miss'}
  }

  return Object.freeze({init,remember,lookup,isReady:()=>ready})
}
