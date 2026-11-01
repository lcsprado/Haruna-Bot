import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {restoreTemporaryPlayers20261019} from '../src/neon/temporary-recovery-20261019.js'
import {restoreLostInventories20261019} from '../src/neon/inventory-recovery-20261019.js'

const modules=[
  'src/neon/temporary-recovery-20261019.js',
  'src/neon/inventory-recovery-20261019.js'
]
for(const path of modules){
  test(path+' contains no identifiable player snapshots, transaction SQL or personal records',()=>{
    const content=readFileSync(new URL('../'+path,import.meta.url),'utf8')
    assert.doesNotMatch(content,/\b\d{10,16}@(s\.whatsapp\.net|lid)\b/)
    assert.doesNotMatch(content,/const RECOVERY\s*=/)
    assert.doesNotMatch(content,/["'](?:name|jid|balance|patrimony|pet[s]?|wallet[s]?)["']\s*:/i)
    assert.doesNotMatch(content,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|MERGE)\s+(?:INTO|FROM|TABLE)?\s+/i)
    assert.doesNotMatch(content,/DATABASE_URL|db\.connect|db\.query/)
  })
}
test('legacy recovery exports are harmless and never touch the database',async()=>{
  for(const fn of [restoreTemporaryPlayers20261019,restoreLostInventories20261019]){
    assert.deepEqual(await fn(),{status:'skipped',reason:'historical recovery disabled; no database mutation'})
  }
})
test('existing historical startup feature flags still reference no-op compatibility functions',()=>{
  const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(src,/restoreTemporaryPlayers20261019/)
  assert.match(src,/restoreLostInventories20261019/)
})
