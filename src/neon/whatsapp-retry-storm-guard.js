// Limita tentativas repetidas de reenviar mensagens do grupo em tempestades Signal.
// DMs nao sao afetadas. Nenhuma chave, ID ou texto e gravado fora da memoria local.
export function createGroupRetryStormGuard({
  maxRequestsPerMessage=3,
  maxRequestsPerMinute=80,
  ttlMs=60*60*1000,
  maxEntries=4096,
  now=Date.now
}={}){
  if(!Number.isInteger(maxRequestsPerMessage)||maxRequestsPerMessage<1)throw new RangeError('maxRequestsPerMessage')
  if(!Number.isInteger(maxRequestsPerMinute)||maxRequestsPerMinute<1)throw new RangeError('maxRequestsPerMinute')
  const attempts=new Map()
  let windowStart=now(),minuteCount=0,blockedCount=0
  return {
    inspect(key){
      if(!String(key?.remoteJid||'').endsWith('@g.us'))return {allowed:true}
      const id=String(key?.id||'')
      if(!id)return {allowed:true}
      const t=now()
      if(t<windowStart || t-windowStart>=60*1000){windowStart=t;minuteCount=0}
      minuteCount++
      let prior=attempts.get(id)
      if(prior&&t-prior.last>=ttlMs){attempts.delete(id);prior=null}
      if(!prior){
        if(attempts.size>=maxEntries)attempts.delete(attempts.keys().next().value)
        prior={count:0,last:t}
      }else attempts.delete(id)
      prior.count++
      prior.last=t
      attempts.set(id,prior)
      const reason=prior.count>maxRequestsPerMessage?'repeat':minuteCount>maxRequestsPerMinute?'rate':null
      if(reason){blockedCount++;return {allowed:false,reason,blockedCount}}
      return {allowed:true}
    }
  }
}
