import { BufferJSON, initAuthCreds } from 'baileys'
import { db } from './db.js'

const AUTH_QUERY_TIMEOUT_MS=10000

function parseStored(value){
  return JSON.parse(JSON.stringify(value),BufferJSON.reviver)
}

function encodeStored(value){
  return JSON.stringify(value,BufferJSON.replacer)
}

async function repairCorruptedSenderKeysOnce(sessionId){
  const marker='signal_sender_key_buffer_repair_v1'
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const seen=await client.query(
      "SELECT 1 FROM trevo_settings WHERE key=$1 FOR UPDATE",
      [marker]
    )
    if(seen.rows.length){
      await client.query('COMMIT')
      return
    }

    const removed=await client.query(
      "DELETE FROM auth_keys WHERE session_id=$1 AND type = ANY($2::text[])",
      [sessionId,['sender-key','sender-key-memory']]
    )

    await client.query(`
      INSERT INTO trevo_settings(key,value,updated_at)
      VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
      ON CONFLICT(key) DO UPDATE
      SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
    `,[
      marker,
      JSON.stringify({done:true,sessionId,removed:Number(removed.rowCount||0),at:Date.now()})
    ])

    await client.query('COMMIT')
    console.warn('[WhatsApp] reparo Signal: chaves temporárias de grupo removidas:',Number(removed.rowCount||0))
  }catch(err){
    await client.query('ROLLBACK').catch(()=>{})
    throw err
  }finally{
    client.release()
  }
}

export async function useNeonAuthState(sessionId='default') {
  await repairCorruptedSenderKeysOnce(sessionId)
  const [credsResult,keysResult] = await Promise.all([
    db.query({
      text:'SELECT value FROM auth_creds WHERE session_id=$1 AND key=$2',
      values:[sessionId,'creds'],
      query_timeout:AUTH_QUERY_TIMEOUT_MS
    }),
    db.query({
      text:'SELECT type,id,value FROM auth_keys WHERE session_id=$1',
      values:[sessionId],
      query_timeout:AUTH_QUERY_TIMEOUT_MS
    })
  ])

  let creds = credsResult.rows[0]?.value
    ? parseStored(credsResult.rows[0].value)
    : initAuthCreds()

  // Warm in-memory mirror. Baileys asks for Signal keys constantly; serving
  // reads from RAM avoids putting Neon network latency inside its message mutex.
  const keyCache=new Map()
  for(const row of keysResult.rows){
    keyCache.set(`${row.type}\0${row.id}`,parseStored(row.value))
  }

  async function saveCreds() {
    const value = encodeStored(creds)
    await db.query({
      text:`
        INSERT INTO auth_creds (session_id,key,value)
        VALUES ($1,'creds',$2::jsonb)
        ON CONFLICT(session_id,key) DO UPDATE
        SET value=EXCLUDED.value, updated_at=NOW()
      `,
      values:[sessionId,value],
      query_timeout:AUTH_QUERY_TIMEOUT_MS
    })
  }

  if (!credsResult.rows[0]) await saveCreds()

  const keys = {
    async get(type, ids) {
      const out={}
      for(const id of ids ?? []){
        const value=keyCache.get(`${type}\0${id}`)
        if(value!==undefined) out[id]=value
      }
      return out
    },

    async set(data) {
      const upserts=[]
      const deletes=[]

      for (const [type,entries] of Object.entries(data ?? {})) {
        for (const [id,value] of Object.entries(entries ?? {})) {
          if(value) upserts.push({type,id,value:encodeStored(value)})
          else deletes.push({type,id})
        }
      }

      if(!upserts.length && !deletes.length) return

      const client=await db.connect()
      try {
        await client.query('BEGIN')
        await client.query("SET LOCAL statement_timeout = '8000ms'")
        await client.query("SET LOCAL lock_timeout = '3000ms'")

        if(upserts.length){
          await client.query(`
            INSERT INTO auth_keys (session_id,type,id,value)
            SELECT $1,u.type,u.id,u.value::jsonb
            FROM UNNEST($2::text[],$3::text[],$4::text[]) AS u(type,id,value)
            ON CONFLICT(session_id,type,id) DO UPDATE
            SET value=EXCLUDED.value, updated_at=NOW()
          `,[
            sessionId,
            upserts.map(x=>x.type),
            upserts.map(x=>x.id),
            upserts.map(x=>x.value)
          ])
        }

        if(deletes.length){
          await client.query(`
            DELETE FROM auth_keys a
            USING UNNEST($2::text[],$3::text[]) AS d(type,id)
            WHERE a.session_id=$1
              AND a.type=d.type
              AND a.id=d.id
          `,[
            sessionId,
            deletes.map(x=>x.type),
            deletes.map(x=>x.id)
          ])
        }

        await client.query('COMMIT')

        // Update RAM only after persistence succeeds so memory and Neon never
        // knowingly diverge after a rolled-back transaction.
        for(const x of upserts){
          keyCache.set(`${x.type}\0${x.id}`,parseStored(JSON.parse(x.value)))
        }
        for(const x of deletes){
          keyCache.delete(`${x.type}\0${x.id}`)
        }
      } catch (e) {
        await client.query('ROLLBACK').catch(()=>{})
        throw e
      } finally {
        client.release()
      }
    }
  }

  console.log('[WhatsApp] auth Neon carregado em memória:',keyCache.size,'chaves')
  return { state:{creds,keys}, saveCreds }
}
