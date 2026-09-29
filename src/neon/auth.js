import { BufferJSON, initAuthCreds } from 'baileys'
import { db } from './db.js'

export async function useNeonAuthState(sessionId='default') {
  const r = await db.query(
    'SELECT value FROM auth_creds WHERE session_id=$1 AND key=$2',
    [sessionId,'creds']
  )

  let creds = r.rows[0]?.value
    ? JSON.parse(JSON.stringify(r.rows[0].value), BufferJSON.reviver)
    : initAuthCreds()

  async function saveCreds() {
    const value = JSON.stringify(creds, BufferJSON.replacer)
    await db.query(`
      INSERT INTO auth_creds (session_id,key,value)
      VALUES ($1,'creds',$2::jsonb)
      ON CONFLICT(session_id,key) DO UPDATE
      SET value=EXCLUDED.value, updated_at=NOW()
    `,[sessionId,value])
  }

  if (!r.rows[0]) await saveCreds()

  const keys = {
    async get(type, ids) {
      if (!ids?.length) return {}
      const { rows } = await db.query(`
        SELECT id,value FROM auth_keys
        WHERE session_id=$1 AND type=$2 AND id=ANY($3::text[])
      `,[sessionId,type,ids])
      const out={}
      for (const row of rows) {
        out[row.id]=JSON.parse(JSON.stringify(row.value),BufferJSON.reviver)
      }
      return out
    },
    async set(data) {
      const client=await db.connect()
      try {
        await client.query('BEGIN')
        for (const [type,entries] of Object.entries(data ?? {})) {
          for (const [id,value] of Object.entries(entries ?? {})) {
            if (value) {
              await client.query(`
                INSERT INTO auth_keys (session_id,type,id,value)
                VALUES ($1,$2,$3,$4::jsonb)
                ON CONFLICT(session_id,type,id) DO UPDATE
                SET value=EXCLUDED.value, updated_at=NOW()
              `,[sessionId,type,id,JSON.stringify(value,BufferJSON.replacer)])
            } else {
              await client.query(
                'DELETE FROM auth_keys WHERE session_id=$1 AND type=$2 AND id=$3',
                [sessionId,type,id]
              )
            }
          }
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    }
  }

  return { state:{creds,keys}, saveCreds }
}
