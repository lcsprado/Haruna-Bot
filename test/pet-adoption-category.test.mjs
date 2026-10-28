import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ADOPTABLE_PETS,petCombatSpecialty} from '../src/neon/game-catalog.js'
import {
 PET_ADOPTION_CATEGORIES,petAdoptionCategory,petAdoptionCategoryPets,
 petAdoptionMenuText,petAdoptionListText,petAdoptionDetailText
} from '../src/neon/pet-adoption-menu.js'

const allSpecies=new Set(ADOPTABLE_PETS.map(x=>x.species))
const fmt=n=>Number(n).toLocaleString('pt-BR')
const helpers={style:s=>'Estilo '+s,ability:s=>petCombatSpecialty(s).label,money:fmt}

test('O menu mostra oito categorias legíveis sem despejar 26 pets de uma vez',()=>{
 const text=petAdoptionMenuText()
 assert.match(text,/ADOÇÃO DE PETS/)
 assert.match(text,/1\.\* ⚔️ Dano e Boss/)
 assert.match(text,/8\.\* 🍀 Sorte e Drop/)
 assert.match(text,/!adotar papagaio Asa/)
 assert.ok(text.length<950,'menu inicial deve caber facilmente na tela')
 assert.doesNotMatch(text,/R\$ 750\.000/,'preços aparecem apenas ao abrir categoria')
})
test('Todos os pets compráveis pertencem a uma ou mais categorias',()=>{
 const mapped=new Set(PET_ADOPTION_CATEGORIES.flatMap(c=>petAdoptionCategoryPets(c.id).map(p=>p.species)))
 assert.deepEqual(mapped,allSpecies)
 assert.equal(PET_ADOPTION_CATEGORIES.length,8)
 for(const c of PET_ADOPTION_CATEGORIES){
  const pets=petAdoptionCategoryPets(c.id)
  assert.ok(pets.length>0,c.key)
  assert.equal(pets.length,new Set(pets.map(p=>p.species)).size,c.key)
  for(let i=1;i<pets.length;i++)assert.ok(pets[i].price>=pets[i-1].price,c.key)
 }
})
test('As categorias são derivadas das habilidades reais e não inventam efeitos',()=>{
 const mapped=['damage','bossDamage','defense','healPct','crit','dodge','speed','xp','drop']
 for(const c of PET_ADOPTION_CATEGORIES)for(const p of petAdoptionCategoryPets(c.id)){
  const spec=petCombatSpecialty(p.species)
  assert.ok(c.keys.some(k=>mapped.includes(k)&&Number(spec[k]||0)>0),p.species)
 }
 assert.deepEqual(petAdoptionCategoryPets('cura').map(p=>p.species),['cervo_mistico','unicornio'])
 assert.ok(petAdoptionCategoryPets('dano').some(p=>p.species==='dragao'))
 assert.ok(petAdoptionCategoryPets('velocidade').some(p=>p.species==='gaviao'))
 assert.ok(petAdoptionCategoryPets('crítico').some(p=>p.species==='gato'))
 assert.equal(petAdoptionCategory('3').key,'cura')
})
test('Cartão da categoria mostra valor real, nível, estilo e habilidades',()=>{
 const text=petAdoptionListText(3,helpers)
 assert.match(text,/Cervo Místico/)
 assert.match(text,/R\$ 500\.000/)
 assert.match(text,/Unicórnio/)
 assert.match(text,/R\$ 750\.000/)
 assert.match(text,/9️⃣ Voltar/)
 assert.ok(text.length<2000)
})
test('Detalhe solicita comando explícito em vez de comprar ao selecionar número',()=>{
 const text=petAdoptionDetailText('papagaio',helpers)
 assert.match(text,/R\$ 18\.000/)
 assert.match(text,/!adotar papagaio Nome/)
 assert.match(text,/9️⃣ Voltar/)
 assert.doesNotMatch(text,/PET ADOTADO/)
})
test('WhatsApp mantém fluxo de consulta por jogador e bloqueia adoção comum desativada',()=>{
 const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 for(const stage of ['pet_adopt_categories','pet_adopt_list','pet_adopt_detail'])
  assert.match(index,new RegExp("flow\\.stage==='"+stage+"'"))
 assert.match(index,/ADOÇÃO COMUM DESATIVADA/)
 assert.doesNotMatch(index,/await adoptPet\(/,'nenhuma adoção comum deve ser cobrada enquanto a função está desligada')
 assert.match(index,/clearQuickFlow\(chat,sender\)/)
 assert.match(index,/petAdoptionMenuText\(\)/)
 assert.match(index,/petAdoptionListText\(category\.id/)
})
