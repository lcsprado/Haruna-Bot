import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ALPHA_WEB_CANONICAL_ORIGINS,resolveAlphaWebAllowedOrigin} from '../src/neon/web-canonical-origins.js'

const oldBeta='https://alpha-web-rpg-git-feat-web-aiven-beta-protegid-976d2b-lcshprado.vercel.app'
const config=oldBeta+',https://other-legitimate-tenant.example'
test('production Alpha RPG origin is accepted despite older beta-only environment',()=>{
  for(const host of ALPHA_WEB_CANONICAL_ORIGINS){
    assert.equal(resolveAlphaWebAllowedOrigin(host,config),host)
  }
})
test('already authorized beta and other explicit origins remain valid',()=>{
  assert.equal(resolveAlphaWebAllowedOrigin(oldBeta,config),oldBeta)
  assert.equal(resolveAlphaWebAllowedOrigin('https://other-legitimate-tenant.example',config),'https://other-legitimate-tenant.example')
})
test('arbitrary Vercel preview, HTTP, suffix tricks, null and spoofed origins are rejected',()=>{
  for(const origin of [
    'https://alpha-web-rpg-attacker.vercel.app',
    'https://alpha-web-rpg.vercel.app.attacker.example',
    'https://some-unapproved-alpha.vercel.app',
    'http://alpha-web-rpg.vercel.app',
    'https://alpha-web-rpg.vercel.app/',
    'https://alpha-web-rpg.vercel.app:444',
    'null',
    'https://evil.example'
  ])assert.equal(resolveAlphaWebAllowedOrigin(origin,config),'')
})
test('health probes without Origin continue to work and original wildcard semantics are preserved',()=>{
  assert.equal(resolveAlphaWebAllowedOrigin(null,config),null)
  assert.equal(resolveAlphaWebAllowedOrigin('',config),null)
  assert.equal(resolveAlphaWebAllowedOrigin('https://unknown.example','*'),'*')
})
test('CORS enforcement still denies unauthorized origins before authentication',()=>{
  const code=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.match(code,/resolveAlphaWebAllowedOrigin\(req\.headers\.origin,process\.env\.WEB_ALLOWED_ORIGINS/)
  assert.match(code,/if\(!setCors\(req,res\)\)\{/)
  assert.match(code,/json\(res,403,\{ok:false,error:'Origem não autorizada\.'\}\)/)
})
