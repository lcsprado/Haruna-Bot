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
