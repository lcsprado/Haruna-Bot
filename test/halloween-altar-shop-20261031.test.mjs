import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {HALLOWEEN_CORCEL_COST,HALLOWEEN_SHOP_END,HALLOWEEN_GEAR} from '../src/neon/halloween-rules.js'
import {
 HALLOWEEN_ALTAR_START,HALLOWEEN_ALTAR_OFFERS,HALLOWEEN_ALTAR_ITEMS,
 HALLOWEEN_CHEST_ID,HALLOWEEN_CHEST_CONTENTS,HALLOWEEN_INSIGNIA_ID,
 HALLOWEEN_TITLE_ID,halloweenAltarOpen,halloweenAltarOffer,halloweenAltarCatalogText
} from '../src/neon/halloween-altar.js'

const code=readFileSync(new URL('../src/neon/halloween-alpha.js',import.meta.url),'utf8')
const relics=readFileSync(new URL('../src/neon/relics.js',import.meta.url),'utf8')
const profile=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

test('Altar only opens on Saturday October 31st in Sao Paulo',()=>{
 assert.equal(HALLOWEEN_ALTAR_START,Date.parse('2026-10-31T00:00:00-03:00'))
 assert.equal(halloweenAltarOpen(HALLOWEEN_ALTAR_START-1),false)
 assert.equal(halloweenAltarOpen(HALLOWEEN_ALTAR_START),true)
 assert.equal(halloweenAltarOpen(HALLOWEEN_SHOP_END-1),true)
 assert.equal(halloweenAltarOpen(HALLOWEEN_SHOP_END),false)
 assert.equal(HALLOWEEN_CORCEL_COST,100)
})
test('four new rewards preserve promised prices and boss-only exclusive drops',()=>{
 assert.deepEqual(Object.values(HALLOWEEN_ALTAR_OFFERS).map(x=>x.cost),[150,250,400,600])
 assert.equal(halloweenAltarOffer('caixa')?.itemId,'caixa_lendaria')
 assert.equal(halloweenAltarOffer('insígnia')?.itemId,HALLOWEEN_INSIGNIA_ID)
 assert.equal(halloweenAltarOffer('título')?.itemId,HALLOWEEN_TITLE_ID)
 assert.equal(halloweenAltarOffer('baú')?.itemId,HALLOWEEN_CHEST_ID)
 assert.equal(halloweenAltarOffer('inexistente'),null)
 assert.equal(HALLOWEEN_GEAR.length,4)
 assert.ok(HALLOWEEN_GEAR.every(item=>!HALLOWEEN_ALTAR_ITEMS.some(a=>a.id===item.id)))
 const text=halloweenAltarCatalogText()
 assert.match(text,/150 Almas/)
 assert.match(text,/250 Almas/)
 assert.match(text,/400 Almas/)
 assert.match(text,/600 Almas/)
})
test('exclusive items exist and are permanently untradeable with no upgrades to collab gear',()=>{
 assert.equal(HALLOWEEN_ALTAR_ITEMS.length,4)
 assert.equal(new Set(HALLOWEEN_ALTAR_ITEMS.map(i=>i.id)).size,4)
 assert.match(code,/for\(const item of HALLOWEEN_ALTAR_ITEMS\)/)
 assert.match(code,/sellable=FALSE,stackable=FALSE/)
 assert.match(relics,/\[HALLOWEEN_INSIGNIA_ID\]/)
 assert.match(relics,/boss:0\.01,raidAttack:0\.01/)
 assert.ok(profile.includes(HALLOWEEN_TITLE_ID))
 assert.match(profile,/halloweenTitleRows/)
 assert.match(profile,/halloweenTitle\?' • '/)
})
test('supreme chest guarantees the announced loot without rare RNG',()=>{
 assert.deepEqual(HALLOWEEN_CHEST_CONTENTS.map(i=>[i.itemId,i.quantity]).slice(0,3),[
  ['caixa_lendaria',4],['caixa_epica',4],['pocao_pet_full',2]
 ])
 assert.equal(HALLOWEEN_CHEST_CONTENTS.length,4)
 assert.equal(HALLOWEEN_CHEST_CONTENTS[3].quantity,1)
 assert.ok(!HALLOWEEN_CHEST_CONTENTS.some(i=>HALLOWEEN_GEAR.some(g=>g.id===i.itemId)))
})
test('no new WhatsApp group announcement; Altar is not revealed before Saturday',()=>{
 const scheduler=code.split('export function scheduleHalloweenAlpha(')[1]
 assert.ok(scheduler)
 assert.doesNotMatch(scheduler,/halloweenAltarCatalogText|HALLOWEEN_ALTAR_OFFERS|ALTAR DAS ALMAS/)
 const shop=code.split("if(['loja','altar'].includes(action))")[1].split("if(['ranking','top'].includes(action))")[0]
 assert.match(shop,/if\(!halloweenAltarOpen\(\)\)/)
 assert.match(shop,/halloweenAltarCatalogText\(\)/)
 assert.match(shop,/Altar fechado/)
})
