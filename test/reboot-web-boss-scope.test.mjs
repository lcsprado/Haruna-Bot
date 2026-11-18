import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {rebootWebBossScope} from '../src/neon/reboot-web-boss-scope.js'
test('V2 lê Boss comum do grupo e Superboss global da edição correta',()=>{
 assert.deepEqual(rebootWebBossScope('g',{open:false}),{chat:'g',weekendKey:null})
 assert.deepEqual(rebootWebBossScope('g',{open:true,weekendKey:'2026-11-20'}),{chat:'__alpha_global_weekly_boss__',weekendKey:'2026-11-20'})
 const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
 assert.equal((api.match(/rebootWebBossScope\((?:chatJid|session.chatJid),bossWeekendInfo\(\)\)/g)||[]).length,2)
 assert.match(api,/state->>'weekendKey'=\$3 AND state->>'rebootV2'='true'/)
 assert.match(api,/state->>'weekendKey'=\$2 AND state->>'rebootV2'='true'/)
 assert.match(api,/businesses:BUSINESSES.map\(b=>candidateBusinessCatalog\(b\)\)/)
 assert.match(api,/bossEvent:classesOnlyRebootEnabled\(\)\?null:/)
})
