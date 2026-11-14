import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {planInventoryAutoForge} from '../src/neon/auto-forge-inventory-plan.js'
const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const base={itemId:'exterminadora_eclipse',name:'Exterminadora do Eclipse',
 category:'weapon',rarity:'legendary',quantity:4,tiers:[],forged:null,
 bound:0,equipped:false,upgradeBase:40000,cash:30000000,bank:0,
 materials:160,materialId:'essencia_eclipse',
 materialName:'Essência do Eclipse',materialCosts:[0,30,50,80,120],
 shieldFees:{},shopStandard:false,collab:false}

test('4 lendarios Lv.1 => 3 fusoes e ★4 Lv.10; sem compras',()=>{
 const p=planInventoryAutoForge(base)
 assert.equal(p.canExecute,true)
 assert.equal(p.starsBefore,1)
 assert.equal(p.starsAfter,4)
 assert.equal(p.finalLevel,10)
 assert.equal(p.steps.length,3)
 assert.deepEqual(p.donorLevels,[1,1,1])
 assert.equal(p.quantityBefore,4)
 assert.equal(p.quantityAfter,1)
 assert.equal(p.fragments,160)
 assert.equal(p.upgrades,12600000)
 assert.equal(p.serviceFee,3*25000+1260000)
 assert.equal(p.total,13935000)
 assert.equal(p.consumedTiers.length,0)
})

test('aprimoramentos pagos de Lv.10 sao descontados e copias extras ficam intactas',()=>{
 const p=planInventoryAutoForge({...base,tiers:[{level:10,quantity:2}],
 materials:30})
 assert.equal(p.starsAfter,2)
 assert.equal(p.steps.length,1)
 assert.equal(p.steps[0].principalFrom,10)
 assert.equal(p.steps[0].donorLevel,10)
 assert.equal(p.upgrades,1800000)
 assert.deepEqual(p.consumedTiers,[{level:10,qty:2}])
 assert.equal(p.quantityAfter,3)
})

test('usa apenas dinheiro disponivel: 1 fusao quando o saldo nao paga 2',()=>{
 const p=planInventoryAutoForge({...base,cash:6000000,materials:160})
 assert.equal(p.steps.length,1)
 assert.equal(p.starsAfter,2)
 assert.ok(p.total<=6000000)
})

test('saldo insuficiente nao autoriza cobranca, mas mostra quanto falta',()=>{
 const p=planInventoryAutoForge({...base,cash:10000,bank:0})
 assert.equal(p.canExecute,false)
 assert.equal(p.potential,true)
 assert.equal(p.steps.length,0)
 assert.ok(p.shortage>0)
})

test('copia equipada preservada e outras livres doadas',()=>{
 const p=planInventoryAutoForge({...base,equipped:true,quantity:4})
 assert.equal(p.starsAfter,4)
 assert.equal(p.quantityAfter,1)
 assert.equal(planInventoryAutoForge({...base,equipped:true,quantity:1}),null)
 assert.equal(planInventoryAutoForge({...base,bound:3,equipped:true}),null)
})

test('escudos consomem apenas doadores Lv.1 e cobram taxa oficial',()=>{
 const p=planInventoryAutoForge({...base,itemId:'egide_crepusculo',
  name:'Egide',category:'shield',quantity:3,tiers:[{level:7,quantity:1}],
  materialId:'',materials:0,rarity:'legendary',shieldFees:{1:112500,2:225000,
   3:337500,4:450000},collab:false})
 assert.equal(p.starsAfter,3)
 assert.deepEqual(p.donorLevels,[1,1])
 assert.equal(p.fragments,0)
 assert.equal(p.forgeFees,337500)
 assert.ok(p.total>p.upgrades+p.forgeFees)
 // O escudo Lv.7 nao e convertido em doador ou principal por engano.
 assert.equal(p.principalLevel,1)
 assert.deepEqual(p.consumedTiers,[])
 assert.equal(planInventoryAutoForge({...base,itemId:'escudo_ferro',
   category:'shield',quantity:2,tiers:[{level:10,quantity:1}],
   shieldFees:{1:7500},materialId:'',materials:0}),null)
})

test('copia comum vinculada nao vira doadora de uma forja ja estrelada',()=>{
 const quote=planInventoryAutoForge({...base,
   forged:{stars:2,level:10},quantity:3,
   tiers:[{level:10,quantity:1}],bound:1,materials:50})
 assert.equal(quote.canExecute,true)
 assert.equal(quote.starsAfter,3)
 assert.deepEqual(quote.donorLevels,[1])
 assert.deepEqual(quote.consumedTiers,[])
 assert.equal(quote.quantityAfter,2)
 const blocked=planInventoryAutoForge({...base,
   forged:{stars:2,level:10},quantity:2,bound:1,materials:50})
 assert.equal(blocked,null)
})

test('sete pecados: 1 unica copia + 280 fragmentos => ★5 sem consumir copia',()=>{
 const p=planInventoryAutoForge({...base,itemId:'pecados_courechouse',
  quantity:1,materials:280,materialId:'fragmento_ascensao_pecados_20261024',
  collab:true})
 assert.equal(p.starsAfter,5)
 assert.equal(p.steps.length,4)
 assert.equal(p.donorLevels.length,0)
 assert.equal(p.quantityAfter,1)
 assert.equal(p.fragments,280)
})

test('nenhum item shop e comprado, status e custo congelados ate confirmacao',()=>{
 assert.match(source,/export async function listAutoForgeInventoryOptions/)
 assert.match(source,/export async function getAutoForgeInventoryQuote/)
 assert.match(source,/export async function executeAutoForgeInventory/)
 const start=source.indexOf('async function autoForgeInventoryQuoteClient(')
 const end=source.indexOf('// !forja5 e separado',start)
 const code=source.slice(start,end)
 assert.ok(code.includes("equipment-forge:"+ "'+jid'")||code.includes("['equipment-forge:'+jid]"))
 assert.ok(code.includes('plan.quoteKey!==expectedQuoteKey'))
 assert.ok(code.includes("UPDATE wallets SET cash=cash-$1,bank=bank-$2"))
 assert.ok(code.includes("await syncEffectiveGear(c,jid,itemId)"))
 assert.ok(!code.includes('INSERT INTO inventories(jid,item_id,quantity)'),
  'Autoforja nao pode comprar nem criar copias')
 assert.ok(code.includes("equipment_inventory_auto_forge"))
 assert.ok(bot.includes("cmd==='autoforja'"))
 assert.ok(bot.includes("flow.stage==='autoforge_select'"))
 assert.ok(bot.includes("flow.stage==='autoforge_confirm'"))
 assert.ok(bot.includes('clearQuickFlow(chat,sender)'))
})

test('quote invalida apos mudanca do saldo, material, nivel ou quantidade',()=>{
 const p=planInventoryAutoForge(base)
 for(const diff of [
  {cash:base.cash-1},{materials:base.materials-1},
  {quantity:5},{tiers:[{level:4,quantity:1}]},
  {bound:1},{forged:{stars:2,level:8}}
 ]){
  const q=planInventoryAutoForge({...base,...diff})
  if(q?.canExecute)assert.notEqual(q.quoteKey,p.quoteKey,JSON.stringify(diff))
 }
})
