import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

test('Poção Full de Pet custa R$ 40.000 e está na loja oficial',()=>{
  assert.match(db,/\['pocao_pet_full','Poção Full de Pet',[^\n]*'consumable',40000,'legendary'\]/)
  assert.match(db,/"pocao_pet_suprema","pocao_pet_full","energetico_pet"/)
  assert.match(app,/'pocao_pet_suprema','pocao_pet_full','energetico_pet'/)
})

test('Poção Full cura até o máximo sem mexer na energia',()=>{
  assert.match(db,/pocao_pet_full: \{ heal:Number\.MAX_SAFE_INTEGER, name:'Poção Full de Pet' \}/)
  assert.match(db,/const hp=Math\.min\(maxHp,before\+potion\.heal\)/)
  assert.match(db,/const ids=Object\.keys\(PET_POTIONS\)/)
  assert.match(app,/full:'pocao_pet_full'/)
})

test('Poção Full participa das curas automáticas das Raids e dos Bosses',()=>{
  const ids="['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema','pocao_pet_full']"
  assert.ok(games.includes(ids),'Raid must load all five pet-potion types')
  assert.match(games,/choosePotion:raidPetPotion,persistPet:persistBossCombatPet/,'Boss must reuse the same potion chooser, rather than duplicate its SQL')
  const start=games.indexOf('function raidPetPotion(rows,missingHp){')
  const end=games.indexOf('\n}',start)+2
  assert.ok(start>=0&&end>start)
  const choose=new Function(games.slice(start,end)+'; return raidPetPotion')()
  const entries=[
    {item_id:'pocao_pet_suprema',quantity:2},
    {item_id:'pocao_pet_full',quantity:1}
  ]
  assert.equal(choose(entries,700).item_id,'pocao_pet_suprema')
  assert.equal(choose(entries,2600).item_id,'pocao_pet_full')
  assert.equal(choose([{item_id:'pocao_pet_full',quantity:1}],5000).item_id,'pocao_pet_full')
  assert.equal(choose([{item_id:'pocao_pet_suprema',quantity:1}],2600).item_id,'pocao_pet_suprema')
})
