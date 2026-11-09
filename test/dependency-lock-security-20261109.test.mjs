import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'))
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'))

test('baileys version in npm lock must match the runtime-approved pinned version',()=>{
  assert.equal(packageJson.dependencies.baileys,'6.7.24')
  assert.equal(lock.packages[''].dependencies.baileys,packageJson.dependencies.baileys)
  assert.equal(lock.packages['node_modules/baileys'].version,packageJson.dependencies.baileys)
  assert.notEqual(lock.packages['node_modules/baileys'].version,'7.0.0-rc14')
})

test('all follow-redirects instances in npm lock must be patched for GHSA-mrwp-f3q8-3g9p',()=>{
  const entries=Object.entries(lock.packages).filter(([path])=>path==='node_modules/follow-redirects'||path.endsWith('/node_modules/follow-redirects'))
  assert.ok(entries.length>0,'follow-redirects should be locked as an indirect Axios dependency')
  for(const [path,pkg] of entries){
    assert.match(pkg.integrity||'',/^sha512-/,'integrity hash is required for '+path)
    const parts=String(pkg.version).split('.').map(Number)
    assert.equal(parts.length,3)
    assert.ok(parts.every(Number.isInteger))
    assert.ok(parts[0]>1||parts[0]===1&&(parts[1]>16||parts[1]===16&&parts[2]>=2),
      'vulnerable follow-redirects locked at '+path+': '+pkg.version)
  }
})

test('security patch does not make follow-redirects a direct game dependency',()=>{
  assert.ok(packageJson.dependencies.axios)
  assert.equal(packageJson.dependencies['follow-redirects'],undefined)
  assert.equal(lock.packages[''].dependencies['follow-redirects'],undefined)
})
