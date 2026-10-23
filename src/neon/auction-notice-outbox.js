// Persisted transactional auction notifications, no monetary operations.
export async function initAuctionNoticeOutbox(db){
  await db.query(`
    CREATE TABLE IF NOT EXISTS auction_bid_notice_outbox (
      auction_key TEXT NOT NULL,
      bid_version BIGINT NOT NULL,
      target_chat TEXT NOT NULL,
      origin_chat TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      retry_at BIGINT NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      alerted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      PRIMARY KEY (auction_key,bid_version,target_chat)
    )
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS auction_bid_notice_pending_idx
    ON auction_bid_notice_outbox(auction_key,status,retry_at)
  `)
}
export async function queueAuctionBidNotices(c,{key,version,groups,origin,message}){
  for(const target of [...new Set(groups||[])]){
    if(!String(target).endsWith('@g.us') || target===origin)continue
    await c.query(`
      INSERT INTO auction_bid_notice_outbox
        (auction_key,bid_version,target_chat,origin_chat,message)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(auction_key,bid_version,target_chat) DO NOTHING
    `,[key,version,target,origin,message])
  }
}
export async function auctionNoticeSummary(db,key,version){
  const {rows}=await db.query(`
    SELECT status,COUNT(*)::integer AS total
    FROM auction_bid_notice_outbox
    WHERE auction_key=$1 AND bid_version=$2 GROUP BY status
  `,[key,version])
  const result={sent:0,pending:0,failed:0}
  for(const r of rows){
    const count=Number(r.total)||0
    if(r.status==='sent')result.sent+=count
    else if(r.status==='blocked'||r.status==='failed')result.failed+=count
    else result.pending+=count
  }
  return result
}
// Claims are short transactions. No SQL lock is held during WhatsApp transport.
// The lease expires after 20s so a Render restart can resume undelivered notices.
export async function flushAuctionBidNotices(db,sock,key,{limit=6}={}){
  const result={sent:0,failed:0,pending:0}
  if(!sock?.sendMessage)return result
  for(let n=0;n<limit;n++){
    const now=Math.floor(Date.now()/1000)
    const {rows}=await db.query(`
      WITH chosen AS (
        SELECT auction_key,bid_version,target_chat
        FROM auction_bid_notice_outbox
        WHERE auction_key=$1 AND status IN ('pending','retry','sending')
          AND retry_at<=$2
        ORDER BY bid_version ASC,created_at ASC
        LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE auction_bid_notice_outbox n
      SET status='sending',attempts=n.attempts+1,retry_at=$3
      FROM chosen x
      WHERE n.auction_key=x.auction_key AND n.bid_version=x.bid_version
        AND n.target_chat=x.target_chat
      RETURNING n.auction_key,n.bid_version,n.target_chat,n.origin_chat,
                n.message,n.attempts
    `,[key,now,now+20])
    const item=rows[0]
    if(!item)break
    try{
      await sock.sendMessage(item.target_chat,{text:item.message})
      await db.query(`
        UPDATE auction_bid_notice_outbox
        SET status='sent',retry_at=0,last_error=''
        WHERE auction_key=$1 AND bid_version=$2 AND target_chat=$3 AND status='sending'
      `,[item.auction_key,item.bid_version,item.target_chat])
      result.sent++
    }catch(err){
      const message=String(err?.message||err).slice(0,180)
      const forbidden=/forbidden|not.authorized|not.allowed|403|not.a.participant/i.test(message)
      const terminal=forbidden||Number(item.attempts)>=4
      const status=terminal?(forbidden?'blocked':'failed'):'retry'
      const retryAt=terminal?0:now+[0,8,20,45,90][Math.min(4,Number(item.attempts))]*1
      await db.query(`
        UPDATE auction_bid_notice_outbox
        SET status=$4,retry_at=$5,last_error=$6
        WHERE auction_key=$1 AND bid_version=$2 AND target_chat=$3 AND status='sending'
      `,[item.auction_key,item.bid_version,item.target_chat,status,retryAt,message])
      console.warn('[AUCTION DELIVERY] send failed',JSON.stringify({
        version:Number(item.bid_version),status,cause:message
      }))
      if(terminal)result.failed++;else result.pending++
    }
  }
  return result
}
export async function warnAuctionDeliveryFailures(db,sock,key){
  if(!sock?.sendMessage)return 0
  const {rows}=await db.query(`
    SELECT auction_key,bid_version,target_chat,origin_chat,status
    FROM auction_bid_notice_outbox
    WHERE auction_key=$1 AND status IN ('blocked','failed') AND alerted=FALSE
    ORDER BY created_at LIMIT 12
  `,[key])
  let warned=0
  for(const item of rows){
    const notice='⚠️ *LEILÃO — AVISO NÃO ENTREGUE*\n'
       +'Um grupo participante não recebeu a atualização do lance.\n'
       +'O valor registrado no banco continua válido.\n'
       +'📋 Use *!leilao* para consultar o maior lance atual.\n'
       +'🔧 Confira se o Alpha Bot continua no outro grupo e pode enviar mensagens.'
    try{
      if(item.origin_chat.endsWith('@g.us') && item.origin_chat!==item.target_chat){
        await sock.sendMessage(item.origin_chat,{text:notice})
        warned++
      }
      await db.query(`
        UPDATE auction_bid_notice_outbox SET alerted=TRUE
        WHERE auction_key=$1 AND bid_version=$2 AND target_chat=$3 AND alerted=FALSE
      `,[item.auction_key,item.bid_version,item.target_chat])
    }catch(err){
      console.warn('[AUCTION DELIVERY] failure alert also failed',String(err?.message||err).slice(0,120))
    }
  }
  return warned
}