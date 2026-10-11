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
