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










// one-time JP 109 raid core inventory audit
setTimeout(async()=>{
  try{
    const {db}=await import('./db.js')
    const jid='5511987308687@s.whatsapp.net'
    const [item,identity,marker,transactions,inv,raidMaterials]=await Promise.all([
      db.query("SELECT i.jid,i.item_id,i.quantity,it.name,it.category,it.sellable,i.created_at FROM inventories i LEFT JOIN items it ON it.id=i.item_id WHERE i.jid=$1 AND i.item_id=$2",[jid,'nucleo_alpha_corrompido']),
      db.query('SELECT jid,push_name FROM users WHERE jid=$1 OR push_name ILIKE $2 ORDER BY jid',[jid,'%João Pedro%']),
      db.query('SELECT key,value FROM trevo_settings WHERE key=$1',['repair:jp:2026-10-09:raid_sale_5068:shopping_5069']),
      db.query("SELECT id,type,note,amount,created_at FROM transactions WHERE (to_jid=$1 OR from_jid=$1) AND (note ILIKE '%nucleo_alpha_corrompido%' OR note ILIKE '%5068%' OR type='raid_material_restoration') ORDER BY id DESC LIMIT 35",[jid]),
      db.query('SELECT item_id,quantity FROM inventories WHERE jid=$1 ORDER BY item_id',[jid]),
      db.query("SELECT i.item_id,i.quantity,it.name FROM inventories i JOIN items it ON it.id=i.item_id WHERE i.jid=$1 AND (i.item_id LIKE '%nucleo%' OR it.name ILIKE '%fragmento%') ORDER BY i.item_id",[jid])
    ])
    const clipped=inv.rows.filter(row=>['nucleo_alpha_corrompido','fragmento_caos','fragmento_celestial'].includes(row.item_id))
    console.log('[JP109 AUDIT]',JSON.stringify({item:item.rows,identities:identity.rows,repair:marker.rows,transactions:transactions.rows,inventoryHighlights:clipped,similarItems:raidMaterials.rows}))
  }catch(error){console.error('[JP109 AUDIT ERROR]',error?.stack||error)}
},8000).unref?.()
