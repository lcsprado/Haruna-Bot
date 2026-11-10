// Leitura restrita dos eventos definidos pelo admin no WhatsApp.
// A API Web nunca cria, altera, encerra ou anuncia eventos.
const ALLOWED=Object.freeze({
  xp:3,pet:3,dinheiro:2,corre:2,sorte:2,raid:2,drop:2,fragmentos:2
})
export function activeOwnerMultiplier(type,value,now=Date.now()){
  const max=ALLOWED[type]
  if(!max)return 1
  const state=value||{}
  const starts=Number(state.startsAt||0),ends=Number(state.endsAt||0)
  if(!Number.isFinite(starts)||!Number.isFinite(ends)||
     starts<=0||ends<=starts||now<starts||now>=ends)return 1
  const mult=Number(state.multiplier||1)
  return Number.isFinite(mult)?Math.min(max,Math.max(1,mult)):1
}
export async function readOwnerRewardMultipliers(client,types,now=Date.now()){
  if(!Array.isArray(types)||types.some(type=>!Object.hasOwn(ALLOWED,type))){
    throw new Error('Tipo de evento inválido para leitura.')
  }
  const distinct=[...new Set(types)]
  const out=Object.fromEntries(distinct.map(type=>[type,1]))
  if(!distinct.length)return out
  const keys=distinct.map(type=>'owner_event_center:'+type)
  const result=await client.query('SELECT key,value FROM trevo_settings WHERE key=ANY($1::text[])',[keys])
  for(const row of result.rows){
    const type=String(row.key||'').slice('owner_event_center:'.length)
    if(Object.hasOwn(out,type))out[type]=activeOwnerMultiplier(type,row.value,now)
  }
  return out
}
