import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {MIMIC_EVENT,mimicOutcome} from '../src/neon/mimic-hunt.js'
const code=readFileSync(new URL('../src/neon/mimic-hunt.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
test('15h–17h de 24/10/2026, 60 caçadas com cooldown de 2 minutos',()=>{
 assert.equal(new Date(MIMIC_EVENT.startsAt).toISOString(),'2026-10-24T18:00:00.000Z')
 assert.equal(new Date(MIMIC_EVENT.endsAt).toISOString(),'2026-10-24T20:00:00.000Z')
 assert.equal(MIMIC_EVENT.cooldownMs,120000)
 assert.equal(MIMIC_EVENT.maxHunts,60)
})
test('maximum prize 1.49m before ranking; 1.79m for first',()=>{
 assert.equal(MIMIC_EVENT.milestones.reduce((s,m)=>s+m.cash,0),650000)
 assert.equal(MIMIC_EVENT.maxHunts*6000+650000,1010000)
 assert.equal(MIMIC_EVENT.maxHunts*14000+650000,1490000)
 assert.equal(MIMIC_EVENT.maxHunts*14000+650000+MIMIC_EVENT.rankCash[0],1790000)
 assert.deepEqual(MIMIC_EVENT.rankCash,[300000,200000,100000])
})
test('RNG distribution sums correctly and rarity point increases',()=>{
 assert.equal(mimicOutcome(0).kind,'dourado')
 assert.equal(mimicOutcome(199).kind,'dourado')
 assert.equal(mimicOutcome(200).kind,'epico')
 assert.equal(mimicOutcome(999).kind,'epico')
 assert.equal(mimicOutcome(1000).kind,'raro')
 assert.equal(mimicOutcome(3199).kind,'raro')
 assert.equal(mimicOutcome(3200).kind,'comum')
 assert.equal(mimicOutcome(9999).kind,'comum')
 assert.throws(()=>mimicOutcome(-1))
})
test('all credits are transactional, ranking pays once, no interval polling',()=>{
 assert.match(code,/pg_advisory_xact_lock/)
 assert.match(code,/FOR UPDATE/)
 assert.match(code,/ON CONFLICT\(event_key,jid\) DO UPDATE/)
 assert.match(code,/SELECT value FROM trevo_settings WHERE key=\$1/)
 assert.match(code,/mimic_final:/)
 assert.match(code,/await c\.query\('COMMIT'\)/)
 assert.match(code,/Date\.now\(\)<MIMIC_EVENT\.endsAt\+15000/)
 assert.doesNotMatch(code,/setInterval/)
})
test('titles visible in textual profile and per-group announcements',()=>{
 assert.match(index,/handleMimicCommand/)
 assert.match(index,/scheduleMimics\(sock\)/)
 assert.match(index,/const mimicTitleRows=await db\.query/)
 assert.match(index,/\$\{mimicTitle\?/)
 assert.match(code,/await sock\.sendMessage\(group\.chat_jid,\{text:msg\}\)/)
 assert.match(code,/mimic_notice:/)
})
