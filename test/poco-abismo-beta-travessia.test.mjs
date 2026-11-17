import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pocoBetaTraversalLabel,pocoBetaCompactPrompt} from '../src/neon/poco-abismo-beta-ui.js'
import {pocoStart,pocoDecision} from '../src/neon/poco-abismo-rules.js'

test('travessia automática nomeia apenas os quatro andares entre Guardiões',()=>{
 for(const floor of [5,10,15,20,25,30]){
   assert.equal(pocoBetaTraversalLabel(floor),'↪ travessia automática '+(floor-4)+'–'+(floor-1))
 }
 for(const floor of [0,1,4,6,9,11,19,26,31,undefined]){
   assert.equal(pocoBetaTraversalLabel(floor),'')
 }
})

test('cada balão continua com quatro linhas e explica uma ação por rodada',()=>{
 const {state}=pocoStart({seed:21,now:10,balanceVersion:'beta-v3'})
 const msg=pocoBetaCompactPrompt({state,name:'LP',recap:'⚔️+600/-130'})
 assert.match(msg,/G5\/30/)
 assert.match(msg,/travessia automática 1–4/)
 assert.match(msg,/1 ação\/rodada/)
 assert.match(msg,/1⚔️ Atacar.*2🛡️ Defender.*3🧪 Curar.*4✨ Técnica/)
 assert.equal(msg.split('\n').length,4)
 assert.ok(msg.length<340,'O balão do WhatsApp não deve ficar muito longo')
 const step=pocoDecision(state,1,{now:100}).state
 assert.equal(step.boss.floor,5,'Um ataque não pode saltar até o próximo Guardião')
 assert.equal(step.boss.turn,1,'Um comando executa somente uma rodada')
})

test('mudança de texto não altera transações, drops ou mecânica do Poço',()=>{
 const ui=readFileSync(new URL('../src/neon/poco-abismo-beta-ui.js',import.meta.url),'utf8')
 const preview=readFileSync(new URL('../src/neon/poco-abismo-preview.js',import.meta.url),'utf8')
 assert.match(preview,/pocoBetaCompactPrompt\(\{[\s\S]*state:s\.active/)
 assert.match(preview,/balanceVersion:BETA_ONLY\?'beta-v3':'legacy'/)
 assert.doesNotMatch(ui,/pocoClaimFloorInTx|pocoClaimBossDropInTx|pocoSettleFinalRanking/)
 assert.doesNotMatch(ui,/db\.query|UPDATE trevo_settings|sock\.sendMessage/)
})
