import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const server=readFileSync(new URL('../src/neon/render-whatsapp.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const page=readFileSync(new URL('../src/neon/health-page.js',import.meta.url),'utf8')

test('HTTP /ready e QR não declaram conectado com socket aberto sem credenciais registradas',()=>{
  const declaration="const connected=health.whatsapp==='open'&&health.authRegistered===true"
  assert.equal(server.split(declaration).length-1,3)
  assert.match(server,/isReadyCheck&&!connected\?503:200/)
  assert.match(server,/whatsappConnected:connected,authRegistered:health.authRegistered===true/)
  assert.match(server,/const image=value\?await QRCode\.toDataURL/)
  assert.match(server,/authorization\|\|''/)
  assert.match(server,/timingSafeEqual/)
})
test('Baileys 6.7.24 aceita autenticação com account e me mesmo que registered fique false',()=>{
  assert.match(index,/const hasPairedAuth=\(\)=>Boolean\(state\.creds\.account&&state\.creds\.me\?\.id\)/)
  assert.match(index,/trevoHealth\.authRegistered=hasPairedAuth\(\)/)
  assert.match(index,/trevoHealth\.authRegistered=hasPairedAuth\(\)\|\|Boolean\(update\?\.account&&update\?\.me\?\.id\)/)
  assert.match(index,/if\(hasPairedAuth\(\)\)\{[\s\S]*?state\.creds\.registered=true[\s\S]*?saveCreds\(\)/)
  assert.match(index,/socket aberto, mas pareamento pendente/)
  assert.match(index,/if\(!hasPairedAuth\(\) && !pairingNumber\)/)
  assert.match(index,/if\(!pairingNumber && !hasPairedAuth\(\)\)/)
  assert.doesNotMatch(index,/if\(!state\.creds\.registered && !pairingNumber\)/)
})
test('painel só afirma conectado depois de confirmar estado de autenticação',()=>{
  assert.match(page,/connected=data\.whatsappConnected===true/)
  assert.match(page,/if\(data\.whatsappConnected===true\)/)
  assert.match(page,/data\.authRegistered===false/)
  assert.match(page,/WhatsApp aguardando pareamento/)
})
test('o vínculo QR não transmite senha em URL nem expõe QR pelo health',()=>{
  assert.match(server,/Authorization|authorization/)
  assert.match(server,/globalThis\.__alphaPairingQr\?\.value/)
  assert.doesNotMatch(server,/res\.end\(JSON\.stringify\(\{\s*qr:/)
})
