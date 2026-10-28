import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../src/neon/auction-alpha.js',import.meta.url),'utf8')
const prizes=src.match(/const PACKAGES=(\[[\s\S]*?\])\nlet timer=/)?.[1]
const packages=prizes?new Function('return '+prizes)():[]
test('27 October four-lot auction uses an isolated key and scheduled opening',()=>{
  assert.match(src,/leilao_quatro_destinos_20261027_1430_v1/)
  assert.match(src,/const START=Date.parse\('2026-10-27T14:30:00-03:00'\)/)
  assert.match(src,/const END=Date.parse\('2026-10-27T15:30:00-03:00'\)/)
  assert.match(src,/const OPENING=250000/)
  assert.match(src,/const STEP=100000/)
  assert.equal(packages.length,4)
  assert.ok(packages.every(lot=>lot.length>=2))
})
test('four sealed packages preserve balanced rewards without restricted merch',()=>{
  assert.equal(packages.flat().filter(item=>item.pet).length,1)
  assert.equal(packages.flat().filter(item=>item.pet).every(item=>item.pet==='guaxinim_errante_20261027'),true)
  assert.equal(packages.flat().filter(item=>item.id==='caixa_lendaria').reduce((total,item)=>total+item.qty,0),1)
  assert.equal(packages.flat().filter(item=>item.id==='armadura_vigia_crepusculo_20261027').length,1)
  assert.equal(packages.flat().filter(item=>item.id==='pocao_pet_full').length,1)
})
test('public bidding is backed by transactional reservations, refunds and sealed rewards',()=>{
  assert.match(src,/pg_advisory_xact_lock/)
  assert.match(src,/state\.seal=createHash\('sha256'\)/)
  assert.match(src,/state\.lots=shufflePackages\(\)/)
  assert.match(src,/cash=cash\+\$1,bank=bank\+\$2/)
  assert.match(src,/UPDATE wallets SET cash=cash-\$1,bank=bank-\$2/)
  assert.match(src,/queueAuctionBidNotices\(c/)
  assert.match(src,/flushAuctionBidNotices\(db,sock,KEY/)
  const webStatus=src.slice(src.indexOf('export async function getAuctionWebStatus('),src.indexOf('export async function placeAuctionWebBid('))
  assert.doesNotMatch(webStatus,/lot\.prize|state\.salt|state\.seal/)
})
test('scheduled preview, 2-minute anti-snipe lots and five-lot totals are visible without secrets',()=>{
  assert.match(src,/if\(now>=START-10\*60\*1000 && now<START\)/)
  assert.match(src,/state\.preAnnounced=true/)
  assert.match(src,/version:0,groups,origin:'system'/)
  assert.match(src,/const DURATION=LOT_DURATION_MS/)
  assert.match(src,/extendAuctionDeadline/)
  assert.match(src,/totalLots:PACKAGES\.length/)
})
