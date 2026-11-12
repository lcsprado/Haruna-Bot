import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {RAID_LOTE_V1} from '../src/neon/raid-lote-policy.js'

const store=readFileSync(new URL('../src/neon/raid-lote-store.js',import.meta.url),'utf8')
const localDay=iso=>{
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:RAID_LOTE_V1.dailyResetTimeZone,
    year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date(iso))
  const field=k=>parts.find(p=>p.type===k)?.value
  return field('year')+'-'+field('month')+'-'+field('day')
}

test('limit is 10 attempts per Brasilia calendar day',()=>{
  assert.equal(RAID_LOTE_V1.maxAttempts,10)
  assert.equal(RAID_LOTE_V1.dailyResetTimeZone,'America/Sao_Paulo')
  assert.equal(localDay('2026-11-12T02:59:59Z'),'2026-11-11')
  assert.equal(localDay('2026-11-12T03:00:00Z'),'2026-11-12')
  assert.equal(localDay('2026-11-13T02:59:59Z'),'2026-11-12')
})

test('purchase quota query uses local midnight, never rolling 24 hours',()=>{
  assert.match(store,/created_at\s*>=\s*\(\(NOW\(\) AT TIME ZONE \$2::text\)::date AT TIME ZONE \$2::text\)/)
  assert.match(store,/\[jid,RAID_LOTE_V1\.dailyResetTimeZone\]/)
  assert.doesNotMatch(store,/NOW\(\)\s*-\s*INTERVAL\s*'24 hours'/i)
  assert.match(store,/Limite diario de 10 tentativas\. Renova as 00:00/)
})

test('quota counts attempts across multiple packages on the same day',()=>{
  const purchases=[1,9]
  assert.equal(purchases.reduce((a,b)=>a+b,0),10)
  assert.equal(10-purchases.reduce((a,b)=>a+b,0),0)
  assert.equal(localDay('2026-11-11T13:42:11Z'),'2026-11-11')
  assert.equal(localDay('2026-11-12T03:00:00Z'),'2026-11-12')
})
