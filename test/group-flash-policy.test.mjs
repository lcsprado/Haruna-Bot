import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {groupFlashPolicy} from '../src/neon/group-flash-policy.js'

test('flash events are active in groups during historic temporary recovery',()=>{
 assert.deepEqual(groupFlashPolicy({isGroup:true,temporaryRecoveryMode:true}),{
  allowFlashEvent:true,allowGroupIntro:false
 })
})
test('normal mode keeps group intro and flash events',()=>{
 assert.deepEqual(groupFlashPolicy({isGroup:true,temporaryRecoveryMode:false}),{
  allowFlashEvent:true,allowGroupIntro:true
 })
})
test('private messages never create flash events',()=>{
 assert.deepEqual(groupFlashPolicy({isGroup:false,temporaryRecoveryMode:true}),{
  allowFlashEvent:false,allowGroupIntro:false
 })
 assert.deepEqual(groupFlashPolicy({isGroup:false,temporaryRecoveryMode:false}),{
  allowFlashEvent:false,allowGroupIntro:false
 })
})
test('production message flow uses the policy and retains original cooldown/single claimant',()=>{
 const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 const progression=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
 assert.match(source,/groupFlashPolicy\(\{isGroup,temporaryRecoveryMode\}\)/)
 assert.match(source,/if\(flashPolicy\.allowFlashEvent\)\{/)
 assert.match(source,/if\(flashPolicy\.allowGroupIntro\)\{/)
 assert.match(source,/const spawned=await maybeSpawnGroupEvent\(chat\)/)
 assert.ok(!source.includes('const spawned=temporaryRecoveryMode?null:await maybeSpawnGroupEvent(chat)'))
 assert.match(progression,/if\(Math\.random\(\)>\.035\) return null/)
 assert.match(progression,/if\(old && Number\(old\.spawned_at\)>now-1800\) return null/)
 assert.match(progression,/expires_at,claimed_by\)/)
 assert.match(progression,/SELECT \* FROM group_events WHERE chat_jid=\$1 FOR UPDATE/)
})
test('temporary mode still protects recovery-sensitive features',()=>{
 const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(source,/const temporaryRecoveryMode=String\(process\.env\.ALPHA_DATASET_MODE\|\|''\)\.startsWith\('TEMPORARY_'\)/)
 assert.match(source,/if\(flashPolicy\.allowGroupIntro\)/)
 assert.match(source,/neonEcoMode=temporaryRecoveryMode\|\|process\.env\.ALPHA_DB_ECO_MODE==='1'/)
})
