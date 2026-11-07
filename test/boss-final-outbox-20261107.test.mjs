import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  bossFinalNoticeIsRecent,bossFinalNoticePermanentError,bossFinalNoticeFailureState,
  BOSS_FINAL_NOTICE_MAX_ATTEMPTS,BOSS_FINAL_NOTICE_MAX_AGE_MS
} from '../src/neon/boss-final-outbox-policy.js'

test('historical final boss results expire and fresh results still announce',()=>{
  const now=Date.parse('2026-11-07T18:00:00-03:00')
  assert.equal(bossFinalNoticeIsRecent(now-60*60*1000,now),true)
  assert.equal(bossFinalNoticeIsRecent(now-BOSS_FINAL_NOTICE_MAX_AGE_MS-1,now),false)
  assert.equal(bossFinalNoticeIsRecent(now+5000,now),false)
  assert.equal(bossFinalNoticeIsRecent(null,now),false)
})
test('WhatsApp forbidden permanently disables only that event+group notice',()=>{
  for(const err of [new Error('forbidden'),{statusCode:403},{output:{statusCode:403}},
    new Error('not-authorized'),new Error('not in group'),new Error('group not found')]){
    assert.equal(bossFinalNoticePermanentError(err),true,String(err?.message||err?.statusCode||err?.output?.statusCode))
    const result=bossFinalNoticeFailureState(err,1,1000)
    assert.deepEqual(result,{status:'undeliverable',attempts:1,failedAt:1000,reason:'group_unavailable'})
  }
  assert.equal(bossFinalNoticePermanentError(new Error('timed out')),false)
  assert.equal(bossFinalNoticePermanentError({statusCode:429}),false)
})
test('transient errors retry with backoff and stop after three attempts',()=>{
  const first=bossFinalNoticeFailureState(new Error('timed out'),1,1000)
  const second=bossFinalNoticeFailureState(new Error('timed out'),2,1000)
  const last=bossFinalNoticeFailureState(new Error('timed out'),BOSS_FINAL_NOTICE_MAX_ATTEMPTS,1000)
  assert.equal(first.status,'retry')
  assert.equal(first.nextRetryAt,301000)
  assert.equal(second.nextRetryAt,601000)
  assert.deepEqual(last,{status:'abandoned',attempts:3,failedAt:1000,reason:'attempt_limit'})
})
test('scheduler keeps durable per-weekend and per-group idempotency; never deletes failed marker',()=>{
  const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  const a=src.indexOf('let completedWeeklyBossNoticeBusy=false')
  const b=src.indexOf('let eclipseResultBroadcastBusy=false',a)
  assert.ok(a>=0&&b>a)
  const outbox=src.slice(a,b)
  assert.match(outbox,/bossFinalNoticeIsRecent\(state\.completedAt\)/)
  assert.match(outbox,/boss_final_result:weekly:/)
  assert.match(outbox,/ON CONFLICT\(key\) DO UPDATE/)
  assert.match(outbox,/BOSS_FINAL_NOTICE_MAX_ATTEMPTS/)
  assert.match(outbox,/bossFinalNoticeFailureState\(sendError,attempts\)/)
  assert.match(outbox,/failure\.status==='undeliverable'/)
  assert.doesNotMatch(outbox,/DELETE FROM trevo_settings/)
  assert.match(outbox,/WHERE key=\$1 AND value->>'status'='sending'/)
})
