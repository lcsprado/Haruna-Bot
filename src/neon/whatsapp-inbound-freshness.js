// Only gate RPG dispatch. Never drop raw Signal packets or change authentication.
export function inboundRejection(msg,type,receivedAt){
  if(type!=='notify'&&type!=='append')return 'ignoredType'
  const ts=Number(msg?.messageTimestamp?.toNumber?.()??msg?.messageTimestamp??0)*1000
  if(type==='append'){
    if(!ts||Math.abs(receivedAt-ts)>45000)return 'staleAppend'
  }else if(ts&&(receivedAt-ts>120000||ts-receivedAt>60000)){
    return 'staleNotify'
  }
  if(!msg?.message)return 'emptyMessage'
  if(msg?.key?.fromMe)return 'selfMessage'
  return null
}
