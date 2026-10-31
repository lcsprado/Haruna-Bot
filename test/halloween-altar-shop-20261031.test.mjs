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
 assert.equal(halloweenAltarOpen(HALLOWEEN_SHOP_END),true)
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
 assert.match(relics,/boss:0\.06,raidAttack:0\.06,bossCrit:0\.02,raidCrit:0\.02/)
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
 assert.match(shop,/Altar disponível de/)
})

function makeFakeInventory(initialSoul=1000){
 let state={souls:initialSoul,claimed:[],items:{},ledger:[]}
 const tx=async fn=>{
  const backup=structuredClone(state)
  const query=async(sql,params=[])=>{
   if(sql.startsWith('SELECT jid FROM users'))return {rows:[{jid:'player'}],rowCount:1}
   if(sql.includes('INSERT INTO halloween_shop_2026')){
    const id=params[1]
    if(state.claimed.includes(id))return {rows:[],rowCount:0}
    state.claimed.push(id)
    return {rows:[{reward_id:id}],rowCount:1}
   }
   if(sql.includes('UPDATE inventories SET quantity=quantity-$3')){
    if(state.souls<params[2])return {rows:[],rowCount:0}
    state.souls-=params[2]
    return {rows:[{quantity:state.souls}],rowCount:1}
   }
   if(sql.includes('UPDATE inventories SET quantity=quantity-1')){
    const count=state.items[params[1]]||0
    if(!count)return {rows:[],rowCount:0}
    state.items[params[1]]=count-1
    return {rows:[{quantity:count-1}],rowCount:1}
   }
   if(sql.includes('INSERT INTO transactions')){state.ledger.push(params[1]);return {rows:[],rowCount:1}}
   throw new Error('unexpected SQL: '+sql)
  }
  try{return await fn({query})}
  catch(e){state=backup;throw e}
 }
 const credit=async (_client,_jid,itemId,qty)=>{state.items[itemId]=(state.items[itemId]||0)+qty}
 return {tx,credit,get:()=>structuredClone(state)}
}

test('purchase is atomic: souls deducted once, duplicate and insufficient redemptions leave inventory untouched',async()=>{
 const source=code.split('async function buyHalloweenAltarOffer(jid,offerId){')[1].split('// O baú comprado')[0]
 const factory=new Function('offers','isOpen','tx','nowSec','soulId','credit',
  'const HALLOWEEN_ALTAR_OFFERS=offers,halloweenAltarOpen=isOpen,HALLOWEEN_SOUL_ID=soulId; '+
  'return async function buyHalloweenAltarOffer(jid,offerId){'+source)
 const fake=makeFakeInventory(450)
 const buy=factory(HALLOWEEN_ALTAR_OFFERS,()=>true,fake.tx,()=>123,'alma_amaldicoada_20261026',fake.credit)
 const item=await buy('player','insignia')
 assert.equal(item.remaining,200)
 assert.equal(fake.get().items[HALLOWEEN_INSIGNIA_ID],1)
 await assert.rejects(buy('player','insignia'),/já resgatou/)
 assert.equal(fake.get().souls,200)
 await assert.rejects(buy('player','titulo'),/insuficientes/)
 assert.equal(fake.get().souls,200)
 assert.equal(fake.get().claimed.length,1)
 assert.equal(fake.get().ledger.length,1)
 const locked=makeFakeInventory(1000)
 const lockedBuy=factory(HALLOWEEN_ALTAR_OFFERS,()=>false,locked.tx,()=>123,'alma_amaldicoada_20261026',locked.credit)
 await assert.rejects(lockedBuy('player','caixa'),/abre/)
 assert.equal(locked.get().souls,1000)
})

test('opening Supreme Chest consumes exactly one, grants fixed loot, and cannot be repeated',async()=>{
 const source=code.split('async function openHalloweenSupremeChest(jid){')[1].split('async function buyCorcel(')[0]
 const factory=new Function('tx','nowSec','chest','contents','credit',
  'const HALLOWEEN_CHEST_ID=chest,HALLOWEEN_CHEST_CONTENTS=contents; '+
  'return async function openHalloweenSupremeChest(jid){'+source)
 const fake=makeFakeInventory(20)
 const state=fake.get()
 const seedCredit=fake.credit
 await seedCredit(null,'player',HALLOWEEN_CHEST_ID,1)
 const open=factory(fake.tx,()=>123,HALLOWEEN_CHEST_ID,HALLOWEEN_CHEST_CONTENTS,fake.credit)
 const got=await open('player')
 assert.equal(got.contents.length,4)
 assert.equal(fake.get().items[HALLOWEEN_CHEST_ID],0)
 for(const item of HALLOWEEN_CHEST_CONTENTS)assert.equal(fake.get().items[item.itemId],item.quantity)
 await assert.rejects(open('player'),/não possui/)
 assert.equal(fake.get().ledger.length,1)
})

test('Hallloween insignia and title actually provide PvE rewards',async()=>{
 const {halloweenTitleBonusXp}=await import('../src/neon/halloween-altar.js')
 assert.equal(halloweenTitleBonusXp(1000,true),1100)
 assert.equal(halloweenTitleBonusXp(1000,false),1000)
 assert.match(code,/halloweenSoulMultiplier\(\)/)
 assert.match(code,/const titleOwned=await ownsHalloweenTitle\(c,player.jid\)/)
 assert.match(code,/halloweenTitleBonusXp\(kind===/)
 const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 assert.match(games,/async function halloweenPveXp\(c,jid,xp\)/)
 assert.match(games,/baseGain=await halloweenPveXp\(/)
 assert.match(games,/const exp=await halloweenPveXp\(c,p.jid,/)
 assert.doesNotMatch(code,/\+1% de dano em Boss\/Raid/)
})
