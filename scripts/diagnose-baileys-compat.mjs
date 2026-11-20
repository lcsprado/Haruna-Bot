import assert from 'node:assert/strict'
import makeWASocket,{
  Browsers,DisconnectReason,downloadMediaMessage,fetchLatestBaileysVersion,
  getContentType,makeCacheableSignalKeyStore,BufferJSON,initAuthCreds
} from 'baileys'

const exportsToCheck={makeWASocket,Browsers,DisconnectReason,downloadMediaMessage,
  fetchLatestBaileysVersion,getContentType,makeCacheableSignalKeyStore,
  BufferJSON,initAuthCreds}
for(const [name,value] of Object.entries(exportsToCheck)){
  assert.notEqual(value,undefined,'Exportacao ausente: '+name)
}
assert.equal(typeof makeWASocket,'function')
assert.equal(typeof Browsers.ubuntu,'function')
const browser=Browsers.ubuntu('Chrome')
assert.ok(Array.isArray(browser))
assert.equal(browser.length,3)
assert.equal(typeof initAuthCreds,'function')
const creds=initAuthCreds()
assert.ok(creds&&typeof creds==='object')
assert.equal(typeof makeCacheableSignalKeyStore,'function')
assert.equal(typeof BufferJSON.replacer,'function')
assert.equal(typeof BufferJSON.reviver,'function')
console.info('Baileys compatibility exports and auth helpers OK')
