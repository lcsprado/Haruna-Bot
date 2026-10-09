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





// Temporary read-only audit of live Raid item catalog and historic sale totals.
// Never modifies wallet, inventory, player, Raid, or WhatsApp messages.
setTimeout(async()=>{
  try {
    const {db}=await import('./db.js')
    const items=(await db.query(`
      SELECT id,name,category,rarity,price,sellable,
        CASE WHEN price>0 THEN GREATEST(1,FLOOR(price*.5))
             WHEN rarity='legendary' THEN 100000
             WHEN rarity='epic' THEN 25000
             WHEN rarity='rare' THEN 7500
             WHEN rarity='uncommon' THEN 2500
             ELSE 500 END AS nominal_sell
      FROM items
      WHERE id LIKE 'chave_raid_%'
         OR id=ANY(ARRAY['nucleo_pedra','escama_vulcanica','olho_abissal',
           'nucleo_titan','essencia_rei_abissal','fragmento_celestial',
           'nucleo_alpha_corrompido','fragmento_caos','coroa_abissal',
           'essencia_eclipse'])
      ORDER BY id
    `)).rows
    const sales=(await db.query(`
      SELECT split_part(note,' ',1) AS item_id,COUNT(*)::int AS operations,
         SUM(amount)::bigint AS total_paid,
         STRING_AGG(DISTINCT created_at::text,',') AS timestamps
      FROM transactions
      WHERE type='sale'
        AND split_part(note,' ',1) = ANY(ARRAY[
          'nucleo_pedra','escama_vulcanica','olho_abissal',
          'nucleo_titan','essencia_rei_abissal','fragmento_celestial',
          'nucleo_alpha_corrompido','fragmento_caos','coroa_abissal',
          'essencia_eclipse'])
      GROUP BY 1 ORDER BY total_paid DESC
    `)).rows
    console.log('[RAID PRICE AUDIT]',JSON.stringify({items,sales}))
  }catch(err){console.error('[RAID PRICE AUDIT FAILED]',err?.message||err)}
},10000).unref?.()
