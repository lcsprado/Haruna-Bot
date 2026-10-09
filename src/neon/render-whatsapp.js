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






// Temporary read-only inspection of the 16 historic sale operations.
// Scoped to Raid material sale IDs only; no player data mutation or messages.
setTimeout(async()=>{
  try {
    const {db}=await import('./db.js')
    const ids=['nucleo_pedra','escama_vulcanica','olho_abissal','nucleo_titan','essencia_rei_abissal',
      'fragmento_celestial','nucleo_alpha_corrompido','fragmento_caos','coroa_abissal','essencia_eclipse']
    const sales=(await db.query(`
      SELECT t.id,t.to_jid AS jid,COALESCE(u.push_name,'') AS player,t.amount,t.note,t.created_at
      FROM transactions t LEFT JOIN users u ON u.jid=t.to_jid
      WHERE t.type='sale' AND split_part(t.note,' ',1)=ANY($1::text[])
      ORDER BY t.id
    `,[ids])).rows
    const players=[...new Set(sales.map(s=>s.jid))]
    const playersData=[]
    for(const jid of players){
      const [wallet,biz,inv,related,recovery,summary]=await Promise.all([
        db.query('SELECT cash,bank FROM wallets WHERE jid=$1',[jid]),
        db.query('SELECT business_id,price_paid,acquired_at,last_collected_at,level FROM user_businesses WHERE jid=$1 ORDER BY acquired_at',[jid]),
        db.query('SELECT item_id,quantity FROM inventories WHERE jid=$1 AND item_id=ANY($2::text[])',[jid,ids]),
        db.query(`SELECT id,type,amount,note,created_at,
          CASE WHEN from_jid=$1 THEN 'debit' ELSE 'credit' END AS direction
          FROM transactions WHERE from_jid=$1 OR to_jid=$1 ORDER BY id DESC LIMIT 60`,[jid]),
        db.query('SELECT key,value FROM trevo_settings WHERE key=$1 OR key LIKE $2',[ 'economy_recovery:'+jid,'repair:%']),
        db.query(`SELECT type,COUNT(*)::int AS count,SUM(amount)::bigint AS amount
           FROM transactions WHERE (from_jid=$1 OR to_jid=$1) AND created_at>=1790900000
           GROUP BY type ORDER BY SUM(amount) DESC LIMIT 30`,[jid])
      ])
      playersData.push({jid,player:sales.find(s=>s.jid===jid)?.player,
        wallet:wallet.rows[0],businesses:biz.rows,materials:inv.rows,
        recentTransactions:related.rows,recovery:recovery.rows.filter(x=>x.key==='economy_recovery:'+jid),
        txnSummary:summary.rows})
    }
    console.log('[RAID HISTORIC AUDIT]',JSON.stringify({sales,playersData}))
  }catch(err){ console.error('[RAID HISTORIC AUDIT FAILED]',err?.stack||err) }
},9000).unref?.()
