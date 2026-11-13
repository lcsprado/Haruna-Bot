import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeWebPhone,validateWebPassword,hashWebPassword,verifyWebPassword} from '../src/neon/web-password-crypto.js'

test('aceita WhatsApp brasileiro com ou sem codigo do pais',()=>{
  assert.equal(normalizeWebPhone('(11) 98888-7777'),'5511988887777')
  assert.equal(normalizeWebPhone('+55 (11) 98888-7777'),'5511988887777')
  assert.equal(normalizeWebPhone('11 3456-7890'),'551134567890')
  assert.throws(()=>normalizeWebPhone('12345'),/DDD/)
})

test('recusa senhas curtas e controles invisiveis',()=>{
  assert.throws(()=>validateWebPassword('abc123'),/10 a 128/)
  assert.throws(()=>validateWebPassword('abcde12345\n'),/controle/)
  assert.equal(validateWebPassword('Segredo-Ban-2026'),'Segredo-Ban-2026')
})

test('hash scrypt usa salt por senha e verifica sem plaintext',async()=>{
  const password='SenhaDeTeste-Alpha-2026!'
  const [hash1,hash2]=await Promise.all([hashWebPassword(password),hashWebPassword(password)])
  assert.notEqual(hash1,hash2)
  assert.ok(hash1.startsWith('scrypt-v1$'))
  assert.ok(!hash1.includes(password))
  assert.equal(await verifyWebPassword(password,hash1),true)
  assert.equal(await verifyWebPassword(password,hash2),true)
  assert.equal(await verifyWebPassword('senhaErradaMasLonga',hash1),false)
  assert.equal(await verifyWebPassword(password,null),false)
})
