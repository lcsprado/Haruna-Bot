import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pocoStart,pocoDecision} from '../src/neon/poco-abismo-rules.js'
import {pocoStagePrompt,pocoConfirmPrompt,pocoDispatchActionPrompt,POCO_PENDING_DEADLINE} from '../src/neon/poco-abismo-delivery.js'
import {pocoBetaCompactPrompt} from '../src/neon/poco-abismo-beta-ui.js'

const preview=readFileSync(new URL('../src/neon/poco-abismo-preview.js',import.meta.url),'utf8')
const main=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

test('cada resposta do beta gera nova mensagem e jamais edita um balão silenciosamente',()=>{
 assert.doesNotMatch(preview,/pocoBetaDispatchPrompt|pocoBetaEditTarget|uiEdit:/)
 assert.match(preview,/async function sendActionPrompt\(jid,name,reply,result\)\{[\s\S]*?return pocoDispatchActionPrompt\(\{/)
 assert.match(preview,/const ok=pocoConfirmPrompt\(s\.active,token,sentAt\)/)
 const x=pocoStart({profile:{heroId:'pecado_ban'},seed:3,now:10,balanceVersion:'beta-v3'}).state
 const txt=pocoBetaCompactPrompt({state:x,name:'~LP',recap:'⚔️+795/-179'})
 assert.equal(txt.split('\n').length,3,'enviar prompt legível e curto no grupo')
 assert.match(txt,/G5\/30/)
 assert.match(txt,/120s/)
 assert.match(txt,/1⚔️ 2🛡️ 3🧪 4✨/)
})

test('uma ação não inicia próxima janela até confirmação de NOVO envio WhatsApp',async()=>{
 const started=pocoStart({profile:{heroId:'pecado_ban'},seed:1,now:1,balanceVersion:'beta-v3'}).state
 const firstToken=pocoStagePrompt(started)
 const sent=[]
 const first=await pocoDispatchActionPrompt({
   reply:async msg=>{sent.push(msg);return {key:{id:'novo-balao-1'}}},
   message:'Primeira decisão',token:firstToken,clock:()=>5000,
   confirm:(token,time)=>pocoConfirmPrompt(started,token,time)
 })
 assert.equal(first.confirmed,true)
 assert.equal(started.deadline,125000)
 const second=pocoDecision(started,1,{now:6000}).state
 const secondToken=pocoStagePrompt(second)
 assert.equal(second.deadline,POCO_PENDING_DEADLINE)
 const next=await pocoDispatchActionPrompt({
   reply:async msg=>{sent.push(msg);return {key:{id:'novo-balao-2'}}},
   message:'Próxima decisão',token:secondToken,clock:()=>10000,
   confirm:(token,time)=>pocoConfirmPrompt(second,token,time)
 })
 assert.equal(next.confirmed,true)
 assert.equal(second.deadline,130000)
 assert.deepEqual(sent,['Primeira decisão','Próxima decisão'])
})

test('sem confirmação do WhatsApp, rodada pendente não encerra por timeout',async()=>{
 const state=pocoStart({seed:9,now:100,balanceVersion:'beta-v3'}).state
 const token=pocoStagePrompt(state)
 let called=0
 const result=await pocoDispatchActionPrompt({
   reply:async()=>undefined,message:'decisão',token,clock:()=>5000,
   confirm:()=>{called++;return true}
 })
 assert.equal(result.confirmed,false)
 assert.equal(called,0)
 assert.equal(state.deliveryPending,true)
 assert.equal(state.deadline,POCO_PENDING_DEADLINE)
})

test('1-4 em Poço ativo são tratados antes dos menus individuais, quiz e inventário',()=>{
 const route=main.indexOf('const route=await pocoNumericRoute({db,sender,chat,body})')
 const menu=main.indexOf('const activeNumericMenu=!body.startsWith(prefix)',route)
 const quiz=main.indexOf('if(shouldRouteQuizContinuation(',menu)
 const invent=main.indexOf('Não encontrei um menu ativo para essa escolha',quiz)
 assert.ok(route>=0&&menu>route&&quiz>menu&&invent>quiz)
 assert.match(main,/pocoBetaGroupAllowed\(\{chat,subject:betaMeta\?\.subject\}\)/)
 assert.match(main,/if\(handled\)continue/)
})
