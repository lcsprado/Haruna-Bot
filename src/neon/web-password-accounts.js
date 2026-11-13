
import {
  normalizeWebUsername,assertWebPassword,normalizeWebCode,
  makeWebPassword,verifyWebPassword,fakeWebPasswordVerification,webSessionToken,webTokenHash
} from './web-password-auth.js'

const SESSION_TTL_MS=30*24*60*60*1000
const WINDOW_MS=15*60*1000
let readyPromise

export function ensureWebPasswordTables(db){
  if(!readyPromise){
    readyPromise=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS web_password_accounts(
          jid TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          chat_jid TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS web_password_accounts_username_idx
          ON web_password_accounts(username);
        CREATE TABLE IF NOT EXISTS web_auth_rate_limits(
          scope_hash TEXT PRIMARY KEY,
          window_started_at BIGINT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        );
      `)
      return true
    })().catch(err=>{readyPromise=null;throw err})
  }
  return readyPromise
}

async function readCode(client,code){
  const normalized=normalizeWebCode(code)
  const codeHash=webTokenHash(normalized)
  const row=(await client.query(
    'SELECT jid,chat_jid,used_at,expires_at FROM web_link_codes WHERE code_hash=$1 FOR UPDATE',
    [codeHash]
  )).rows[0]
  if(!row||row.used_at||Number(row.expires_at)<=Date.now())
    throw new Error('Código inválido ou expirado. Envie !web no WhatsApp para gerar outro.')
  return {codeHash,jid:row.jid,chatJid:row.chat_jid||null}
}

async function issueSession(client,jid,chatJid){
  const token=webSessionToken()
  const now=Date.now()
  const expiresAt=now+SESSION_TTL_MS
  await client.query(
    'INSERT INTO web_sessions(token_hash,jid,chat_jid,expires_at,created_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$5)',
    [webTokenHash(token),jid,chatJid||null,expiresAt,now]
  )
  return {token,expiresAt,groupLinked:Boolean(chatJid)}
}

export async function getWebCodeMode(db,code){
  await ensureWebPasswordTables(db)
  const hash=webTokenHash(normalizeWebCode(code))
  const row=(await db.query(`
    SELECT l.jid, a.jid AS registered
    FROM web_link_codes l
    LEFT JOIN web_password_accounts a ON a.jid=l.jid
    WHERE l.code_hash=$1 AND l.used_at IS NULL AND l.expires_at>$2
  `,[hash,Date.now()])).rows[0]
  if(!row)throw new Error('Código inválido ou expirado. Envie !web no WhatsApp para gerar outro.')
  return {mode:row.registered?'recover':'register'}
}

export async function registerWebPassword(db,{code,username,password}){
  await ensureWebPasswordTables(db)
  const normalizedUsername=normalizeWebUsername(username)
  const secret=await makeWebPassword(password)
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const link=await readCode(client,code)
    const account=(await client.query('SELECT jid FROM web_password_accounts WHERE jid=$1',[link.jid])).rows[0]
    if(account)throw new Error('Esta conta já tem senha. Use recuperação com o código !web.')
    const oldGroup=link.chatJid||(await client.query(
      'SELECT chat_jid FROM web_sessions WHERE jid=$1 AND chat_jid IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1',[link.jid]
    )).rows[0]?.chat_jid||null
    const stamp=Date.now()
    await client.query(`
      INSERT INTO web_password_accounts(jid,username,password_hash,password_salt,chat_jid,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$6)
    `,[link.jid,normalizedUsername,secret.passwordHash,secret.passwordSalt,oldGroup,stamp])
    await client.query('UPDATE web_link_codes SET used_at=$1 WHERE code_hash=$2',[stamp,link.codeHash])
    // Um cadastro novo invalida TODAS as sessoes antigas que nunca exigiram senha.
    await client.query('DELETE FROM web_sessions WHERE jid=$1',[link.jid])
    const session=await issueSession(client,link.jid,oldGroup)
    await client.query('COMMIT')
    return {...session,username:normalizedUsername}
  }catch(err){
    await client.query('ROLLBACK').catch(()=>{})
    if(err?.code==='23505')throw new Error('Nome de usuário indisponível. Escolha outro.')
    throw err
  }finally{client.release()}
}

export async function recoverWebPassword(db,{code,password}){
  await ensureWebPasswordTables(db)
  const secret=await makeWebPassword(password)
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const link=await readCode(client,code)
    const account=(await client.query(
      'SELECT username,chat_jid FROM web_password_accounts WHERE jid=$1 FOR UPDATE',[link.jid]
    )).rows[0]
    if(!account)throw new Error('Conta ainda não cadastrada. Use Primeiro acesso.')
    const group=link.chatJid||account.chat_jid||null
    const stamp=Date.now()
    await client.query(`
      UPDATE web_password_accounts
      SET password_hash=$1,password_salt=$2,chat_jid=$3,updated_at=$4 WHERE jid=$5
    `,[secret.passwordHash,secret.passwordSalt,group,stamp,link.jid])
    await client.query('UPDATE web_link_codes SET used_at=$1 WHERE code_hash=$2',[stamp,link.codeHash])
    await client.query('DELETE FROM web_sessions WHERE jid=$1',[link.jid])
    const session=await issueSession(client,link.jid,group)
    await client.query('COMMIT')
    return {...session,username:account.username}
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}
  finally{client.release()}
}

async function enforceLoginRate(db,scope,limit){
  const hash=webTokenHash('web-auth-v1:'+scope)
  const stamp=Date.now()
  const result=await db.query(`
    INSERT INTO web_auth_rate_limits(scope_hash,window_started_at,attempts)
    VALUES($1,$2,1)
    ON CONFLICT(scope_hash) DO UPDATE SET
      attempts=CASE WHEN web_auth_rate_limits.window_started_at<$3 THEN 1
                    ELSE web_auth_rate_limits.attempts+1 END,
      window_started_at=CASE WHEN web_auth_rate_limits.window_started_at<$3 THEN $2
                             ELSE web_auth_rate_limits.window_started_at END
    RETURNING attempts
  `,[hash,stamp,stamp-WINDOW_MS])
  if(Number(result.rows[0]?.attempts||0)>limit)
    throw new Error('Muitas tentativas. Tente novamente em 15 minutos ou recupere via !web.')
  return hash
}

export async function loginWebPassword(db,{username,password,ip='unknown'}){
  await ensureWebPasswordTables(db)
  let normalized
  try{normalized=normalizeWebUsername(username)}
  catch{
    await fakeWebPasswordVerification(password)
    throw new Error('Usuário ou senha incorretos.')
  }
  const ipKey=String(ip).slice(0,100)
  const [userRate,comboRate]=await Promise.all([
    enforceLoginRate(db,'user:'+normalized,30),
    enforceLoginRate(db,'userip:'+normalized+':'+ipKey,8)
  ])
  const account=(await db.query(`
    SELECT jid,username,password_hash,password_salt,chat_jid
    FROM web_password_accounts WHERE username=$1
  `,[normalized])).rows[0]
  const correct=account
    ?await verifyWebPassword(password,account.password_salt,account.password_hash)
    :(await fakeWebPasswordVerification(password),false)
  if(!correct)throw new Error('Usuário ou senha incorretos.')
  await db.query('DELETE FROM web_auth_rate_limits WHERE scope_hash=ANY($1::text[])',[userRate,comboRate]).catch(()=>{})
  const token=webSessionToken(),stamp=Date.now(),expiresAt=stamp+SESSION_TTL_MS
  await db.query(`
    INSERT INTO web_sessions(token_hash,jid,chat_jid,expires_at,created_at,last_seen_at)
    VALUES($1,$2,$3,$4,$5,$5)
  `,[webTokenHash(token),account.jid,account.chat_jid||null,expiresAt,stamp])
  return {token,expiresAt,username:account.username,groupLinked:Boolean(account.chat_jid)}
}
