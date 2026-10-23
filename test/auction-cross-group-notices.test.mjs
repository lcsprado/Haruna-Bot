import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {otherAuctionGroups,crossGroupBidNotice} from '../src/neon/auction-bid-notice.js'

const groupA='120363410230588690@g.us'
const groupB='120363429534634131@g.us'
const groupC='120363429500000001@g.us'

test('somente os outros grupos participantes recebem aviso, sem duplicação',()=>{
  assert.deepEqual(otherAuctionGroups([groupA,groupB,groupC,groupB,'pessoa@s.whatsapp.net'],groupA),[groupB,groupC])
  assert.deepEqual(otherAuctionGroups([groupA,groupB],groupB),[groupA])
  assert.deepEqual(otherAuctionGroups([groupA],groupA),[])
  assert.deepEqual(otherAuctionGroups(null,groupA),[])
})

test('lance aceito em outro grupo informa valor e mínimo de disputa sem revelar prêmios',()=>{
  const msg=crossGroupBidNotice({
    lot:2,totalLots:3,bidder:'João Pedro',
    value:450000,nextMinimum:500000,endsAt:Date.parse('2026-10-20T12:45:00-03:00')
  })
  assert.match(msg,/LANCE DE OUTRO GRUPO/)
  assert.match(msg,/LOTE 2\/3/)
  assert.match(msg,/João Pedro/)
  assert.match(msg,/R\$ 450\.000/)
  assert.match(msg,/R\$ 500\.000/)
  assert.match(msg,/12:45/)
  assert.match(msg,/!lance 500000/)
  assert.match(msg,/Prêmios continuam secretos/)
  assert.doesNotMatch(msg,/fragmento_universal_raid|selo_poder_5pct_alpha/)
})

test('sanitiza nome recebido pelo WhatsApp e preserva formato dos lances',()=>{
  const msg=crossGroupBidNotice({
    lot:1,totalLots:4,bidder:'*Jogador*\nFALSO AVISO',
    value:100000,nextMinimum:150000,endsAt:Date.parse('2026-10-20T13:10:00-03:00')
  })
  assert.match(msg,/LOTE 1\/4/)
  assert.match(msg,/Jogador FALSO AVISO/)
  assert.doesNotMatch(msg,/\*Jogador\*/)
  assert.match(msg,/R\$ 150\.000/)
})

test('somente lances validados geram aviso; pausa de auditoria permanece ativa',()=>{
  const source=readFileSync(new URL('../src/neon/auction-alpha.js',import.meta.url),'utf8')
  assert.match(source,/const AUCTION_PAUSED_FOR_AUDIT=false/)
  assert.match(source,/if\(AUCTION_PAUSED_FOR_AUDIT\)/)
  assert.match(source,/if\(state\.phase!=='running'/)
  assert.match(source,/otherAuctionGroups\(state\.groups,chat\)/)
  assert.match(source,/queueAuctionBidNotices\(c,/)
  assert.match(source,/flushAuctionBidNotices\(db,auctionSocket,KEY\)/)
  assert.match(source,/await reply\(result\.confirmation\)/)
})
