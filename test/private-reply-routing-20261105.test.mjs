import test from 'node:test'
import assert from 'node:assert/strict'
import {routePrivateReply} from '../src/neon/private-reply-routing.js'

test('resposta privada LID usa PN resolvido sem cotação de outra conversa',()=>{
  assert.deepEqual(routePrivateReply('12345@lid','5511999998888@s.whatsapp.net'),{
    jid:'5511999998888@s.whatsapp.net',quoted:false,normalized:true
  })
})

test('não altera respostas em grupo, ainda que haja PN do jogador',()=>{
  assert.deepEqual(routePrivateReply('12345@g.us','5511999998888@s.whatsapp.net'),{
    jid:'12345@g.us',quoted:true,normalized:false
  })
})

test('não inventa número quando alias não foi resolvido',()=>{
  assert.deepEqual(routePrivateReply('12345@lid','12345@lid'),{
    jid:'12345@lid',quoted:true,normalized:false
  })
})

test('mantém mensagens privadas que já usam PN',()=>{
  assert.deepEqual(routePrivateReply('5511999998888@s.whatsapp.net','5511999998888@s.whatsapp.net'),{
    jid:'5511999998888@s.whatsapp.net',quoted:true,normalized:false
  })
})


test('normaliza sufixo de aparelho em PN resolvido',()=>{
  assert.deepEqual(routePrivateReply('12345@lid','5511999998888:8@s.whatsapp.net'),{
    jid:'5511999998888@s.whatsapp.net',quoted:false,normalized:true
  })
})
