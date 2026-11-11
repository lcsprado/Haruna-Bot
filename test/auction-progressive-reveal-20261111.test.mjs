import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {ANTI_CRIT_SHIELDS,antiCritShieldStats} from '../src/neon/anti-crit-shields.js'

const source=readFileSync(new URL('../src/neon/auction-20261111-1230.js',import.meta.url),'utf8')
const apiSource=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const group='120363429534634131@g.us'
const lots=[
 {min:20000000,step:500000,prize:[{id:'egide_crepusculo',qty:1}]},
 {min:5000000,step:500000,prize:[{xp:120000},{id:'fragmento_ascensao_pecados_20261024',qty:20},{id:'elixir_leilao_2h',qty:1}]},
 {min:30000000,step:500000,prize:[{id:'voucher_mercado_negro_petraid_20261105',qty:1},{id:'caixa_lendaria',qty:3},{id:'chave_raid_75',qty:2}]}
]
function getExports(state){
 const script=source.replace(/^import .*$/gm,'').replace(/^export (async )?/gm,'$1')
 const context={db:{query:async()=>({rows:[{value:state}]})},Date,console}
 return vm.runInNewContext(script+';({getAuctionWebStatus,status})',context,{timeout:1500})
}
test('evento 11/11 12h30, lotes, lances e valores autorizados',()=>{
 assert.match(source,/2026-11-11T12:30:00-03:00/)
 assert.match(source,/LOT_OPENINGS=\[20000000,5000000,30000000\]/)
 assert.match(source,/const STEP=500000|STEP=500000/)
 assert.equal(lots.length,3)
 assert.match(apiSource,/from '\.\/auction-20261111-1230\.js'/)
})
test('Web só revela prêmio da rodada atual ou lotes encerrados',async()=>{
 for(const phase of ['pending','running','completed']){
  for(const lot of [0,1,2]){
    const state={phase,lot,lots,groups:[group],high:null,history:[],ends:Date.now()+60000}
    const web=await getExports(state).getAuctionWebStatus({chat:group,sender:'player'})
    assert.equal(web.totalLots,3)
    for(let i=0;i<3;i++){
      const visible=phase==='completed'||(phase==='running'&&i<=lot)
      const description=web.lots[i].description
      assert.equal(description.includes('🔒'),!visible,'lote '+i+' em '+phase+' '+lot)
      if(!visible)assert.ok(!/Crepúsculo|Domador|Ampulheta|Fragmentos/.test(description))
    }
  }
 }
})
test('WhatsApp divulga somente o lote atual, nunca a lista completa',()=>{
 const code=source.split('function status(state){')[1].split('async function prize(')[0]
 assert.match(code,/publicPrize\(lot\.prize\)/)
 assert.doesNotMatch(code,/publicCatalog\(state\.lots\)|PACKAGES\.map.*publicPrize/)
 assert.ok(!source.includes('Aberturas R$ 8M/15M/20M/10M'))
})
test('escudo lendário registrado com bônus inferior ao Cerco',()=>{
 const item=ANTI_CRIT_SHIELDS.find(x=>x.id==='egide_crepusculo')
 const war=ANTI_CRIT_SHIELDS.find(x=>x.id==='bastiao_eclipse')
 assert.equal(item.category,'shield')
 assert.equal(item.critResist,.11)
 assert.equal(item.critGuard,.16)
 assert.ok(item.critResist<war.critResist)
 assert.ok(item.critGuard<war.critGuard)
 assert.ok(antiCritShieldStats(item.id,10,5).critResist>item.critResist)
})
