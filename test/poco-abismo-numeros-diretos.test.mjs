import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pocoNumericChoiceInSession} from '../src/neon/poco-abismo-delivery.js'

const idx=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const live=readFileSync(new URL('../src/neon/poco-abismo-live.js',import.meta.url),'utf8')
const preview=readFileSync(new URL('../src/neon/poco-abismo-preview.js',import.meta.url),'utf8')
const chat='120363999888777@g.us'
const season='poco_20261116'
const inBattle={season,chat,active:{status:'active',boss:{floor:5,turn:2},deadline:100000}}

test('Poço só assume números quando há batalha do mesmo jogador e chat',()=>{
 assert.equal(pocoNumericChoiceInSession({session:inBattle,chat,season}),true)
 assert.equal(pocoNumericChoiceInSession({session:inBattle,chat:'outro@g.us',season}),false)
 assert.equal(pocoNumericChoiceInSession({session:inBattle,chat,season:'outra_temporada'}),false)
 assert.equal(pocoNumericChoiceInSession({session:{...inBattle,active:null},chat,season}),false)
 assert.equal(pocoNumericChoiceInSession({session:{...inBattle,active:{status:'timeout',boss:{floor:5}}},chat,season}),false)
 assert.equal(pocoNumericChoiceInSession({session:{...inBattle,active:{status:'active',boss:null}},chat,season}),false)
 assert.equal(pocoNumericChoiceInSession({session:null,chat,season}),false)
})

test('roteamento dos números ocorre antes dos menus de quiz e inventário',()=>{
 const trigger=idx.indexOf("if(!body.startsWith(prefix) && /^[1-4]$/.test(body)){")
 const liveCall=idx.indexOf('if(await handlePocoLiveNumericChoice(choiceContext))continue',trigger)
 const previewCall=idx.indexOf('if(await handlePocoPreviewNumericChoice(choiceContext))continue',trigger)
 const quiz=idx.indexOf('const possibleQuizChoice=',trigger)
 const inventory=idx.indexOf("Não encontrei um menu ativo para essa escolha",trigger)
 assert.ok(trigger>0 && liveCall>trigger && previewCall>liveCall)
 assert.ok(quiz>previewCall && inventory>quiz)
 assert.match(idx,/messageId:String\(msg\?\.key\?\.id\|\|''\),reply,sock/)
})

test('controladores verificam temporada, chat e jogador antes da ação',()=>{
 for(const [mode,code] of [['live',live],['preview',preview]]){
  assert.match(code,/export async function handlePoco(?:Live|Preview)NumericChoice/)
  assert.match(code,/if\(!pocoNumericChoiceInSession\(\{session:rows\[0\]\?\.value,chat,season:POCO_SEASON\.id\}\)\)return false/)
  assert.match(code,/args:\[String\(choice\)\]/)
  assert.match(code,/somente com \*1, 2, 3 ou 4\* \(sem comando\)/)
 }
 assert.match(preview,/const metadata=await sock\.groupMetadata\(chat\)\.catch\(\(\)=>null\)/)
 assert.match(preview,/if\(!betaAllowed\)return false/)
})

test('fora do combate, as escolhas de inventário, quiz e caixa continuam preservadas',()=>{
 assert.match(idx,/await handleQuickGameFlow\(\{sock,chat,sender,body,reply,msg,isOwner,isGroup\}\)/)
 assert.match(idx,/if\(await quizHandleChoice\(chat,body,reply\)\)continue/)
})
