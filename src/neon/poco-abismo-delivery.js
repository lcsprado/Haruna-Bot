// Estado da janela de resposta do Poço.
// Baileys confirma o envio ao servidor, não a leitura pelo celular.
// Até essa confirmação, não começa a punição por 120 segundos.
export const POCO_PENDING_DEADLINE=Number.MAX_SAFE_INTEGER
export const POCO_CHOICE_MS=120_000
export function pocoStagePrompt(state){
 if(!state||state.status!=='active'||!state.boss)return null
 const seq=Math.max(0,Number(state.promptSeq||0))+1
 state.promptSeq=seq
 state.deliveryPending=true
 state.deadline=POCO_PENDING_DEADLINE
 return Object.freeze({
  attempt:state.attempt,seq,floor:state.boss.floor,turn:state.boss.turn
 })
}
export function pocoConfirmPrompt(state,token,sentAt=Date.now()){
 if(!state||state.status!=='active'||!state.boss||!token)return false
 if(!state.deliveryPending || state.promptSeq!==token.seq ||
   state.attempt!==token.attempt || state.boss.floor!==token.floor ||
   state.boss.turn!==token.turn)return false
 if(!Number.isFinite(sentAt)||sentAt<0)throw new RangeError('Hora inválida')
 state.deadline=sentAt+POCO_CHOICE_MS
 state.deliveryPending=false
 state.sentAt=sentAt
 return true
}
export function pocoIsChoiceReady(state){return Boolean(state&&state.status==='active'&&!state.deliveryPending)}

export const POCO_ID_CACHE_LIMIT=80
export function pocoMessageSeen(session,messageId){
 if(typeof messageId!=='string'||!messageId||messageId.length>180)return false
 return Boolean(session?.processedMessageIds?.includes(messageId))
}
export function pocoRememberMessage(session,messageId){
 if(!session||typeof messageId!=='string'||!messageId||messageId.length>180)return false
 if(pocoMessageSeen(session,messageId))return false
 session.processedMessageIds=[
  ...(session.processedMessageIds||[]).slice(-(POCO_ID_CACHE_LIMIT-1)),
  messageId
 ]
 return true
}
