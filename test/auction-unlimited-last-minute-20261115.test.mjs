import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const code=readFileSync(new URL('../src/neon/auction-20261115-2100.js',import.meta.url),'utf8')
const start=code.indexOf('const extendAuctionDeadline=')
const end=code.indexOf('const fmt=',start)
assert.ok(start>=0&&end>start,'Auction must have pure extension policy')
const extend=new Function(code.slice(start,end)+';return extendAuctionDeadline')()

test('accepting a new bid 1.368s before close always adds thirty seconds',()=>{
 const oldEnd=1794789411108
 const lastBid=1794789409740
 const out=extend(oldEnd,120000,lastBid)
 assert.equal(out.ends,oldEnd+30000)
 assert.equal(out.extra,150000)
 assert.equal(out.extended,true)
})
test('there is no 2-minute accumulated limit, every late bid extends again',()=>{
 const zero=1700000000000
 let state={ends:zero+300000,extra:0}
 for(let i=0;i<20;i++){
   const now=state.ends-1200
   state=extend(state.ends,state.extra,now)
   assert.equal(state.extended,true)
 }
 assert.equal(state.extra,600000)
 assert.equal(state.ends,zero+900000)
})
test('a bid before the final 30 seconds does not extend',()=>{
 const out=extend(1700001000000,240000,1700000960000)
 assert.equal(out.extended,false)
 assert.equal(out.extra,240000)
})
test('a bid after the deadline cannot extend a concluded lot',()=>{
 const out=extend(1700001000000,240000,1700001000000)
 assert.equal(out.extended,false)
})
test('deadline scheduler still processes reopened running lots after original END',()=>{
 assert.match(code,/if\(now>END && current\?\.phase!=='running'/)
 assert.doesNotMatch(code,/if\(now>END\)return/)
 assert.match(code,/startAuctionAlphaScheduler\(sock\)/)
 assert.match(code,/current\?\.phase==='completed'/)
 assert.match(code,/overtime\.extended\?'\\n⏱️ PRORROGADO \+30s/)
})
test('lot 3 escrow and receipt depend on same locked state',()=>{
 assert.match(code,/pg_advisory_xact_lock\(hashtext\(\$1\)\)/)
 assert.match(code,/const incremental=old\?\.jid===sender/)
 assert.match(code,/UPDATE wallets SET cash=cash\+\$1,bank=bank\+\$2/)
 assert.match(code,/UPDATE wallets SET cash=cash-\$1,bank=bank-\$2/)
 assert.match(code,/state\.high=\{/)
})
