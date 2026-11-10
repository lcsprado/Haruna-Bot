import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {planShopForge5,FORJA5_SERVICE_FEE} from '../src/neon/shop-forge5-plan.js'

const base = {
 itemId:'espada_aco',name:'Espada de Aco',category:'weapon',rarity:'common',
 price:20000,upgradeBase:1500,quantity:0,tiers:[],cash:10_000_000,bank:0
}
const plan = patch=>planShopForge5({...base,...patch})

test('comeca do zero: 5 copias reais, 4 doadoras e custo integral em uma transacao',()=>{
 const p=plan({})
 assert.equal(p.buyCopies,5)
 assert.equal(p.donorsRequired,4)
 assert.equal(p.purchases,100000)
 assert.equal(p.upgrades,405*1500)
 assert.equal(p.serviceFee,FORJA5_SERVICE_FEE)
 assert.equal(p.total,100000+405*1500+500000)
 assert.equal(p.canExecute,true)
 assert.deepEqual(p.consumedTiers,[])
})

test('reaproveita principal e doadoras em niveis diferentes sem cobrar upgrades anteriores',()=>{
 const p=plan({quantity:4,tiers:[{level:10,quantity:1},{level:2,quantity:1}]})
 assert.equal(p.principalLevel,10)
 assert.deepEqual(p.donorLevels,[2,1,1])
 assert.equal(p.buyCopies,1)
 assert.equal(p.upgrades,359*1500)
 assert.deepEqual(p.consumedTiers,[{level:10,count:1},{level:2,count:1}])
})
test('ja forjada ★3 Lv7 usa duas doadoras e preserva o progresso',()=>{
 const p=plan({quantity:3,forged:{stars:3,level:7},tiers:[{level:10,quantity:2}]})
 assert.equal(p.buyCopies,0)
 assert.equal(p.upgrades,(24+90)*1500)
 assert.deepEqual(p.consumedTiers,[{level:10,count:2}])
})
test('copias vinculadas e equipadas extras nunca sao usadas como doadoras',()=>{
 const p=plan({quantity:3,tiers:[{level:10,quantity:1}],protectedCount:2,equipped:true})
 assert.equal(p.principalLevel,10)
 assert.equal(p.buyCopies,3)
 assert.equal(p.donorLevels.length,1)
})
test('escudo usa doadoras comuns Lv1 e preserva custos de estrelas existentes',()=>{
 const p=plan({itemId:'escudo_runico',category:'shield',rarity:'rare',upgradeBase:7000,
   quantity:5,tiers:[{level:5,quantity:2}],shieldFees:{1:22500,2:45000,3:67500,4:90000}})
 assert.equal(p.donorLevels.length,3)
 assert.equal(p.buyCopies,1)
 assert.equal(p.upgrades,180*7000)
 assert.equal(p.forgeFees,225000)
})
test('sem saldo so informa o valor faltante, e concluido nao cobra novamente',()=>{
 const a=plan({cash:100,bank:200})
 assert.equal(a.canExecute,false)
 assert.equal(a.shortage,a.total-300)
 const b=plan({quantity:1,forged:{stars:5,level:10},cash:100,bank:200})
 assert.equal(b.alreadyFull,true)
 assert.equal(b.total,0)
})
test('integra somente loja regular; nao modifica forja das raids',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(db,/export async function completeShopForge5\(/)
 assert.match(db,/isRegularShopItem\(item\)/)
 assert.match(db,/Boolean\(RAID_GEAR_FORGE_ORIGINS\[itemId\]\)/)
 assert.match(db,/pg_advisory_xact_lock/)
 assert.match(db,/await syncEffectiveGear\(c,jid,itemId\)/)
 assert.match(db,/equipment_shop_forge5/)
 assert.match(app,/shopforge5_select/)
 assert.match(app,/shopforge5_confirm/)
 assert.match(app,/forja5/)
})
