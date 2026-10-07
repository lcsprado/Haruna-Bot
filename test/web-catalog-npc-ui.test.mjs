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
  assert.match(app,/selected\.equipped\.map\(i=>inventoryCard/)
  assert.match(app,/selected\.available\.map\(i=>inventoryCard/)
  assert.match(app,/g\.all\.length/)
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
  assert.match(db,/if\(!isRegularShopItem\(item\)\)/)
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


test('contratos do WhatsApp estão expostos no Web sem sistema paralelo',()=>{
  assert.match(app,/\['contracts','📜','Contratos'\]/)
  assert.match(api,/getAlphaContractBoard/)
  assert.match(api,/acceptAlphaContract/)
  assert.match(api,/claimAlphaContract/)
  assert.match(api,/\/api\/v1\/me\/contracts/)
  assert.match(app,/data-contract-accept/)
  assert.match(app,/data-contract-claim/)
})

test('auditoria visual impede sprite de item colapsado e ID técnico de pet',()=>{
  const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8')
  assert.match(css,/\.item-art \.item-cropped-art\{[\s\S]*?width:auto!important;[\s\S]*?max-width:100%!important;[\s\S]*?height:140px!important/)
  assert.doesNotMatch(css,/\.item-art \.item-cropped-art\{[\s\S]*?background-position:center!important/)
  assert.doesNotMatch(app,/>ID '\+p\.id/)
  const specialPos=app.indexOf("if(PREMIUM_PET_SPRITES[exclusive])")
  const vectorPos=app.indexOf("if(PET_VERIFIED_VECTOR_ASSETS.has(s))")
  assert.ok(specialPos>0 && vectorPos>specialPos,'pet de Raid deve priorizar arte exclusiva antes do vetor genérico')
  assert.match(app,/urso_runico:'fixed-urso-runico'/)
  assert.doesNotMatch(app,/PET_VERIFIED_VECTOR_ASSETS=new Set\([^;]*"urso_runico"/)
})


test('abas do inventário preservam posição horizontal e fragmentos caem em Raid',()=>{
  assert.match(app,/inventoryTabsScrollLeft/)
  assert.match(app,/window\.scrollTo\(\{top:keepY/)
  assert.match(app,/next\.scrollLeft=keepX/)
  assert.match(app,/text\.includes\('fragmento'\)/)
  assert.match(app,/text\.includes\('conquistado na raid'\)/)
})
