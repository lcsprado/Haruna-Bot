import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const next=read('../src/neon/auction-reliquias-20261029.js')
const prior=read('../src/neon/auction-alpha.js')
const entry=read('../src/neon/index.js')
const web=read('../src/neon/web-api.js')
const source=next.match(/const PACKAGES=(\[[\s\S]*?\])\nlet timer=/)?.[1]
const packages=source?new Function('return '+source)():[]

test('nova edição isolada às 19h de 29/10 e quatro lotes únicos',()=>{
  assert.match(next,/const KEY='leilao_quatro_destinos_20261029_1900_v1'/)
  assert.match(next,/const START=Date.parse\('2026-10-29T19:00:00-03:00'\)/)
  assert.match(next,/const END=Date.parse\('2026-10-29T20:00:00-03:00'\)/)
  assert.equal(packages.length,4)
  assert.equal(packages.filter(p=>p.length<2).length,0)
  assert.match(prior,/const KEY='leilao_quatro_destinos_20261027_1430_v1'/)
  assert.match(next,/pg_advisory_xact_lock/)
  assert.match(next,/extendAuctionDeadline/)
})
test('exatamente 1 invocação da collab, consumível oficial',()=>{
  const essences=packages.flat().filter(p=>p.id?.startsWith('essencia_pecado_'))
  assert.equal(essences.length,1)
  assert.equal(essences[0].qty,7)
  assert.equal(essences[0].id,'essencia_pecado_preguica')
  assert.match(next,/personagem, arma ou armadura/)
})
test('lotes atrativos sem alteração de estatísticas e com prêmios existentes',()=>{
  const rewards=packages.flat()
  assert.equal(rewards.filter(x=>x.pet).length,1)
  assert.equal(rewards.find(x=>x.pet)?.pet,'guaxinim_errante_20261027')
  for(const id of ['caixa_lendaria','caixa_epica','armadura_vigia_crepusculo_20261027','elixir_leilao_2h','pergaminho_leilao_10k','fragmento_universal_raid','pergaminho_reclassificacao','pocao_pet_full','pedra_fortaleza_alpha']){
    assert.ok(rewards.some(x=>x.id===id),id)
  }
  assert.equal(rewards.find(x=>x.id==='fragmento_universal_raid')?.qty,50)
})
test('WhatsApp e Web usam a mesma edição, com reserva/reembolso e prêmios secretos',()=>{
  assert.match(entry,/from '\.\/auction-reliquias-20261029\.js'/)
  assert.match(web,/from '\.\/auction-reliquias-20261029\.js'/)
  assert.match(next,/UPDATE wallets SET cash=cash\+\$1,bank=bank\+\$2/)
  assert.match(next,/UPDATE wallets SET cash=cash-\$1,bank=bank-\$2/)
  assert.match(next,/queueAuctionBidNotices\(c/)
  const api=next.slice(next.indexOf('export async function getAuctionWebStatus('),next.indexOf('export async function placeAuctionWebBid('))
  assert.doesNotMatch(api,/lot\.prize|state\.salt|state\.seal/)
  assert.match(api,/totalLots:PACKAGES\.length/)
})
