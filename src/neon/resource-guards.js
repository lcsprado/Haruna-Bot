// Bounded process-local helpers. No player state or combat timing is cached here.
export function createTtlCache({ttlMs=30000,maxEntries=128,now=Date.now}={}){
  const entries=new Map()
  return {
    async get(key,load){
      const existing=entries.get(key)
      if(existing && (existing.pending || existing.expiresAt>now())) return existing.value
      entries.delete(key)
      while(entries.size>=maxEntries) entries.delete(entries.keys().next().value)
      const entry={pending:true,expiresAt:0,value:null}
      entry.value=Promise.resolve().then(load).then(value=>{
        if(entries.get(key)===entry){
          entry.pending=false;entry.expiresAt=now()+ttlMs;entry.value=value
        }
        return value
      },error=>{if(entries.get(key)===entry)entries.delete(key);throw error})
      entries.set(key,entry)
      return entry.value
    },
    delete(key){entries.delete(key)},
    clear(){entries.clear()},
    get size(){return entries.size}
  }
}

export function createByteBudget(limitBytes,{windowMs=3600000,now=Date.now}={}){
  const reservations=[]
  let used=0
  function prune(){
    const cutoff=now()-windowMs
    while(reservations.length && reservations[0].at<=cutoff)used-=reservations.shift().bytes
  }
  return {
    reserve(bytes){
      prune()
      if(!Number.isSafeInteger(bytes)||bytes<=0||used+bytes>limitBytes)return false
      // A small fixed upper bound also protects against tiny-file spam.
      if(reservations.length>=1024)return false
      reservations.push({at:now(),bytes});used+=bytes;return true
    },
    get remaining(){prune();return Math.max(0,limitBytes-used)}
  }
}

export function createMessageDeduplicator({ttlMs=10*60*1000,maxEntries=5000,now=Date.now}={}){
  const seen=new Map()
  let nextPruneAt=0
  return key=>{
    const time=now(),previous=seen.get(key)
    if(previous!==undefined&&time-previous<ttlMs)return false
    if(time>=nextPruneAt){
      for(const [id,at] of seen)if(time-at>=ttlMs)seen.delete(id)
      nextPruneAt=time+60000
    }
    seen.delete(key)
    while(seen.size>=maxEntries)seen.delete(seen.keys().next().value)
    seen.set(key,time)
    return true
  }
}

export function declaredMediaBytes(node,limitBytes){
  const value=node?.fileLength
  const bytes=Number(value?.toString?.()??value??0)
  if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>limitBytes){
    throw new Error('Mídia sem tamanho válido ou acima do limite permitido.')
  }
  return bytes
}

// Consume a stream instead of trusting fileLength and buffering an unbounded file.
export async function readBoundedMedia(stream,maxBytes,{timeoutMs=30000,onBytes=()=>{}}={}){
  const chunks=[]
  let size=0
  const timer=setTimeout(()=>stream.destroy(new Error('Tempo de download excedido.')),timeoutMs)
  timer.unref?.()
  try{
    for await(const chunk of stream){
      const data=Buffer.from(chunk)
      onBytes(data.length)
      size+=data.length
      if(size>maxBytes)throw new Error('Mídia excedeu o tamanho permitido durante o download.')
      chunks.push(data)
    }
    if(!size)throw new Error('Mídia vazia.')
    return Buffer.concat(chunks,size)
  }finally{
    clearTimeout(timer)
    stream.destroy?.()
  }
}

export async function downloadBoundedMedia(download,maxBytes,options={}){
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),options.timeoutMs??30000)
  timer.unref?.()
  try{
    const stream=await download(controller.signal)
    return await readBoundedMedia(stream,maxBytes,options)
  }finally{
    clearTimeout(timer)
    // Destroy the underlying HTTP request too, not just Baileys' decryption transform.
    controller.abort()
  }
}

// Single-flight timer for a dated event: one final settlement tick, then retire it.
export function scheduleUntil(task,endsAt,{intervalMs=5000,startupMs=5000,now=Date.now,onError=console.error}={}){
  let busy=false,timer
  const tick=async()=>{
    if(busy)return
    busy=true
    let settled=false
    try{settled=(await task())!==false}catch(error){onError(error)}
    finally{
      busy=false
      const deadline=typeof endsAt==='function'?endsAt():endsAt
      if(now()>=deadline&&settled){clearInterval(timer);clearTimeout(startup)}
    }
  }
  timer=setInterval(tick,intervalMs);timer.unref?.()
  const startup=setTimeout(tick,startupMs)
  startup.unref?.()
  return ()=>{clearInterval(timer);clearTimeout(startup)}
}

// Every distinct snapshot is persisted in order; no debounce or delayed credential write.
export function createSerializedSaver(initialValue,persist,{onSkip=()=>{}}={}){
  let last=initialValue,queue=Promise.resolve()
  return value=>{
    const result=queue.then(async()=>{
      if(value===last){onSkip();return}
      await persist(value)
      last=value
    })
    queue=result.catch(()=>{})
    return result
  }
}
