import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolveAstralLynxWildcard} from '../src/neon/pet-astral-wildcard.js'
import {PECADOS_ARMORS} from '../src/neon/sete-pecados-catalog.js'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const auction=read('../src/neon/auction-alpha.js')
const db=read('../src/neon/db.js')
const catalog=read('../src/neon/game-catalog.js')
const packagesSource=auction.match(/const PACKAGES=(\[[\s\S]*?\])\nlet timer=/)?.[1]
const packages=packagesSource?new Function('return '+packagesSource)():[]

test('leilão isolado 27/10 14h30 com quatro lotes ocultos',()=>{
 assert.match(auction,/const KEY='leilao_quatro_destinos_20261027_1430_v1'/)
 assert.match(auction,/const START=Date.parse\('2026-10-27T14:30:00-03:00'\)/)
 assert.match(auction,/const END=Date.parse\('2026-10-27T15:30:00-03:00'\)/)
 assert.equal(packages.length,4)
 assert.ok(packages.every(x=>x.length>=2))
 assert.match(auction,/const OPENING=250000/)
 assert.match(auction,/const STEP=100000/)
 assert.match(auction,/shufflePackages\(\)/)
 assert.match(auction,/extendAuctionDeadline/)
 assert.match(auction,/pg_advisory_xact_lock/)
})

test('pet neutro moderado, armadura menor que todas as armaduras da collab',()=>{
 const pets=packages.flat().filter(x=>x.pet)
 assert.deepEqual(pets.map(x=>x.pet),['guaxinim_errante_20261027'])
 assert.equal(pets[0].power,70)
 assert.match(catalog,/guaxinim_errante_20261027:\{label:/)
 assert.match(db,/guaxinim_errante_20261027'\]/)
 const armor=packages.flat().filter(x=>x.id==='armadura_vigia_crepusculo_20261027')
 assert.equal(armor.length,1)
 assert.ok(PECADOS_ARMORS.every(x=>x.def>88&&x.hp>150))
 assert.match(db,/armadura_vigia_crepusculo_20261027:\s*\{category:'armor',atk:0,def:88,hp:150,crit:\.01/)
 assert.match(auction,/88 DEF, 150 HP e 1% crítico/)
})

test('coringa cabe em qualquer sinergia e não concede duas ao mesmo tempo',()=>{
 for(const [otherStyles,expectedStyle,universal] of [
   [['voador','voador'],'voador',false],
   [['mistico','mistico'],'mistico',false],
   [['guardiao','guardiao'],'guardiao',false],
   [['predador','predador'],'predador',false],
   [['mistico','predador'],'coringa',true]
 ]){
  const x=resolveAstralLynxWildcard(['fenix_celestial','golem_ancestral','guaxinim_errante_20261027'],[...otherStyles,null])
  assert.equal(x?.style,expectedStyle)
  assert.equal(x?.universal,universal)
 }
 assert.equal(resolveAstralLynxWildcard(['guaxinim_errante_20261027','guaxinim_errante_20261027','fenix_celestial'],[null,null,'voador']),null)
})

test('quatro lotes têm consumíveis e materiais úteis além de pergaminho',()=>{
 const items=packages.flat().filter(x=>x.id)
 for(const id of ['elixir_leilao_2h','pergaminho_reclassificacao','pergaminho_leilao_10k',
    'caixa_epica','caixa_lendaria','fragmento_universal_raid','pocao_pet_full',
    'pedra_precisao_alpha','pedra_fortaleza_alpha']){
  assert.ok(items.some(x=>x.id===id),'prêmio ausente: '+id)
 }
 assert.equal(packages.flat().filter(x=>x.id==='pergaminho_reclassificacao').length,1)
})

test('lances reservados e reembolsos duráveis, web não vaza prêmios',()=>{
 assert.match(auction,/cash=cash\+\$1,bank=bank\+\$2/)
 assert.match(auction,/UPDATE wallets SET cash=cash-\$1,bank=bank-\$2/)
 assert.match(auction,/queueAuctionBidNotices\(c/)
 const web=auction.slice(auction.indexOf('export async function getAuctionWebStatus('),auction.indexOf('export async function placeAuctionWebBid('))
 assert.doesNotMatch(web,/lot\.prize|state\.salt|state\.seal/)
 assert.match(auction,/totalLots:PACKAGES\.length/)
})
