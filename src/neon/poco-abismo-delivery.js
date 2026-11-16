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
 return pocoPendingPromptToken(state)
}
export function pocoPendingPromptToken(state){
 if(!state?.deliveryPending||state.status!=='active'||!state.boss)return null
 return Object.freeze({
  attempt:state.attempt,seq:state.promptSeq,floor:state.boss.floor,turn:state.boss.turn
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

/**
 * Fluxo de envio testável com WhatsApp simulado. O relógio só começa
 * depois do retorno bem-sucedido do transporte. A confirmação é feita
 * sob a transação do jogador pelo callback fornecido pelo controlador.
 * Em caso de falha de envio, nenhuma confirmação é persistida.
 */
export async function pocoDispatchActionPrompt({reply,message,token,confirm,clock=Date.now}){
 if(typeof reply!=='function'||typeof confirm!=='function'||typeof clock!=='function')
  throw new TypeError('Envio precisa de transporte e confirmação transacional')
 const sent=await reply(message)
 if(!token)return {sent:true,confirmed:false}
 // O transporte precisa devolver a chave da mensagem criada pelo Baileys.
 // Promise resolvida sem WAMessage não comprova envio: sem penalidade de tempo.
 if(!sent?.key?.id)return {sent:false,confirmed:false}
 const sentAt=clock()
 return {sent:true,confirmed:Boolean(await confirm(token,sentAt))}
}

/**
 * Números soltos só pertencem ao Poço se o mesmo jogador tiver
 * combate ativo no mesmo chat e na mesma temporada.
 * Fora disso, quiz, inventário e demais menus seguem seu fluxo normal.
 */
export function pocoNumericChoiceInSession({session,chat,season}={}){
 return Boolean(
  typeof chat==='string'&&chat.length>0&&
  session?.season===season&&session?.chat===chat&&
  session.active?.status==='active'&&session.active.boss
 )
}
