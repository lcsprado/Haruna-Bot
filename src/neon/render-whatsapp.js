import http from 'node:http'

// Entrada dedicada ao WhatsApp. Não injeta módulos de Cidade/NPC/Karma.
const port=Number(process.env.PORT||10000)
const health=globalThis.__trevoHealth||(globalThis.__trevoHealth={whatsapp:'starting',lastChange:Date.now(),lastOpen:0,everConnected:false})

http.createServer((req,res)=>{
  if(req.url==='/health'){
    const connected=health.whatsapp==='open'
    res.writeHead(connected?200:503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
    return res.end(JSON.stringify({ok:connected,service:'alpha-bot-whatsapp',whatsapp:health.whatsapp,lastOpen:health.lastOpen||null}))
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



// Temporary read-only reconciliation of the documented 09/10/2026 loot sale.
// Never sends WhatsApp messages and does not mutate player records.
setTimeout(async()=>{
  try{
    const {db}=await import('./db.js')
    const jid='5511987308687@s.whatsapp.net'
    const player=(await db.query(
      "SELECT jid,push_name,pn FROM users WHERE jid=$1 OR pn=$1 OR (push_name ILIKE '%João Pedro%' AND jid LIKE '5511%') LIMIT 5",
      [jid]
    )).rows
    const ids=[...new Set([...player.map(x=>x.jid),jid])]
    for(const id of ids){
      const [wallet,businesses,inventory,txs,recovery]=await Promise.all([
        db.query("SELECT cash,bank FROM wallets WHERE jid=$1",[id]),
        db.query("SELECT business_id,price_paid,acquired_at,last_collected_at,level FROM user_businesses WHERE jid=$1 ORDER BY acquired_at",[id]),
        db.query("SELECT item_id,quantity FROM inventories WHERE jid=$1 AND item_id='nucleo_alpha_corrompido'",[id]),
        db.query("SELECT id,type,from_jid,to_jid,amount,note,created_at FROM transactions WHERE (from_jid=$1 OR to_jid=$1) AND created_at >= $2 ORDER BY id DESC LIMIT 90",
          [id,Math.floor(Date.parse('2026-10-09T20:15:00-03:00')/1000)]),
        db.query("SELECT value FROM trevo_settings WHERE key=$1",['economy_recovery:'+id])
      ])
      console.log('[JP ECONOMY AUDIT]',JSON.stringify({
        id,matchedNames:player.filter(x=>x.jid===id).map(x=>x.push_name),
        wallet:wallet.rows,businesses:businesses.rows,inventory:inventory.rows,
        txs:txs.rows,recovery:recovery.rows
      }))
    }
  }catch(err){ console.error('[JP ECONOMY AUDIT FAILED]',err?.stack||err) }
},12000).unref?.()


// One-time, idempotent reconciliation of the specific documented sale 5068
// and shopping purchase 5069. No WhatsApp announcements are sent.
// A row-locked durable marker prevents a second application after restart.
setTimeout(async()=>{
  const {db}=await import('./db.js')
  const jid='5511987308687@s.whatsapp.net'
  const repairKey='repair:jp:2026-10-09:raid_sale_5068:shopping_5069'
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    await client.query(
      "INSERT INTO trevo_settings(key,value) VALUES($1,'{}'::jsonb) ON CONFLICT(key) DO NOTHING",
      [repairKey]
    )
    const marker=(await client.query(
      'SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[repairKey]
    )).rows[0]?.value
    if(marker?.completed){
      await client.query('COMMIT')
      console.log('[JP ECONOMY REPAIR] already completed; no changes')
      return
    }
    const txs=(await client.query(
      'SELECT id,type,from_jid,to_jid,amount,note,created_at FROM transactions WHERE id=ANY($1::bigint[]) FOR UPDATE',
      [[5068,5069]]
    )).rows
    const sale=txs.find(t=>Number(t.id)===5068)
    const purchase=txs.find(t=>Number(t.id)===5069)
    if(!sale||sale.type!=='sale'||sale.from_jid!=='shop'||sale.to_jid!==jid||
       Number(sale.amount)!==10900000||
       sale.note!=='nucleo_alpha_corrompido x109|base:10900000|upgrade_refund:0|lv:1'){
      throw new Error('sale 5068 mismatch; abort')
    }
    if(!purchase||purchase.type!=='business_purchase'||purchase.from_jid!==jid||
       purchase.to_jid!=='system'||Number(purchase.amount)!==12000000||
       purchase.note!=='Shopping Center'||Number(purchase.created_at)<Number(sale.created_at)){
      throw new Error('purchase 5069 mismatch; abort')
    }
    const business=(await client.query(
      "SELECT id,business_id,price_paid,acquired_at,last_collected_at,level FROM user_businesses WHERE jid=$1 AND business_id='shopping' FOR UPDATE",
      [jid]
    )).rows[0]
    if(!business || Number(business.price_paid)!==12000000 ||
       Number(business.acquired_at)!==Number(purchase.created_at) ||
       Number(business.last_collected_at)!==Number(business.acquired_at) ||
       Number(business.level)!==1){
      throw new Error('shopping business or earnings changed; manual review required')
    }
    const before=(await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!before) throw new Error('wallet not found')
    const inv=(await client.query(
      "SELECT quantity FROM inventories WHERE jid=$1 AND item_id='nucleo_alpha_corrompido' FOR UPDATE",
      [jid]
    )).rows[0]
    const deleted=await client.query(
      "DELETE FROM user_businesses WHERE jid=$1 AND id=$2 AND business_id='shopping'",
      [jid,business.id]
    )
    if(deleted.rowCount!==1) throw new Error('business removal failed')
    const inventory=await client.query(
      "INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'nucleo_alpha_corrompido',109) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+109 RETURNING quantity",
      [jid]
    )
    // Reverse R$12m shopping purchase and R$10.9m sale (net +R$1.1m).
    // Restore that net directly to bank: the user's post-sale bank deposit
    // remains intact and cash from subsequent work is untouched.
    const wallet=await client.query(
      'UPDATE wallets SET bank=bank+1100000,updated_at=(EXTRACT(EPOCH FROM NOW())::BIGINT) WHERE jid=$1 RETURNING cash,bank',
      [jid]
    )
    await client.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES ('system',$1,12000000,'business_refund',$2),($1,'system',10900000,'economy_reversal',$3),('system',$1,0,'raid_material_restoration',$4)",
      [jid,'undo shopping purchase tx 5069 / repair 20261009','undo raid item sale tx 5068 / repair 20261009','restore nucleo_alpha_corrompido x109 / repair 20261009']
    )
    const result={
      completed:true,at:Math.floor(Date.now()/1000),
      sourceSaleId:5068,sourcePurchaseId:5069,
      restoredMaterial:'nucleo_alpha_corrompido',restoredQuantity:109,
      previousMaterialQuantity:Number(inv?.quantity||0),
      afterMaterialQuantity:Number(inventory.rows[0]?.quantity||0),
      shoppingRemoved:true,shoppingAccruedProfit:0,
      bankBefore:Number(before.bank),bankAfter:Number(wallet.rows[0]?.bank),
      cashBefore:Number(before.cash),cashAfter:Number(wallet.rows[0]?.cash)
    }
    await client.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=(EXTRACT(EPOCH FROM NOW())::BIGINT) WHERE key=$1',[repairKey,JSON.stringify(result)])
    await client.query('COMMIT')
    console.log('[JP ECONOMY REPAIR] COMPLETED',JSON.stringify(result))
  }catch(err){
    await client.query('ROLLBACK').catch(()=>{})
    console.error('[JP ECONOMY REPAIR] BLOCKED; no partial write',err?.message||err)
  }finally{
    client.release()
  }
},18000).unref?.()
