import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pocoBetaGroupAllowed,POCO_BETA_GROUP_NAME} from '../src/neon/poco-abismo-beta-group.js'
const idx=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const preview=readFileSync(new URL('../src/neon/poco-abismo-preview.js',import.meta.url),'utf8')
const live=readFileSync(new URL('../src/neon/poco-abismo-live.js',import.meta.url),'utf8')
const GROUP_ID='120363123456789000@g.us'

test('libera somente o nome exato teste beta versão 1, validado como grupo',()=>{
 assert.equal(POCO_BETA_GROUP_NAME,'teste beta versao 1')
 for(const subject of ['teste beta versão 1','Teste Beta Versão 1','  TESTE   BETA   VERSÃO  1 ']){
   assert.equal(pocoBetaGroupAllowed({chat:GROUP_ID,subject}),true,subject)
 }
 for(const subject of ['teste beta','teste beta versão 2','teste do bot','ALPHA BOT','teste beta versão 1 - oficial',undefined]){
   assert.equal(pocoBetaGroupAllowed({chat:GROUP_ID,subject}),false,String(subject))
 }
 assert.equal(pocoBetaGroupAllowed({chat:'5511999999999@s.whatsapp.net',subject:'teste beta versão 1'}),false)
 assert.equal(pocoBetaGroupAllowed({chat:GROUP_ID,subject:{subject:'teste beta versão 1'}}),false)
})
test('o nome precisa ser lido da API do grupo, nunca do texto que o jogador enviou',()=>{
 assert.match(idx,/const betaMeta=isGroup\?await sock\.groupMetadata\(chat\)\.catch\(\(\)=>null\):null/)
 assert.match(idx,/const betaAllowed=pocoBetaGroupAllowed\(\{chat,subject:betaMeta\?\.subject\}\)/)
 assert.match(idx,/if\(!betaAllowed\)continue/)
 assert.match(idx,/handlePocoCommand\(\{cmd,args,sender,name:msg\.pushName\|\|'Jogador',reply,chat,messageId:String\(msg\?\.key\?\.id\|\|''\),betaAllowed\}\)/)
})
test('piloto gratuito exige flag explícita e nunca habilita premiações de produção',()=>{
 assert.match(preview,/const BETA_ONLY=process\.env\.POCO_BETA_GROUP_PREVIEW==='true'/)
 assert.match(preview,/const ENABLED=BETA_ONLY\|\|process\.env\.POCO_ABISMO_PREVIEW==='true'/)
 assert.match(preview,/if\(BETA_ONLY&&!betaAllowed\)return false/)
 assert.match(preview,/if\(BETA_ONLY\)\{\s*const metadata=await sock\.groupMetadata\(result\.chat\)/)
 assert.match(live,/process\.env\.POCO_BETA_GROUP_PREVIEW!=='true'/)
 assert.doesNotMatch(preview,/pocoClaimFloorInTx|pocoClaimBossDropInTx|pocoOpenBoxInTx|pocoSettleFinalRanking/)
})
