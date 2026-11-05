import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {additionalBetaJidAllowed} from '../src/neon/web-beta-extra-allowlist.js'

const admitted='5500112233445@s.whatsapp.net'
const notAdmitted='5500998877665@s.whatsapp.net'

test('admit only exact explicitly added phone JID',()=>{
  assert.equal(additionalBetaJidAllowed(admitted,admitted),true)
  assert.equal(additionalBetaJidAllowed(admitted,'  '+notAdmitted+' , '+admitted+' '),true)
  assert.equal(additionalBetaJidAllowed(notAdmitted,admitted),false)
})

test('reject LIDs, malformed JIDs, names and substrings',()=>{
  assert.equal(additionalBetaJidAllowed('12345678@lid',admitted),false)
  assert.equal(additionalBetaJidAllowed('Guest Player',admitted),false)
  assert.equal(additionalBetaJidAllowed('5500112233445',admitted),false)
  assert.equal(additionalBetaJidAllowed(admitted,admitted+'00'),false)
  assert.equal(additionalBetaJidAllowed(admitted,''),false)
})

test('existing beta allowlist and siege guest fallback remain intact',()=>{
  const s=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.match(s,/process\.env\.ALPHA_WEB_BETA_JIDS/)
  assert.match(s,/additionalBetaJidAllowed\(jid,process\.env\.ALPHA_WEB_BETA_EXTRA_JIDS\)/)
  assert.match(s,/if\(!chatJid\)return false/)
  assert.match(s,/return siegeBetaGuestAccess\(client,\{jid,chat:chatJid\}\)/)
})
