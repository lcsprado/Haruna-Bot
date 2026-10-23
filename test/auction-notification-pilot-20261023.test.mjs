import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {otherAuctionGroups} from '../src/neon/auction-bid-notice.js'
const pilot=readFileSync(new URL('../src/neon/auction-notification-pilot.js',import.meta.url),'utf8')
const outbox=readFileSync(new URL('../src/neon/auction-notice-outbox.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
test('pilot: only one event, 15-minute simulated one-lot auction and global highest bid',()=>{
  assert.match(pilot,/leilao_aviso_global_teste_20261023_v1/)
  assert.match(pilot,/15\*60\*1000/)
  assert.match(pilot,/pg_advisory_xact_lock/)
  assert.match(pilot,/state.*high|s\.high=/)
  assert.match(pilot,/otherAuctionGroups\(s\.groups,chat\)/)
  assert.match(pilot,/queueAuctionBidNotices\(c,/)
  assert.match(pilot,/auctionNoticeSummary\(db,KEY,/)
  assert.match(pilot,/Nenhum saldo, XP ou item será alterado/)
  assert.match(pilot,/LEILÃO TESTE — LANCE DE OUTRO GRUPO/)
  assert.doesNotMatch(pilot,/Prêmios continuam secretos/)
  assert.doesNotMatch(pilot,/(UPDATE wallets|INSERT INTO transactions|grantExpInTransaction|INSERT INTO inventories)/)
})
test('production handlers share the same persisted auction notification queue',()=>{
  assert.match(index,/startAuctionNotificationPilot\(sock\)/)
  assert.match(index,/handleAuctionNotificationPilotCommand/)
  assert.match(outbox,/CREATE TABLE IF NOT EXISTS auction_bid_notice_outbox/)
  assert.match(outbox,/FOR UPDATE SKIP LOCKED/)
  assert.match(outbox,/status IN \('blocked','failed'\)/)
  assert.match(outbox,/auction_key=\$1 AND bid_version=\$2 AND target_chat=\$3/)
  assert.match(outbox,/await sock\.sendMessage/)
})
test('group isolation: notify other licensed groups, not the originating group',()=>{
  assert.deepEqual(otherAuctionGroups(['a@g.us','b@g.us','b@g.us'],'a@g.us'),['b@g.us'])
  assert.deepEqual(otherAuctionGroups(['a@g.us'],'a@g.us'),[])
})
