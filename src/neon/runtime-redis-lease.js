// Exclusive WhatsApp lease in Upstash Redis REST; never store game balances here.
// Deployment sequence: postgres (existing) -> dual -> redis.
// A rolling deploy from a postgres-only release MUST NOT switch directly to redis-only.
import crypto from 'node:crypto'

const TTL_MS = 60000
const RENEW_MS = 15000
const REQUEST_TIMEOUT_MS = 5000
const RENEW_SCRIPT = "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end"
const leaseState = {active:false,owner:null,timer:null}

async function command(parts){
  const url=String(process.env.UPSTASH_REDIS_REST_URL||'').trim().replace(/\/$/,'')
  const token=String(process.env.UPSTASH_REDIS_REST_TOKEN||'').trim()
  if(!url.startsWith('https://')||!token)throw new Error('UPSTASH_REDIS_REST_URL/TOKEN não configurados (falha segura)')
  const response=await fetch(url,{
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify(parts),
    signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if(!response.ok) throw new Error('Upstash HTTP '+response.status)
  const json=await response.json()
  if(json.error)throw new Error('Upstash command error: '+String(json.error).slice(0,180))
  return json.result
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))

// Fail closed: lost lease, network failure, or unexpected scheduler delay
// terminates this worker instead of continuing to operate as another instance.
export async function acquireRedisRuntimeLease(sessionId){
  if(leaseState.active) return true
  const name='alpha:whatsapp:lease:'+crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0,32)
  const owner=crypto.randomUUID()
  while(true){
    const ok=await command(['SET',name,owner,'NX','PX',TTL_MS])
    if(ok==='OK')break
    await sleep(2500)
  }
  leaseState.active=true
  leaseState.owner=owner
  let lastConfirmedAt=Date.now()
  let checking=false
  const lose=err=>{
    if(!leaseState.active)return
    leaseState.active=false
    clearInterval(leaseState.timer)
    console.error('[Runtime Redis] exclusividade perdida; encerrando para impedir instâncias simultâneas',err?.message||err)
    process.exit(1)
  }
  leaseState.timer=setInterval(async()=>{
    if(!leaseState.active)return
    if(Date.now()-lastConfirmedAt>TTL_MS-RENEW_MS)return lose('renovação atrasada')
    if(checking)return
    checking=true
    try{
      const renewed=await command(['EVAL',RENEW_SCRIPT,1,name,owner,TTL_MS])
      if(Number(renewed)!==1)return lose('token da instância não corresponde')
      lastConfirmedAt=Date.now()
    }catch(err){lose(err)}
    finally{checking=false}
  },RENEW_MS)
  leaseState.timer.unref?.()
  console.log('[Runtime Redis] exclusividade WhatsApp ativa; heartbeat PostgreSQL dispensável no modo redis')
  return true
}
