import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const npc=readFileSync(new URL('../src/neon/npc-shops.js',import.meta.url),'utf8')

test('inventário usa abas selecionadas, sem renderizar todos os grupos',()=>{
  assert.match(app,/data-inventory-tab/)
  assert.match(app,/ui\.inventoryTab/)
  assert.match(app,/selected\.items\.map\(i=>inventoryCard/)
  assert.doesNotMatch(app,/groups\.map\(\(\[key,label\]\)=>\{[\s\S]*?const sections=/)
  assert.match(app,/sellable_quantity/)
  assert.match(app,/PROTEGIDO DE VENDA/)
})

test('NPC Web compartilha a fonte de verdade de compras e reputação',()=>{
  assert.match(api,/import \{ listNpcShops, getNpcShop, buyNpcShopItem \} from '\.\/npc-shops\.js'/)
  assert.match(api,/case 'npc\.buy': return buyNpcShopItem/)
  assert.match(api,/\/api\/v1\/me\/npcs/)
  assert.match(npc,/requiredKarma:/)
  assert.match(npc,/fragmentsRemaining:/)
  assert.match(app,/data-npc-buy/)
  assert.match(app,/Compras restantes:/)
})

test('loja exclui registros legados também no endpoint de compra',()=>{
  assert.match(db,/const REGULAR_SHOP_IDS = new Set/)
  assert.match(db,/return rows\.filter\(isRegularShopItem\)/)
  assert.match(db,/if\(item\.id==='pergaminho_reclassificacao' \|\| !isRegularShopItem\(item\)\)/)
  assert.doesNotMatch(db,/REGULAR_SHOP_IDS = new Set\([^;]*lootbox_std/)
})

test('apresentação dos resultados nunca despeja objeto da API em pré-formatado',()=>{
  const segment=app.slice(app.indexOf('function prettyResult('),app.indexOf('function renderCombatResult('))
  assert.doesNotMatch(segment,/<pre/)
  assert.doesNotMatch(segment,/JSON\.stringify/)
  assert.match(segment,/value\.details/)
  assert.match(segment,/driver\.name/)
  assert.match(app,/Última ação/)
  assert.doesNotMatch(app,/<h3>Resultado<\/h3><button/)
})

test('linguagem da loja não mostra gacha ao jogador',()=>{
  assert.match(app,/description\.replace\(\/item random gacha/)
  assert.match(app,/Abra para receber uma recompensa aleatória/)
})
