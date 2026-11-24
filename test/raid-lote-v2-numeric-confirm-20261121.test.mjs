import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {RAID_LOTE_NUMERIC_CONFIRM_STAGE,RAID_LOTE_NUMERIC_CONFIRM_TTL_MS,raidLoteNumericDecision,raidLoteDurationPlan} from '../src/neon/raid-lote-policy.js'

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const wa=source('src/neon/index.js')
const store=source('src/neon/raid-lote-store.js')

test('RaidLote 2.0: 1 confirma e 2 cancela, sem comando extenso',()=>{
 assert.equal(raidLoteNumericDecision('1'),'confirm')
 assert.equal(raidLoteNumericDecision('2'),'cancel')
 assert.equal(raidLoteNumericDecision(' 1 '),'confirm')
 assert.equal(raidLoteNumericDecision(' 2 '),'cancel')
 for(const wrong of ['3','4','0','11','12','!raidlote confirmar 15 8h','sim','','não',null]){
   assert.equal(raidLoteNumericDecision(wrong),null)
 }
})

test('a prévia expira em 90s; duração da Raid continua aceita em 4/8/12h',()=>{
 assert.equal(RAID_LOTE_NUMERIC_CONFIRM_STAGE,'raid_lote_v2_confirm')
 assert.equal(RAID_LOTE_NUMERIC_CONFIRM_TTL_MS,90000)
 for(const hours of ['4h','8h','12h'])assert.equal(raidLoteDurationPlan(hours).hours,Number(hours.slice(0,-1)))
 assert.throws(()=>raidLoteDurationPlan('24h'))
})

test('a mensagem do orçamento mostra apenas 1/2 e não cobra na prévia',()=>{
 assert.match(wa,/1️⃣ \*Confirmar\*/)
 assert.match(wa,/2️⃣ \*Cancelar\*/)
 assert.match(wa,/Responda somente 1 ou 2 em até 90 segundos/)
 assert.match(wa,/setQuickFlow\(chat,sender,RAID_LOTE_NUMERIC_CONFIRM_STAGE,/)
 assert.match(wa,/requestKey:'wa:'\+createHash\('sha256'\)\.update\('raidlote2:quote:'\+sender\+':'\+chat\+':'\+quoteMessageId\)/)
 assert.match(wa,/raidLoteQuote\(cfg\.keyPrice,1,Math\.max\(0,Number\(owned\?\.quantity\|\|0\)\)\)/)
})

test('opção 1 só executa com prévia em vigor, duração válida e idempotência do requestKey',()=>{
 assert.match(wa,/if\(flow\.stage===RAID_LOTE_NUMERIC_CONFIRM_STAGE\)/)
 assert.match(wa,/const decision=raidLoteNumericDecision\(input\)/)
 assert.match(wa,/if\(decision!=='confirm'\)/)
 assert.match(wa,/!\[4,8,12\]\.includes\(hours\)/)
 assert.match(wa,/!\/\^wa:\[a-f0-9\]\{64\}\$\/\.test\(requestKey\)/)
 assert.match(wa,/startTimedRaidLoteSession\(db,\s*\{jid:sender,level,durationHours:hours,requestKey,confirmed:true,usePet:flow\.data\?\.usePet!==false\}/)
 assert.match(store,/SELECT \* FROM raid_lote_jobs WHERE jid=\$1 AND request_key=\$2 FOR UPDATE/)
 assert.match(store,/if\(old\)\{/)
})

test('opção 2 cancela apenas a prévia, não debita nem ativa sessão',()=>{
 assert.match(wa,/if\(decision==='cancel'\|\|\['0','cancelar','cancel','sair'\]\.includes\(input\)\)\{\s*clearQuickFlow\(chat,sender\)/)
 assert.match(wa,/Nenhuma sessão iniciada e nenhuma chave ou valor consumido/)
 assert.match(wa,/if\(hadPreview\)clearQuickFlow\(chat,sender\)/)
})

test('resposta pertence ao mesmo jogador e chat, não interfere em outros menus ou quiz',()=>{
 assert.match(wa,/const quickFlowKey=\(chat,sender\)=>/)
 assert.match(wa,/const route=await pocoNumericRoute\(\{db,sender,chat,body\}\)/)
 assert.match(wa,/const activePoco=await pocoNumericRoute\(\{db,sender,chat,body:'1'\}\)/)
 assert.match(wa,/Finalize sua decisão ativa no \*Poço do Abismo\*/)
 assert.match(wa,/const activeNumericMenu=!body\.startsWith\(prefix\)/)
 assert.match(wa,/hasPlayerMenu:Boolean\(activeNumericMenu\)/)
 assert.match(wa,/await handleQuickGameFlow\(\{sock,chat,sender,body,reply,msg,isOwner,isGroup\}\)/)
})

test('comando extenso antigo permanece como alternativa e confirmação direta limpa prévia',()=>{
 assert.match(wa,/const confirmation=action==='confirmar'/)
 assert.match(wa,/if\(confirmation&&timedRaidLote\)\{/)
 assert.match(wa,/if\(getQuickFlow\(chat,sender\)\?\.stage===RAID_LOTE_NUMERIC_CONFIRM_STAGE\)clearQuickFlow\(chat,sender\)/)
})
