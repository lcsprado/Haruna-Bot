import test from 'node:test'
import assert from 'node:assert/strict'
import {createGlobalCommandAntispam, commandAntispamNotice} from '../src/neon/command-antispam.js'

function fixture() {
  let time = 1_000_000
  const limiter = createGlobalCommandAntispam({clock: () => time})
  return {
    at: ms => {time += ms},
    check: (body, sender = 'joao') => limiter.inspect({sender, body, prefix: '!'}),
    time: () => time
  }
}

test('mensagens normais e menus numericos nao sofrem antispam de comandos', () => {
  const a = fixture()
  for (let i = 0; i < 100; i++) {
    assert.equal(a.check('conversando normalmente').allowed, true)
    assert.equal(a.check('2').allowed, true)
  }
  assert.equal(a.check('!perfil').allowed, true)
})

test('perfil e profile compartilham intervalo de 10s; sem segunda consulta', () => {
  const a = fixture()
  assert.equal(a.check('!perfil').allowed, true)
  const blocked = a.check('!profile')
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.reason, 'cooldown')
  assert.equal(blocked.retrySeconds, 10)
  assert.ok(commandAntispamNotice(blocked).includes('10s'))
  a.at(9_999)
  assert.equal(a.check('!perfil').allowed, false)
  a.at(1)
  assert.equal(a.check('!perfil').allowed, true)
})

test('inventario e aliases, menus e comandos comuns recebem limitacao', () => {
  const a = fixture()
  assert.equal(a.check('!inv').allowed, true)
  assert.equal(a.check('!inventario').allowed, false)
  assert.equal(a.check('!saldo').allowed, true)
  assert.equal(a.check('!saldo').allowed, false)
  a.at(2_999)
  assert.equal(a.check('!saldo').allowed, false)
  a.at(1)
  assert.equal(a.check('!saldo').allowed, true)
})

test('jogadores diferentes nao se bloqueiam; mesmo jogador nos dois grupos compartilha limite', () => {
  const a = fixture()
  assert.equal(a.check('!perfil', 'joao').allowed, true)
  assert.equal(a.check('!perfil', 'kaique').allowed, true)
  assert.equal(a.check('!perfil', 'joao').allowed, false)
  assert.equal(a.check('!perfil', 'kaique').allowed, false)
  assert.equal(a.check('!perfil', 'alice').allowed, true)
})

test('quiz permite as duas tentativas imediatas, mas barra flood de comandos', () => {
  const a = fixture()
  assert.equal(a.check('!pk 1').allowed, true)
  assert.equal(a.check('!pk 2').allowed, true)
  assert.equal(a.check('!respostapokemon 3').allowed, true)
  for (let i = 0; i < 5; i++) assert.equal(a.check('!pk 1').allowed, true)
  const flood = a.check('!pk 4')
  assert.equal(flood.allowed, false)
  assert.equal(flood.reason, 'flood')
  assert.equal(flood.retrySeconds, 30)
  a.at(29_999)
  assert.equal(a.check('!pk 1').allowed, false)
  a.at(1)
  assert.equal(a.check('!pk 1').allowed, true)
})

test('spam de !perfil bloqueia por 30s sem respostas repetitivas do bot', () => {
  const a = fixture()
  assert.equal(a.check('!perfil').allowed, true)
  const first = a.check('!perfil')
  assert.equal(first.notify, true)
  assert.ok(commandAntispamNotice(first))
  for (let i = 0; i < 6; i++) {
    const denied = a.check('!perfil')
    assert.equal(denied.allowed, false)
    assert.equal(denied.notify, false)
    assert.equal(commandAntispamNotice(denied), null)
  }
  const flood = a.check('!perfil')
  assert.equal(flood.reason, 'flood')
  assert.equal(flood.allowed, false)
  const blocked = a.check('!saldo')
  assert.equal(blocked.reason, 'blocked')
  assert.equal(blocked.allowed, false)
  a.at(30_000)
  assert.equal(a.check('!saldo').allowed, true)
})

test('o prefixo configurado funciona e nao bloqueia mensagens sem prefixo', () => {
  const limiter = createGlobalCommandAntispam({clock: () => 1_000_000})
  const check = body => limiter.inspect({sender: 'joao', body, prefix: '.'})
  assert.equal(check('!perfil').allowed, true)
  assert.equal(check('.perfil').allowed, true)
  assert.equal(check('.perfil').allowed, false)
})

test('limite usa hora do recebimento mesmo se processamento aguardar a fila', () => {
  const limiter = createGlobalCommandAntispam({clock: () => 9_999_999})
  const inspect = receivedAt => limiter.inspect({sender: 'joao', body: '!perfil', receivedAt})
  assert.equal(inspect(1_000_000).allowed, true)
  assert.equal(inspect(1_000_001).allowed, false)
  assert.equal(inspect(1_010_000).allowed, true)
})

test('qualquer comando repetido tem cooldown, mesmo sem cadastro especial', () => {
  const a = fixture()
  assert.equal(a.check('!atacar').allowed, true)
  assert.equal(a.check('!atacar').allowed, false)
  assert.equal(a.check('!ataque').allowed, true)
  a.at(2_999)
  assert.equal(a.check('!atacar').allowed, false)
  a.at(1)
  assert.equal(a.check('!atacar').allowed, true)
})
