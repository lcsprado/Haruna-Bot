import crypto from 'node:crypto'
import net from 'node:net'

// O banco compartilha o limite entre processos e reinicios. Nenhum IP e persistido.
const WINDOW_MS=5*60*1000
const CLIENT_LIMIT=15
const GLOBAL_LIMIT=300

export function webAuthClientIp(req){
  const peer=String(req?.socket?.remoteAddress||'').trim()
  const forwarded=String(req?.headers?.['x-forwarded-for']||'')
  // O proxy acrescenta seu ultimo hop; o primeiro pode ter sido forjado.
  const last=forwarded.split(',').map(x=>x.trim()).filter(Boolean).at(-1)||''
  const candidate=net.isIP(last)?last:peer
  return net.isIP(candidate)?candidate.toLowerCase():'unidentified-peer'
}
export function webAuthThrottleKey(scope,identity,secret){
  return crypto.createHmac('sha256',String(secret||'alpha-web-local-only'))
    .update(String(scope)+'\0'+String(identity)).digest('hex')
}
function throttleError(started,at){
  const err=new Error('Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.')
  err.code='WEB_AUTH_RATE_LIMITED'
  err.retryAfterSeconds=Math.max(1,Math.ceil((started+WINDOW_MS-at)/1000))
  return err
}
export async function consumeWebAuthAttempt(db,req,at=Date.now(),secret=process.env.WEB_MEMBER_TOKEN_SECRET||process.env.DATABASE_URL||'alpha-web-local-only'){
  const now=Number(at)
  if(!Number.isFinite(now)||now<0)throw new Error('Relogio invalido para acesso Web.')
  const windowStart=Math.floor(now/WINDOW_MS)*WINDOW_MS
  // Primeiro por IP, depois global: excedentes de um unico IP nao esgotam a cota de todos.
  const limits=[['client',webAuthClientIp(req),CLIENT_LIMIT],['global','all',GLOBAL_LIMIT]]
  for(const [scope,identity,max] of limits){
    const hash=webAuthThrottleKey(scope,identity,secret)
    // O UPSERT trava a chave dentro do PostgreSQL e incrementa atomicamente.
    const {rows}=await db.query(`
      INSERT INTO web_auth_rate_limits(scope_hash,window_started_at,attempts)
      VALUES($1,$2,1)
      ON CONFLICT(scope_hash) DO UPDATE SET
        attempts=CASE WHEN web_auth_rate_limits.window_started_at=$2
          THEN web_auth_rate_limits.attempts+1 ELSE 1 END,
        window_started_at=$2
      RETURNING attempts
    `,[hash,windowStart])
    if(Number(rows?.[0]?.attempts||0)>max)throw throttleError(windowStart,now)
  }
  return {allowed:true}
}
