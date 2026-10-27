import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {extendAuctionDeadline,LOT_DURATION_MS,OVERTIME_CAP_MS} from '../src/neon/auction-rules.js'
import {crossGroupBidNotice} from '../src/neon/auction-bid-notice.js'

const auction=readFileSync(new URL('../src/neon/auction-alpha.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const catalog=readFileSync(new URL('../src/neon/game-catalog.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

test('2 minutos por lote e prorrogação no limite, sem ultrapassar 2 minutos',()=>{
  assert.equal(LOT_DURATION_MS,120000)
  let ends=120000, extra=0
  assert.equal(extendAuctionDeadline(ends,extra,104999).extended,false)
  for(let n=0;n<6;n++){
    const out=extendAuctionDeadline(ends,extra,ends-10000)
    assert.equal(out.extended,true)
    ends=out.ends; extra=out.extra
  }
  assert.equal(extra,OVERTIME_CAP_MS)
  assert.equal(ends,240000)
  assert.equal(extendAuctionDeadline(ends,extra,ends-1000).extended,false)
  assert.equal(extendAuctionDeadline(120000,0,120000).extended,false)
})

test('eventos antigos não são reativados pelo leilão de 27/10',()=>{
  assert.ok(auction.includes("const KEY='leilao_quatro_destinos_20261027_1430_v1'"))
  assert.ok(!auction.includes("const KEY='leilao_consumiveis_tres_lotes_20261024_v1'"))
  assert.ok(!auction.includes("const KEY='leilao_oculto_alpha_20261020"))
  const packages=auction.split('const PACKAGES=[')[1]?.split('\n]\nlet timer=')[0]||''
  assert.equal(packages.split("  [{").length-1,4)
  assert.ok(auction.includes("const START=Date.parse('2026-10-27T14:30:00-03:00')"))
  assert.ok(auction.includes('shufflePackages()'))
  assert.ok(auction.includes('await finishLot(state,c)'))
  assert.ok(auction.includes('await prize(c,high.jid,lot.prize)'))
  assert.ok(auction.includes('pg_advisory_xact_lock'))
  assert.ok(auction.includes('otherAuctionGroups(state.groups,chat)'))
  assert.ok(auction.includes('queueAuctionBidNotices'))
  assert.ok(auction.includes('extendAuctionDeadline'))
})

test('leilão atual mantém consumíveis e Coringa sem cancelar os itens históricos',()=>{
  const packages=auction.split('const PACKAGES=[')[1]?.split('\n]\nlet timer=')[0]||''
  assert.ok(db.includes('elixir_leilao_1h_20261024'))
  assert.ok(db.includes('pergaminho_reclassificacao'))
  assert.ok(index.includes('XP_SPECIAL_ITEM_IDS'))
  for(const id of ['elixir_leilao_2h','pergaminho_leilao_10k','pergaminho_reclassificacao',
    'caixa_epica','caixa_lendaria','guaxinim_errante_20261027',
    'armadura_vigia_crepusculo_20261027','pocao_pet_full']){
    assert.ok(packages.includes(id),'prêmio ausente: '+id)
  }
  assert.ok(catalog.includes('guaxinim_errante_20261027'))
  assert.ok(auction.includes('totalLots:PACKAGES.length'))
})

test('valor e líder aparecem entre grupos; os prêmios permanecem ocultos',()=>{
  const msg=crossGroupBidNotice({lot:1,totalLots:3,bidder:'Augusto',value:2500000,nextMinimum:2550000,endsAt:Date.parse('2026-10-24T17:20:00-03:00')})
  assert.match(msg,/Augusto/)
  assert.match(msg,/2\.500\.000/)
  assert.match(msg,/2\.550\.000/)
  assert.match(msg,/Prêmios continuam secretos/)
  assert.doesNotMatch(msg,/Elmo do Soberano|Lince Astral/)
})
