import {createKeyedAsyncQueue} from './chat-queue.js'

// Incoming WhatsApp commands must be sequential for ONE player, not the whole
// group. A numeric response must never overtake that player's previous menu.
export function playerQueueKey(msg){
  const key=msg?.key||{}
  const chat=String(key.remoteJid||'__unknown__')
  const participant=String(key.participant||key.participantAlt||key.remoteJidAlt||chat)
    .replace(/:\d+(?=@)/,'')
  return chat+'|'+participant
}

export function groupIncomingByPlayer(messages){
  const groups=new Map()
  for(const msg of messages||[]){
    const key=playerQueueKey(msg)
    if(!groups.has(key))groups.set(key,[])
    groups.get(key).push(msg)
  }
  return groups
}

export function outgoingLane(chat,options){
  const quoted=options?.quoted?.key
  if(!quoted)return String(chat)+'|__notices__'
  const participant=String(quoted.participant||quoted.participantAlt||quoted.remoteJidAlt||chat)
    .replace(/:\d+(?=@)/,'')
  return String(chat)+'|'+participant
}

// Bound total simultaneous sends per group to avoid excessive WhatsApp/Signal
// concurrency. Unlike a group-wide mutex, two distinct players can progress.
export function createBoundedOutboundScheduler({maxConcurrentPerChat=2,onTiming=()=>{},now=Date.now}={}){
  if(!Number.isInteger(maxConcurrentPerChat)||maxConcurrentPerChat<1)throw new RangeError('maxConcurrentPerChat')
  const perLane=createKeyedAsyncQueue()
  const slots=new Map()
  function enter(chat){
    let slot=slots.get(chat)
    if(!slot){slot={active:0,waiting:[]};slots.set(chat,slot)}
    return new Promise(resolve=>{
      const admit=()=>{slot.active++;resolve(()=>{
        slot.active--
        const next=slot.waiting.shift()
        if(next)next()
        else if(slot.active===0)slots.delete(chat)
      })}
      if(slot.active<maxConcurrentPerChat)admit()
      else slot.waiting.push(admit)
    })
  }
  return (chat,options,task,kind='other')=>{
    const queuedAt=now()
    return perLane(outgoingLane(chat,options),async()=>{
      const release=await enter(String(chat))
      const waitMs=now()-queuedAt
      const startedAt=now()
      try{return await task()}
      finally{
        const transportMs=now()-startedAt
        release()
        try{onTiming({queueMs:waitMs,transportMs,kind})}catch{}
      }
    })
  }
}
