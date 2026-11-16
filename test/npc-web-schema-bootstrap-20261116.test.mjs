import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const bot=read('../src/neon/index.js')
const npc=read('../src/neon/npc-shops.js')
const city=read('../src/neon/city.js')
const api=read('../src/neon/web-api.js')
const app=read('../web/app.js')

test('NPC merchant and city schemas are initialized before the bot starts accepting actions',()=>{
  assert.match(bot,/import \{initNpcShops\} from '\.\/npc-shops\.js'/)
  assert.match(bot,/import \{initCity\} from '\.\/city\.js'/)
  const start=bot.slice(bot.indexOf('async function start() {'),bot.indexOf('async function start() {')+850)
  const initDb=start.indexOf('await initDatabase()')
  const initCity=start.indexOf('await initCity()')
  const initNpc=start.indexOf('await initNpcShops()')
  const initHeroes=start.indexOf('await initPlayableHeroes()')
  assert.ok(initDb>=0 && initDb<initCity && initCity<initNpc && initNpc<initHeroes,
    'Schema bootstrap must run after base database and before Web/UI actions')
})

test('initNpcShops creates purchases and index idempotently with correct constraints',()=>{
  assert.match(npc,/export async function initNpcShops\(\)/)
  assert.match(npc,/CREATE TABLE IF NOT EXISTS alpha_npc_purchases/)
  assert.match(npc,/REFERENCES users\(jid\) ON DELETE CASCADE/)
  assert.match(npc,/REFERENCES items\(id\)/)
  assert.match(npc,/CREATE INDEX IF NOT EXISTS alpha_npc_purchase_period_idx/)
  assert.match(npc,/quantity=1/)
  assert.match(npc,/spent>0/)
  assert.match(npc,/purchaseStats\(db,jid,period\)/)
})

test('NPC merchant dependency on city reputation has a matching initialization',()=>{
  assert.match(city,/export async function initCity\(\)/)
  assert.match(city,/CREATE TABLE IF NOT EXISTS alpha_city_reputation/)
  assert.match(city,/trust INTEGER NOT NULL DEFAULT 0/)
  assert.match(city,/notoriety INTEGER NOT NULL DEFAULT 0/)
  assert.match(city,/getCityMerchantModifier\(jid,npcId\)/)
  assert.match(npc,/getCityMerchantModifier\(jid,n\.id\)/)
})

test('Web NPC page uses the authenticated API and existing purchase logic only',()=>{
  assert.match(api,/url\.pathname==='\/api\/v1\/me\/npcs'/)
  assert.match(api,/await listNpcShops\(session\.jid\)/)
  assert.match(api,/await Promise\.all\(listing\.merchants\.map\(n=>getNpcShop\(session\.jid,n\.id\)\)\)/)
  assert.match(api,/case 'npc\.buy': return buyNpcShopItem/)
  assert.match(app,/api\('\/api\/v1\/me\/npcs'\)/)
  assert.match(app,/data-npc-buy/)
})
