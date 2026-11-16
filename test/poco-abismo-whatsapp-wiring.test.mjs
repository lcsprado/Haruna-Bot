import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {pocoStart} from '../src/neon/poco-abismo-rules.js'
import {POCO_PENDING_DEADLINE,pocoStagePrompt,pocoConfirmPrompt,pocoDispatchActionPrompt} from '../src/neon/poco-abismo-delivery.js'

const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const live=readFileSync(new URL('../src/neon/poco-abismo-live.js',import.meta.url),'utf8')

function realReplyWithFakeSocket(sendMessage){
 const start=source.indexOf('const reply=(text,extra={})=>{')
 const end=source.indexOf("\nconst isGroup=chat.endsWith('@g.us')",start)
 assert.ok(start>0 && end>start,'encontrar wrapper real de resposta WhatsApp')
 const snippet=source.slice(start,end)
 const now=Date.now()
 return vm.runInNewContext(snippet+';reply',{
   firstReplyTimed:false,
   receivedAt:now,messageProcessingStartedAt:now,
   timingMarks:{},body:'!poco iniciar',prefix:'!',
   sender:'jogador@s.whatsapp.net',chat:'grupo@g.us',
   msg:{key:{id:'incoming-poco-1'}},
   routePrivateReply:()=>({jid:'grupo@g.us',quoted:false,normalized:false}),
   sock:{sendMessage},console:{warn(){},error(){}}
 })
}
function promptState(){
 const state=pocoStart({now:1000,seed:100,profile:{heroId:'pecado_ban'}}).state
 const token=pocoStagePrompt(state)
 assert.ok(token)
 assert.equal(state.deadline,POCO_PENDING_DEADLINE)
 return {state,token}
}
test('roteador WhatsApp prioriza Poço real antes da prévia e usa o ID único recebido',()=>{
 const real=source.indexOf('if(await handlePocoLiveCommand({cmd,args,sender')
 const preview=source.indexOf('if(await handlePocoCommand({cmd,args,sender')
 assert.ok(real>0 && preview>real)
 assert.match(source,/messageId:String\(msg\?\.key\?\.id\|\|''\)/)
 assert.match(live,/const ENABLED=process\.env\.POCO_ABISMO_LIVE==='true'&&process\.env\.POCO_ABISMO_PREVIEW!=='true'/)
 assert.match(live,/if\(!ENABLED\)return/)
})
test('wrapper real devolve WAMessage do Baileys e só então confirma prazo de 120s',async()=>{
 const sent=[]
 const reply=realReplyWithFakeSocket(async(destination,body,options)=>{
   sent.push({destination,body,options})
   return {key:{id:'outgoing-confirmed-1'}}
 })
 const {state,token}=promptState()
 const result=await pocoDispatchActionPrompt({
   reply,message:'⚔️ Escolha uma ação',token,
   clock:()=>100000,
   confirm:async(t,at)=>pocoConfirmPrompt(state,t,at)
 })
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{sent:true,confirmed:true})
 assert.equal(state.deliveryPending,false)
 assert.equal(state.deadline,220000)
 assert.equal(sent.length,1)
 assert.equal(sent[0].destination,'grupo@g.us')
 assert.equal(sent[0].body.text,'⚔️ Escolha uma ação')
})
test('sem WAMessage válido não há ACK, contagem nem recompensa implícita',async()=>{
 const reply=realReplyWithFakeSocket(async()=>undefined)
 const {state,token}=promptState()
 let confirms=0
 const result=await pocoDispatchActionPrompt({
   reply,message:'turno',token,clock:()=>100000,
   confirm:async()=>{confirms++;return false}
 })
 assert.equal(result.sent,false)
 assert.equal(result.confirmed,false)
 assert.equal(confirms,0)
 assert.equal(state.deliveryPending,true)
 assert.equal(state.deadline,POCO_PENDING_DEADLINE)
})
test('falha de rede do sendMessage propaga erro e mantém decisão pendente',async()=>{
 const reply=realReplyWithFakeSocket(async()=>{throw new Error('socket disconnected')})
 const {state,token}=promptState()
 let confirms=0
 await assert.rejects(()=>pocoDispatchActionPrompt({
   reply,message:'turno',token,clock:()=>100000,
   confirm:async()=>{confirms++;return true}
 }),e=>e?.alphaReplySendFailed===true)
 assert.equal(confirms,0)
 assert.equal(state.deliveryPending,true)
 assert.equal(state.deadline,POCO_PENDING_DEADLINE)
})
