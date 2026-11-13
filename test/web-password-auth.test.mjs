import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeWebUsername,normalizeWebPhone,assertWebPassword,normalizeWebCode,makeWebPassword,verifyWebPassword,webSessionToken,webTokenHash} from '../src/neon/web-password-auth.js'

test('account usernames are normalized and restricted',()=>{
  assert.equal(normalizeWebUsername('  Lp_01  '),'lp_01')
  for(const bad of ['a','1alex','admin','AlphaBot','nome-espaço','a'.repeat(25)]){
    assert.throws(()=>normalizeWebUsername(bad))
  }
})
test('WhatsApp phone login accepts BR numbers with DDD and rejects user-controlled identifiers',()=>{
  assert.equal(normalizeWebPhone('(11) 99999-1234'),'5511999991234')
  assert.equal(normalizeWebPhone('+55 (11) 99999-1234'),'5511999991234')
  assert.equal(normalizeWebPhone('5511999991234'),'5511999991234')
  assert.equal(normalizeWebPhone('11999991234'),'5511999991234')
  assert.equal(normalizeWebPhone('1133334444'),'551133334444')
  for(const invalid of ['alice','admin','1234','1199999123','551100000','+1 (206) 555-0101','00115511999991234']){
    assert.throws(()=>normalizeWebPhone(invalid),invalid)
  }
})
test('passwords must be at least 10 chars; hashes use unique salt and verify safely',async()=>{
  assert.throws(()=>assertWebPassword('123456789'))
  const password='Password α 0123456789'
  const p=await makeWebPassword(password),q=await makeWebPassword(password)
  assert.notEqual(p.passwordHash,password)
  assert.notEqual(p.passwordSalt,q.passwordSalt)
  assert.notEqual(p.passwordHash,q.passwordHash)
  assert.equal(await verifyWebPassword(password,p.passwordSalt,p.passwordHash),true)
  assert.equal(await verifyWebPassword('wrong password!',p.passwordSalt,p.passwordHash),false)
  assert.equal(await verifyWebPassword(password,'bad',p.passwordHash),false)
})
test('one-time Web code cannot be malformed',()=>{
  assert.equal(normalizeWebCode(' abcd2345 '),'ABCD2345')
  assert.throws(()=>normalizeWebCode('AAAAA'))
  assert.throws(()=>normalizeWebCode('AAAA0000'))
})
test('session tokens are opaque random values, not a player identifier',()=>{
  const one=webSessionToken(),two=webSessionToken()
  assert.notEqual(one,two)
  assert.equal(webTokenHash(one).length,64)
  assert.ok(!one.includes('@'))
})
