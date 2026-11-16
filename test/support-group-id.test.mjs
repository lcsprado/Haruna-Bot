import test from 'node:test'
import assert from 'node:assert/strict'
import {isAlphaBotGroupSubject,isSupportBlockedGroupJid,SUPPORT_ONLY_PAGANTES_MESSAGE} from '../src/neon/support-group-id.js'

test('identifica somente o nome autentico do grupo Alpha Bot',()=>{
assert.equal(isAlphaBotGroupSubject('Alpha Bot'),true)
assert.equal(isAlphaBotGroupSubject('ALPHA BOT'),true)
assert.equal(isAlphaBotGroupSubject('  alpha   bot  '),true)
assert.equal(isAlphaBotGroupSubject('teste beta versão 1'),false)
assert.equal(isAlphaBotGroupSubject('Alpha Bot Teste'),false)
assert.equal(isAlphaBotGroupSubject('Alpha Bot 2'),false)
assert.equal(isAlphaBotGroupSubject(null),false)
})

test('bloqueio usa ID do grupo e nao usuario, nome ou outro grupo',()=>{
const id='120363429534634131@g.us'
assert.equal(isSupportBlockedGroupJid(id,id),true)
assert.equal(isSupportBlockedGroupJid('120363410230588690@g.us',id),false)
assert.equal(isSupportBlockedGroupJid('5511999999999@s.whatsapp.net',id),false)
assert.equal(isSupportBlockedGroupJid(id,''),false)
assert.equal(isSupportBlockedGroupJid(id,null),false)
})
test('resposta ao suporte no grupo restrito preserva texto exato',()=>{
assert.equal(SUPPORT_ONLY_PAGANTES_MESSAGE,'suporte disponível apenas para pagantes')
})
