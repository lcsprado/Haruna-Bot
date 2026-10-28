import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ADOPTABLE_PETS,petSacrificeReward} from '../src/neon/game-catalog.js'

test('Todos os 26 pets compráveis devolvem metade do preço',()=>{
 assert.equal(ADOPTABLE_PETS.length,26)
 for(const p of ADOPTABLE_PETS){
  const reward=petSacrificeReward(p.species,100,0,p.price)
  assert.equal(reward.cash,Math.floor(p.price*.5),p.species)
  assert.equal(reward.originalPrice,p.price)
  assert.equal(reward.shopRefund,true)
 }
})
test('Dragão de um milhão devolve R$500.000 mesmo no nível 1',()=>{
 assert.equal(petSacrificeReward('dragao',1,0,1000000).cash,500000)
 assert.equal(petSacrificeReward('dragao',100,0,1000000).cash,500000)
})
test('Pets legados compráveis mantêm direito a metade do preço da espécie',()=>{
 assert.equal(petSacrificeReward('dragao',30,0,null).cash,500000)
 assert.equal(petSacrificeReward('papagaio',1,0,null).cash,9000)
})
test('Pets de Raid sem compra e espécies desconhecidas não geram dinheiro infinito',()=>{
 assert.equal(petSacrificeReward('fenix_celestial',100,0,0).cash,3700)
 assert.equal(petSacrificeReward('dragao',100,0,0).cash,3700)
 assert.equal(petSacrificeReward('fenix_celestial',50,0,null).cash,1950)
})
test('EXP e limites de níveis permanecem iguais',()=>{
 assert.equal(petSacrificeReward('dragao',100,999999,1000000).exp,800)
 assert.equal(petSacrificeReward('cachorro',1,0,5000).exp,5)
 assert.equal(petSacrificeReward('dragao',999,0,1000000).level,100)
})
test('Pagamento, confirmação e migração usam a mesma função de reembolso',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(db,/ALTER TABLE pet_collection ADD COLUMN IF NOT EXISTS purchase_price BIGINT/)
 assert.match(db,/purchase_price:\$\{originalPrice\}/)
 assert.match(db,/petSacrificeReward\(pet\.species,pet\.level,pet\.xp,pet\.purchase_price\)/)
 const menu=readFileSync(new URL('../src/neon/pet-collection-menu.js',import.meta.url),'utf8')
 assert.match(menu,/petSacrificeReward\(p\.species,p\.level,p\.xp,p\.purchase_price\)/)
 assert.match(bot,/Reembolso: \*50% da adoção\*/)
 assert.match(db,/DELETE FROM pet_collection WHERE jid=\$1 AND id=\$2 AND active=FALSE RETURNING id/)
})
