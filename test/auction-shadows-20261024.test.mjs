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

test('três lotes de consumíveis, uma edição nova, sem reutilizar dinheiro dos leilões passados',()=>{
  assert.match(auction,/const KEY='leilao_consumiveis_tres_lotes_20261024_v1'/)
  const packages=auction.split('const PACKAGES=[')[1]?.split('\n]\nlet timer=')[0]||''
  assert.equal(packages.split("  [{").length-1,3)
  assert.match(auction,/const START=Date\.parse\('2026-10-24T18:30:00-03:00'\)/)
  assert.match(auction,/shufflePackages\(\)/)
  assert.match(auction,/await finishLot\(state,c\)/)
  assert.match(auction,/await prize\(c,high\.jid,lot\.prize\)/)
  assert.match(auction,/pg_advisory_xact_lock/)
  assert.match(auction,/otherAuctionGroups\(state\.groups,chat\)/)
  assert.match(auction,/queueAuctionBidNotices/)
  assert.match(auction,/extendAuctionDeadline/)
  assert.doesNotMatch(auction,/const KEY='leilao_oculto_alpha_20261020/)
})

test('prêmios são consumíveis utilizáveis e nenhum lote oferece equipamentos ou pets',()=>{
  const packages=auction.split('const PACKAGES=[')[1]?.split('\n]\nlet timer=')[0]||''
  assert.match(db,/elixir_leilao_1h_20261024:\{type:'boost'.*seconds:60\*60/)
  assert.match(db,/pergaminho_reclassificacao/)
  assert.match(index,/XP_SPECIAL_ITEM_IDS=.*elixir_leilao_1h_20261024/)
  for(const id of ['elixir_leilao_2h','pergaminho_leilao_10k','pergaminho_reclassificacao','caixa_epica','caixa_lendaria','elixir_leilao_1h_20261024']){
    assert.ok(packages.includes(id),'prêmio ausente: '+id)
  }
  assert.doesNotMatch(packages,/pet:|elmo_|bota_|espada_|armadura_/)
  assert.match(auction,/3 lotes misteriosos, somente consumíveis/)
  assert.match(auction,/totalLots:PACKAGES\.length/)
})

test('valor e líder aparecem entre grupos; os prêmios permanecem ocultos',()=>{
  const msg=crossGroupBidNotice({lot:1,totalLots:3,bidder:'Augusto',value:2500000,nextMinimum:2550000,endsAt:Date.parse('2026-10-24T17:20:00-03:00')})
  assert.match(msg,/Augusto/)
  assert.match(msg,/2\.500\.000/)
  assert.match(msg,/2\.550\.000/)
  assert.match(msg,/Prêmios continuam secretos/)
  assert.doesNotMatch(msg,/Elmo do Soberano|Lince Astral/)
})
