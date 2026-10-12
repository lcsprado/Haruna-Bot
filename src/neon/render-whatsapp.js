import http from 'node:http'

// A dependência Signal pode imprimir sessões criptográficas completas em texto.
// Silencia exclusivamente esse diagnóstico verboso, protegendo as chaves e a CPU;
// demais avisos e erros continuam registrados normalmente.
const originalConsoleLog=console.log.bind(console)
console.log=(...args)=>{
  if(typeof args[0]==='string' && args[0].startsWith('Closing session:'))return
  originalConsoleLog(...args)
}


// Entrada dedicada ao WhatsApp. Não injeta módulos de Cidade/NPC/Karma.
const port=Number(process.env.PORT||10000)
const health=globalThis.__trevoHealth||(globalThis.__trevoHealth={whatsapp:'starting',lastChange:Date.now(),lastOpen:0,everConnected:false})

http.createServer((req,res)=>{
  if(req.url==='/health'){
    const connected=health.whatsapp==='open'
    res.writeHead(connected?200:503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
    return res.end(JSON.stringify({
      ok:connected,service:'alpha-bot-whatsapp',whatsapp:health.whatsapp,
      lastOpen:health.lastOpen||null,
      uptimeSeconds:Math.floor(process.uptime()),
      messagesSeen:Number(health.messagesSeen||0),
      lastUpsertAt:health.lastUpsertAt||null,
      lastInboundAt:health.lastInboundAt||null,
      lastInboundSecondsAgo:health.lastInboundAt?Math.floor((Date.now()-health.lastInboundAt)/1000):null
    }))
  }
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'})
  res.end('Alpha Bot WhatsApp online')
}).listen(port,'0.0.0.0',()=>console.log('[HTTP] Alpha Bot WhatsApp-only listening on port '+port))

await import('./index.js')

// Auditoria somente leitura do último Eclipse. Não modifica HP nem recompensas.
setTimeout(async()=>{
  try{
    const {db}=await import('./db.js')
    const event=(await db.query("SELECT state,updated_at FROM trevo_games WHERE chat_jid='__alpha_global_boss_event__' AND game_type='boss_event'")).rows[0]
    const credits=(await db.query(`
      SELECT t.to_jid,COALESCE(u.push_name,'') AS name,t.amount,t.created_at
      FROM transactions t LEFT JOIN users u ON u.jid=t.to_jid
      WHERE t.note='boss_event_eclipse'
        AND t.created_at BETWEEN $1 AND $2
      ORDER BY t.amount DESC
      LIMIT 30
    `,[Math.floor(Date.parse('2026-10-09T19:00:00-03:00')/1000),
       Math.floor(Date.parse('2026-10-09T20:00:00-03:00')/1000)])).rows
    const s=event?.state||null
    console.log('[ECLIPSE AUDIT 2026-10-09]',JSON.stringify({
      mode:s?.mode,active:s?.active,hp:s?.hp,maxHp:s?.maxHp,
      scheduleKey:s?.scheduleKey,eventId:s?.eventId,startedAt:s?.startedAt,
      completedAt:s?.completedAt,stoppedAt:s?.stoppedAt,
      participantCount:Object.keys(s?.participants||{}).length,
      participants:Object.values(s?.participants||{}).map(p=>({name:p.name,damage:p.damage})),
      persistedResult:s?.result||null,credits
    }))
  }catch(err){console.error('[ECLIPSE AUDIT FAILED]',err?.stack||err)}
},7000).unref?.()











setTimeout(async()=>{
  try{
    const {db}=await import('./db.js')
    const jid='5511987308687@s.whatsapp.net'
    const marker='repair:joao_pedro:2026-10-09:katana_divina:epic_box_1940'
    const client=await db.connect()
    try{
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[marker])
      const prior=await client.query('SELECT value FROM trevo_settings WHERE key=$1',[marker])
      if(prior.rowCount){console.log('[KATANA JP REPAIR] already applied',JSON.stringify(prior.rows[0]));await client.query('COMMIT');return}
      const before=await client.query("SELECT quantity FROM inventories WHERE jid=$1 AND item_id='katana_divina' FOR UPDATE",[jid])
      const updated=await client.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'katana_divina',1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1 RETURNING quantity",[jid])
      const record={source:'epic_box_9_2026_10_09_1940',item:'katana_divina',added:1,before:Number(before.rows[0]?.quantity||0),after:Number(updated.rows[0]?.quantity||0),timestamp:Date.now()}
      await client.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)',[marker,JSON.stringify(record)])
      await client.query('COMMIT')
      console.log('[KATANA JP REPAIR] success',JSON.stringify(record))
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }catch(e){console.error('[KATANA JP REPAIR] failed',e?.stack||e)}
},12000).unref?.()

setTimeout(async()=>{
  try{
    const {db}=await import('./db.js')
    const marker='event:lucky_box:2026-10-09:15min_2x_manual'
    const c=await db.connect()
    try{
      await c.query('BEGIN')
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[marker])
      const existing=await c.query('SELECT value FROM trevo_settings WHERE key=$1',[marker])
      if(existing.rowCount){console.log('[LUCKY 2X EVENT] already scheduled',JSON.stringify(existing.rows[0].value));await c.query('COMMIT');return}
      const now=Date.now()
      const state={startsAt:now,endsAt:now+15*60*1000,multiplier:2,activatedBy:'owner',eventId:marker}
      await c.query("INSERT INTO trevo_settings(key,value,updated_at) VALUES('lucky_box_event',$1::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",[JSON.stringify(state)])
      await c.query("INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)",[marker,JSON.stringify(state)])
      await c.query('COMMIT')
      console.log('[LUCKY 2X EVENT] active',JSON.stringify(state))
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){console.error('[LUCKY 2X EVENT] failed',e?.stack||e)}
},17000).unref?.()

setTimeout(async()=>{
 try{
  const {db}=await import('./db.js')
  const eventId='trick_boxes_2026_10_09_2204'
  const c=await db.connect()
  try{
   await c.query('BEGIN')
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[eventId])
   const previous=await c.query('SELECT value FROM trevo_settings WHERE key=$1',[eventId])
   if(!previous.rowCount){
    const startsAt=Date.now(),endsAt=startsAt+30*60*1000
    const state={eventId,startsAt,endsAt,winChance:0.3,winAmount:50000,loseAmount:30000,cooldownMs:300000}
    await c.query("INSERT INTO trevo_settings(key,value,updated_at) VALUES('trick_boxes_event',$1::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",[JSON.stringify(state)])
    await c.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)',[eventId,JSON.stringify(state)])
    console.log('[TRICK BOXES EVENT] active',JSON.stringify(state))
   }else console.log('[TRICK BOXES EVENT] already started',JSON.stringify(previous.rows[0].value))
   await c.query('COMMIT')
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }catch(e){console.error('[TRICK BOXES EVENT] failed',e?.stack||e)}
},21000).unref?.()


// Estorno isolado e idempotente: compra acidental de 99 Espadas de Aço pelo João Pedro
// em 12/10/2026, 15h31 BRT. Não altera preços, loot ou regras globais.
setTimeout(async () => {
  const tag='[REFUND JP 2026-10-12 15:31]'
  const jid='5511987308687@s.whatsapp.net'
  const marker='refund:joao_pedro:2026-10-12:1531:espada_aco_x99'
  const itemId='espada_aco'
  const quantity=99
  const amount=1188000
  let client
  try {
    const {db}=await import('./db.js')
    client=await db.connect()
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[marker])
    const already=await client.query('SELECT value FROM trevo_settings WHERE key=$1',[marker])
    if(already.rowCount){
      console.log(tag,'ALREADY_APPLIED',JSON.stringify(already.rows[0].value))
      await client.query('COMMIT')
      return
    }
    const start=Math.floor(Date.parse('2026-10-12T15:30:00-03:00')/1000)
    const end=Math.floor(Date.parse('2026-10-12T15:34:00-03:00')/1000)
    const purchases=await client.query(
      "SELECT id,created_at FROM transactions WHERE from_jid=$1 AND to_jid='shop' AND amount=$2 AND type='purchase' AND note=$3 AND created_at BETWEEN $4 AND $5 ORDER BY id FOR UPDATE",
      [jid,amount,itemId+' x'+quantity,start,end]
    )
    if(purchases.rowCount!==1){
      console.error(tag,'ABORT: purchase not uniquely identified',purchases.rowCount)
      await client.query('ROLLBACK')
      return
    }
    const purchase=purchases.rows[0]
    const wallet=await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])
    const inventory=await client.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])
    const stats=await client.query('SELECT weapon_id FROM stats WHERE jid=$1 FOR UPDATE',[jid])
    const existingQuantity=Number(inventory.rows[0]?.quantity||0)
    if(wallet.rowCount!==1 || stats.rows[0]?.weapon_id===itemId){
      console.error(tag,'ABORT: wallet/equipment mismatch',JSON.stringify({
        walletFound:wallet.rowCount===1,itemEquipped:stats.rows[0]?.weapon_id===itemId
      }))
      await client.query('ROLLBACK')
      return
    }
    // Rastreia vendas posteriores. Se o comprador já vendeu as espadas,
    // desconta integralmente essa receita do estorno, impedindo lucro duplo.
    const related=(await client.query(
      "SELECT id,from_jid,to_jid,amount,type,note FROM transactions WHERE id>$2 AND created_at>=$3 AND (from_jid=$1 OR to_jid=$1) AND note ILIKE $4 ORDER BY id",
      [jid,purchase.id,purchase.created_at,'%'+itemId+'%']
    )).rows
    const sales=related.filter(t=>t.to_jid===jid && t.from_jid==='shop' &&
      ['sale','sale_batch'].includes(t.type) &&
      /^espada_aco x[0-9]+(?:\\||$)/.test(t.note))
    const details=sales.map(t=>{
      const m=String(t.note).match(/^espada_aco x([0-9]+)(?:\\||$)/)
      return {id:String(t.id),quantity:Number(m?.[1]||0),credit:Number(t.amount)}
    })
    const soldTotal=details.reduce((n,x)=>n+x.quantity,0)
    const validSales=details.every(x=>x.quantity>0 && x.credit===x.quantity*6000)
    const market=await client.query(
      'SELECT id FROM market_listings WHERE seller_jid=$1 AND item_id=$2 AND created_at >= $3 LIMIT 1',
      [jid,itemId,purchase.created_at]
    )
    const trades=await client.query(
      'SELECT id FROM item_trade_offers WHERE (from_jid=$1 OR to_jid=$1) AND (offer_item_id=$2 OR request_item_id=$2) AND created_at >= $3 LIMIT 1',
      [jid,itemId,purchase.created_at]
    )
    const removeQty=Math.max(0,quantity-Math.min(soldTotal,quantity))
    const saleOffset=Math.min(soldTotal,quantity)*6000
    const refund=amount-saleOffset
    if(!validSales || related.length!==sales.length || market.rowCount || trades.rowCount || existingQuantity<removeQty){
      console.error(tag,'ABORT: unable to prove advantage-free cancellation',JSON.stringify({
        available:existingQuantity,requiredToRemove:removeQty,
        soldTotal,sales:details,otherRelated:related.filter(t=>!sales.includes(t)).map(t=>({type:t.type,note:t.note,amount:t.amount})),
        marketListings:market.rowCount,tradeOffers:trades.rowCount
      }))
      await client.query('ROLLBACK')
      return
    }
    const removed=await client.query(
      'UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3 AND quantity >= $1 RETURNING quantity',
      [removeQty,jid,itemId]
    )
    if(removed.rowCount!==1) throw new Error('Inventory guard failed')
    const balance=await client.query(
      'UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2 RETURNING cash,bank',
      [refund,jid]
    )
    const reverse=await client.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('shop',$1,$2,'purchase_refund',$3) RETURNING id",
      [jid,refund,'Reversão compra #'+purchase.id+' | espada_aco x99 | descontadas vendas '+Math.min(soldTotal,quantity)+' x R$6000']
    )
    const proof={
      purchaseId:String(purchase.id),refundId:String(reverse.rows[0].id),
      removedQuantity:removeQty,soldQuantityOffset:Math.min(soldTotal,quantity),
      recoveredFromSales:saleOffset,refundedAmount:refund,originalCost:amount,
      remainingQuantity:Number(removed.rows[0].quantity),
      walletCashAfter:String(balance.rows[0].cash),
      walletBankAfter:String(balance.rows[0].bank),
      appliedAt:new Date().toISOString()
    }
    await client.query(
      'INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)',
      [marker,JSON.stringify(proof)]
    )
    await client.query('COMMIT')
    console.log(tag,'SUCCESS',JSON.stringify(proof))
  } catch(error) {
    if(client) await client.query('ROLLBACK').catch(()=>{})
    console.error(tag,'ERROR',error?.stack||error)
  } finally {
    client?.release()
  }
},24000).unref?.()
