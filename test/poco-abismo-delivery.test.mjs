import test from 'node:test'
import assert from 'node:assert/strict'
import {pocoStart,pocoDecision} from '../src/neon/poco-abismo-rules.js'
import {POCO_CHOICE_MS,POCO_PENDING_DEADLINE,pocoStagePrompt,pocoConfirmPrompt,pocoIsChoiceReady,pocoMessageSeen,pocoRememberMessage,POCO_ID_CACHE_LIMIT,pocoDispatchActionPrompt} from '../src/neon/poco-abismo-delivery.js'

test('não reduz os 120 segundos pelo tempo de processamento ou fila de envio',()=>{
 const {state}=pocoStart({now:1000,seed:123,profile:{heroId:'pecado_ban'}})
 const token=pocoStagePrompt(state)
 assert.equal(state.deliveryPending,true)
 assert.equal(state.deadline,POCO_PENDING_DEADLINE)
 assert.equal(pocoIsChoiceReady(state),false)
 assert.throws(()=>pocoDecision(state,1,{now:1001}),/Aguardando confirmação/)
 const ackAt=131000 // mensagem confirmada somente 130s após criação
 assert.equal(pocoConfirmPrompt(state,token,ackAt),true)
 assert.equal(pocoIsChoiceReady(state),true)
 assert.equal(state.deadline,ackAt+POCO_CHOICE_MS)
 assert.equal(pocoConfirmPrompt(state,token,ackAt),false)
 assert.equal(pocoDecision(state,1,{now:ackAt+POCO_CHOICE_MS}).state.status,'active')
 const timeout=pocoDecision(state,1,{now:ackAt+POCO_CHOICE_MS+1})
 assert.equal(timeout.state.status,'ended')
 assert.equal(timeout.state.report.reason,'timeout')
})
test('confirmação atrasada de mensagem anterior não reseta o relógio da decisão nova',()=>{
 const {state}=pocoStart({now:1000,seed:3,profile:{heroId:'pecado_diane'}})
 const old=pocoStagePrompt(state)
 const current=pocoStagePrompt(state) // usuário solicita reenvio enquanto envio antigo está pendente
 assert.equal(current.seq,old.seq+1)
 assert.equal(pocoConfirmPrompt(state,old,2000),false)
 assert.equal(state.deliveryPending,true)
 assert.equal(state.deadline,POCO_PENDING_DEADLINE)
 assert.equal(pocoConfirmPrompt(state,current,3200),true)
 assert.equal(state.deadline,123200)
 assert.equal(pocoConfirmPrompt(state,old,100000),false)
 assert.equal(state.deadline,123200)
})
test('token de outra tentativa ou fase não confirma cronômetro',()=>{
 const {state}=pocoStart({now:0,seed:3,profile:{heroId:'pecado_ban'}})
 const token=pocoStagePrompt(state)
 assert.equal(pocoConfirmPrompt(state,{...token,attempt:token.attempt+1},100),false)
 assert.equal(pocoConfirmPrompt(state,{...token,floor:token.floor+5},100),false)
 assert.equal(pocoConfirmPrompt(state,{...token,turn:token.turn+1},100),false)
 assert.equal(pocoConfirmPrompt(state,token,100),true)
})
test('após uma ação, o turno seguinte precisa de confirmação própria',()=>{
 const {state}=pocoStart({now:2000,seed:1,profile:{heroId:'pecado_ban'}})
 const first=pocoStagePrompt(state)
 assert.equal(pocoConfirmPrompt(state,first,3000),true)
 const progressed=pocoDecision(state,2,{now:4000})
 assert.equal(progressed.state.status,'active')
 const second=pocoStagePrompt(progressed.state)
 assert.equal(progressed.state.deliveryPending,true)
 assert.throws(()=>pocoDecision(progressed.state,1,{now:4001}),/Aguardando confirmação/)
 assert.equal(pocoConfirmPrompt(progressed.state,first,4010),false)
 assert.equal(pocoConfirmPrompt(progressed.state,second,5010),true)
 assert.equal(progressed.state.deadline,125010)
})

test('comando retransmitido não modifica estado e cache continua limitado',()=>{
 const session={processedMessageIds:[]}
 assert.equal(pocoMessageSeen(session,'id-a'),false)
 assert.equal(pocoRememberMessage(session,'id-a'),true)
 assert.equal(pocoRememberMessage(session,'id-a'),false)
 assert.equal(pocoMessageSeen(session,'id-a'),true)
 for(let i=0;i<POCO_ID_CACHE_LIMIT+50;i++)
  assert.equal(pocoRememberMessage(session,'id-'+i),true)
 assert.equal(session.processedMessageIds.length,POCO_ID_CACHE_LIMIT)
 assert.equal(pocoMessageSeen(session,'id-a'),false)
 assert.equal(pocoMessageSeen(session,'id-129'),true)
 assert.equal(pocoRememberMessage(session,'x'.repeat(181)),false)
})

test('WhatsApp desconectado: falha de envio nunca inicia contagem regressiva',async()=>{
 const {state}=pocoStart({profile:{heroId:'pecado_ban'},seed:11,now:1200})
 const token=pocoStagePrompt(state)
 let confirmCalls=0
 await assert.rejects(()=>pocoDispatchActionPrompt({
  message:'Decisão pendente',token,
  reply:async()=>{throw new Error('socket closed')},
  confirm:async()=>{confirmCalls++;return true},
  clock:()=>1600
 }),/socket closed/)
 assert.equal(confirmCalls,0)
 assert.equal(state.deliveryPending,true)
 assert.equal(state.deadline,POCO_PENDING_DEADLINE)
})
test('WhatsApp reconectado: reenviar com token novo e ignorar confirmação atrasada',async()=>{
 const {state}=pocoStart({profile:{heroId:'pecado_ban'},seed:11,now:1200})
 const stale=pocoStagePrompt(state),current=pocoStagePrompt(state)
 const received=[],calls=[]
 const sent=await pocoDispatchActionPrompt({
  message:'Turno do Poço',token:current,
  reply:async text=>{received.push(text);return {key:{id:'whatsapp-1'}}},
  confirm:async(token,at)=>{calls.push([token.seq,at]);return pocoConfirmPrompt(state,token,at)},
  clock:()=>6000
 })
 assert.deepEqual(received,['Turno do Poço'])
 assert.deepEqual(calls,[[current.seq,6000]])
 assert.deepEqual(sent,{sent:true,confirmed:true})
 assert.equal(state.deadline,126000)
 const previous=await pocoDispatchActionPrompt({
  message:'Mensagem anterior chegou atrasada',token:stale,
  reply:async()=>true,confirm:async(token,at)=>pocoConfirmPrompt(state,token,at),
  clock:()=>10000
 })
 assert.deepEqual(previous,{sent:true,confirmed:false})
 assert.equal(state.deadline,126000)
})
test('ACK de mensagem sem turno não tenta gravar decisão no banco',async()=>{
 let calls=0
 const done=await pocoDispatchActionPrompt({
  message:'Informação sem escolha',token:null,
  reply:async()=>{calls++},confirm:async()=>{throw Error('Não deveria confirmar')}
 })
 assert.deepEqual(done,{sent:true,confirmed:false})
 assert.equal(calls,1)
})
