import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {healthPageHtml} from '../src/neon/health-page.js'

const server=readFileSync(new URL('../src/neon/render-whatsapp.js',import.meta.url),'utf8')
test('painel de acordar apresenta estados amigáveis em português',()=>{
  assert.match(healthPageHtml,/Acordando o bot/)
  assert.match(healthPageHtml,/Inicializando o bot/)
  assert.match(healthPageHtml,/Bot acordado e conectado!/)
  assert.match(healthPageHtml,/Aguardando o WhatsApp/)
  assert.match(healthPageHtml,/Verificar novamente/)
  assert.match(healthPageHtml,/pollTimer=setTimeout\(check,connected\?60000:6000\)/)
})
test('a consulta JSON e o monitoramento HTTP 200\/503 continuam preservados',()=>{
  assert.match(server,/url\.pathname==='\/health'/)
  assert.match(server,/url\.searchParams\.get\('format'\)!=='json'/)
  assert.match(server,/browserWantsHtml/)
  assert.match(server,/isReadyCheck&&!connected\?503:200/)
  assert.match(server,/content-type':'application\/json/)
  assert.match(healthPageHtml,/fetch\('\/health\?format=json'/)
})
test('interface não publica dados de autenticação nem modifica o RPG',()=>{
  assert.doesNotMatch(healthPageHtml,/DATABASE_URL|OWNER_NUMBER|private_key|\/api\/reset|reconnect\/admin/)
})
