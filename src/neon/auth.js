import { BufferJSON, initAuthCreds } from 'baileys'
import { db } from './db.js'
import {createSerializedSaver} from './resource-guards.js'
import {countBandwidth} from './bandwidth.js'
import {planAuthJsonPatch,authPatchQuery} from './auth-patch.js'

const AUTH_QUERY_TIMEOUT_MS=10000

function parseStored(value){
  return JSON.parse(JSON.stringify(value),BufferJSON.reviver)
}

function encodeStored(value){
  return JSON.stringify(value,BufferJSON.replacer)
}

async function repairCorruptedSenderKeysOnce(sessionId,queryable=db){
  const marker='signal_sender_key_buffer_repair_v1'
  const client=await queryable.connect()
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

export async function useNeonAuthState(sessionId='default',queryable=db) {
  await repairCorruptedSenderKeysOnce(sessionId,queryable)
  const [credsResult,keysResult] = await Promise.all([
    queryable.query({
      text:'SELECT value FROM auth_creds WHERE session_id=$1 AND key=$2',
      values:[sessionId,'creds'],
      query_timeout:AUTH_QUERY_TIMEOUT_MS
    }),
    queryable.query({
      text:'SELECT type,id,value,md5(value::text) AS revision FROM auth_keys WHERE session_id=$1',
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
  // Keep committed encodings separate: Baileys can mutate objects returned by get().
  const persistedKeys=new Map()
  const persistedRevisions=new Map()
  const keySizes=new Map()
  for(const row of keysResult.rows){
    const key=`${row.type}\0${row.id}`
    const value=parseStored(row.value)
    keyCache.set(key,value)
    const encoded=encodeStored(value)
    persistedKeys.set(key,encoded)
    if(row.revision)persistedRevisions.set(key,row.revision)
    const bytes=Buffer.byteLength(encoded),summary=keySizes.get(row.type)||{type:row.type,count:0,bytes:0,maxBytes:0}
    summary.count++;summary.bytes+=bytes;summary.maxBytes=Math.max(summary.maxBytes,bytes)
    keySizes.set(row.type,summary)
  }

  const saveCredSnapshot=createSerializedSaver(credsResult.rows[0]?encodeStored(creds):null,async value=>{
    await queryable.query({
      text:`
        INSERT INTO auth_creds (session_id,key,value)
        VALUES ($1,'creds',$2::jsonb)
        ON CONFLICT(session_id,key) DO UPDATE
        SET value=EXCLUDED.value, updated_at=NOW()
      `,
      values:[sessionId,value],
      query_timeout:AUTH_QUERY_TIMEOUT_MS
    })
    countBandwidth('authWrites')
    countBandwidth('authFullValueJsonBytes',Buffer.byteLength(value))
    countBandwidth('authValueJsonBytesSubmitted',Buffer.byteLength(value))
  },{onSkip:()=>countBandwidth('authSkipped')})
  const saveCreds=()=>saveCredSnapshot(encodeStored(creds))

  if (!credsResult.rows[0]) await saveCreds()

  let keyWriteQueue=Promise.resolve()
  const keys = {
    async get(type, ids) {
      const out={}
      for(const id of ids ?? []){
        const value=keyCache.get(`${type}\0${id}`)
        if(value!==undefined) out[id]=value
      }
      return out
    },

    set(data) {
      // Snapshot now, persist in call order. Never delay or drop changed key material.
      const snapshot=[]
      for(const [type,entries] of Object.entries(data??{})){
        for(const [id,value] of Object.entries(entries??{})){
          snapshot.push({type,id,value:value?encodeStored(value):null})
        }
      }
      const queuedAt=Date.now()
      const write=keyWriteQueue.then(()=>persistKeys(snapshot))
      keyWriteQueue=write.catch(()=>{})
      return write.finally(()=>{
        const durationMs=Date.now()-queuedAt
        if(durationMs>=750) console.warn('[AuthKeyWriteLatency]',JSON.stringify({
          ms:durationMs,entries:snapshot.length
        }))
      })
    }
  }

  async function persistKeys(snapshot){
      const upserts=[]
      const deletes=[]
      for(const entry of snapshot){
        const key=`${entry.type}\0${entry.id}`
        if(entry.value!==null){
          if(persistedKeys.get(key)!==entry.value)upserts.push(entry)
          else countBandwidth('authSkipped')
        }else if(persistedKeys.has(key))deletes.push(entry)
      }

      if(!upserts.length && !deletes.length) return

      const client=await queryable.connect()
      try {
        await client.query('BEGIN')
        await client.query("SET LOCAL statement_timeout = '8000ms'")
        await client.query("SET LOCAL lock_timeout = '3000ms'")

        const fullUpserts=[],revisions=new Map()
        let semanticNoops=0,patchWrites=0
        for(const entry of upserts){
          const key=`${entry.type}\0${entry.id}`
          countBandwidth('authFullValueJsonBytes',Buffer.byteLength(entry.value))
          const revision=persistedRevisions.get(key)
          const plan=revision?planAuthJsonPatch(persistedKeys.get(key),entry.value):null
          if(!plan){fullUpserts.push(entry);continue}
          if(!plan.operations.length){semanticNoops++;countBandwidth('authSkipped');continue}
          countBandwidth('authValueJsonBytesSubmitted',plan.valueJsonBytes)
          const result=await client.query(authPatchQuery(sessionId,entry.type,entry.id,revision,plan.operations))
          if(result.rows[0]){revisions.set(key,result.rows[0].revision);patchWrites++}
          else{
            // A changed/missing database revision gets exactly the original full upsert.
            countBandwidth('authPatchFallbacks')
            fullUpserts.push(entry)
          }
        }
        if(fullUpserts.length){
          for(const entry of fullUpserts)countBandwidth('authValueJsonBytesSubmitted',Buffer.byteLength(entry.value))
          const result=await client.query(`
            INSERT INTO auth_keys (session_id,type,id,value)
            SELECT $1,u.type,u.id,u.value::jsonb
            FROM UNNEST($2::text[],$3::text[],$4::text[]) AS u(type,id,value)
            ON CONFLICT(session_id,type,id) DO UPDATE
            SET value=EXCLUDED.value, updated_at=NOW()
            RETURNING type,id,md5(value::text) AS revision
          `,[
            sessionId,
            fullUpserts.map(x=>x.type),
            fullUpserts.map(x=>x.id),
            fullUpserts.map(x=>x.value)
          ])
          for(const row of result.rows)revisions.set(`${row.type}\0${row.id}`,row.revision)
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
        countBandwidth('authWrites',upserts.length+deletes.length-semanticNoops)
        countBandwidth('authPatchWrites',patchWrites)

        // Update RAM only after persistence succeeds so memory and Neon never
        // knowingly diverge after a rolled-back transaction.
        for(const x of upserts){
          keyCache.set(`${x.type}\0${x.id}`,parseStored(JSON.parse(x.value)))
          persistedKeys.set(`${x.type}\0${x.id}`,x.value)
          if(revisions.has(`${x.type}\0${x.id}`))persistedRevisions.set(`${x.type}\0${x.id}`,revisions.get(`${x.type}\0${x.id}`))
        }
        for(const x of deletes){
          keyCache.delete(`${x.type}\0${x.id}`)
          persistedKeys.delete(`${x.type}\0${x.id}`)
          persistedRevisions.delete(`${x.type}\0${x.id}`)
        }
      } catch (e) {
        await client.query('ROLLBACK').catch(()=>{})
        throw e
      } finally {
        client.release()
      }
  }

  console.log('[WhatsApp] auth Neon carregado em memória:',keyCache.size,'chaves')
  console.log('[Auth bandwidth]',JSON.stringify({types:[...keySizes.values()].sort((a,b)=>b.bytes-a.bytes)}))
  return { state:{creds,keys}, saveCreds }
}
