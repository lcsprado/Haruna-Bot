import test from 'node:test'
import assert from 'node:assert/strict'
import {routePrivateReply} from '../src/neon/private-reply-routing.js'

test('resposta privada @lid preserva a identidade da conversa recebida',()=>{
  assert.deepEqual(routePrivateReply('12345@lid','5511999998888@s.whatsapp.net'),{
    jid:'12345@lid',quoted:true,normalized:false
  })
})

test('resposta em grupo mantém grupo e quoted do comando',()=>{
  assert.deepEqual(routePrivateReply('12345@g.us','5511999998888@s.whatsapp.net'),{
    jid:'12345@g.us',quoted:true,normalized:false
  })
})

test('contato sem alias telefônico permanece na conversa original',()=>{
  assert.deepEqual(routePrivateReply('12345@lid','12345@lid'),{
    jid:'12345@lid',quoted:true,normalized:false
  })
})

test('resposta para PN de origem preserva PN',()=>{
  assert.deepEqual(routePrivateReply('5511999998888@s.whatsapp.net','5511999998888@s.whatsapp.net'),{
    jid:'5511999998888@s.whatsapp.net',quoted:true,normalized:false
  })
})

test('alias com sufixo de dispositivo não altera JID inbound',()=>{
  assert.deepEqual(routePrivateReply('12345@lid','5511999998888:8@s.whatsapp.net'),{
    jid:'12345@lid',quoted:true,normalized:false
  })
})
