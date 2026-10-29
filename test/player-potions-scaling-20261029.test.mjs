import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PLAYER_POTIONS,playerPotionHealAmount} from '../src/neon/player-potions.js'

test('cura dos personagens escala com HP máximo em todas as faixas',()=>{
  assert.deepEqual(
    ['pocao_p','pocao_m','pocao_g','elixir_supremo'].map(id=>playerPotionHealAmount(id,3906)),
    [391,782,1563,3906]
  )
  assert.deepEqual(
    ['pocao_p','pocao_m','pocao_g','elixir_supremo'].map(id=>playerPotionHealAmount(id,100)),
    [35,80,160,100]
  )
  assert.equal(playerPotionHealAmount('pocao_g',10000),4000)
  assert.equal(playerPotionHealAmount('pocao_pet_rara',3906),0)
  assert.equal(playerPotionHealAmount('pocao_g',0),0)
  assert.equal(PLAYER_POTIONS.elixir_supremo.fraction,1)
})

test('loja descreve percentual, comando aplica regra e pets permanecem intactos',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  assert.match(db,/Poção Grande','Recupera 40% do HP máximo/)
  assert.match(db,/const POTIONS = PLAYER_POTIONS/)
  assert.match(db,/heal:playerPotionHealAmount\(r.item_id,maxHp\)/)
  assert.match(db,/hp\+playerPotionHealAmount\(chosen.item_id,maxHp\)/)
  assert.match(db,/pocao_pet_rara: \{ heal:160, name:'Poção de Pet Rara' \}/)
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(games,/heal:playerPotionHealAmount\(x.item_id,maxHp\)/)
  assert.match(games,/heal:playerPotionHealAmount\(x.item_id,effectiveMaxHp\)/)
  assert.match(games,/pocao_pet_suprema:800/)
})
