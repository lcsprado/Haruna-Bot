import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {
  petCollectionCategory,petCollectionCategoryPets,
  petCollectionMenuText,petCollectionListText,
  petCollectionDetailText,petCollectionSacrificeText
} from '../src/neon/pet-collection-menu.js'

const pet=(id,species,name,more={})=>({
  id,species,name,active:false,level:50,xp:4900,power:250,hp:1300,energy:350,...more
})
const pets=[
  pet(10,'fenix_alpha','Fênix Alpha',{active:true,level:100,hp:0,power:500}),
  pet(11,'colosso_alpha','Colosso Alpha'),
  pet(12,'oraculo_alpha','Oráculo Alpha'),
  pet(13,'gato','Gato',{level:1,power:10,purchase_price:8000}),
  pet(14,'tartaruga','Tartaruga',{level:1,power:10,purchase_price:35000})
]
const isLegendary=s=>['fenix_alpha','colosso_alpha','oraculo_alpha'].includes(s)
const options={
  isLegendary,style:()=> '🛡️ Guardião',identity:()=> '🛡️ Guardião • 🛡️ Defesa',
  bonus:()=>({label:'Muralha',text:'+10% defesa no Boss/Raid'}),
  teamIds:new Set([11]),expeditionIds:new Set([14]),
  maxHp:()=>1500,maxEnergy:()=>550,
  money:n=>Number(n).toLocaleString('pt-BR')
}

test('categorias seguem o adotar e acrescentam Lendários e Todos',()=>{
  assert.equal(petCollectionCategory('2').key,'defesa')
  assert.equal(petCollectionCategory('9').key,'lendarios')
  assert.equal(petCollectionCategory('10').key,'todos')
  assert.equal(petCollectionCategoryPets(pets,9,isLegendary).length,3)
  assert.equal(petCollectionCategoryPets(pets,10,isLegendary).length,5)
  assert.equal(petCollectionCategoryPets(pets,2,isLegendary).length,4)
  assert.equal(petCollectionCategoryPets(pets,3,isLegendary).length,0)
  const menu=petCollectionMenuText(pets,options)
  assert.match(menu,/Lendários de Raid/)
  assert.match(menu,/Todos os pets/)
  assert.match(menu,/5 pet\(s\)/)
})

test('listas são compactas, numeradas por categoria e sem identificadores técnicos',()=>{
  const txt=petCollectionListText(pets,9,options)
  assert.match(txt,/\*1\.\* 🌟 \*Fênix Alpha\*/)
  assert.match(txt,/\*2\.\* 🌟 \*Colosso Alpha\*/)
  assert.match(txt,/99️⃣ Voltar às categorias/)
  assert.doesNotMatch(txt,/fenix_alpha|colosso_alpha/)
  assert.ok(txt.length<4096)
})

test('detalhes exibem estado, bônus e bloqueiam sacrifício de ativos, time e expedição',()=>{
  for(const petIndex of [0,1,4]){
    const txt=petCollectionDetailText(pets[petIndex],options)
    assert.match(txt,/Sacrifício:\* 🔒 Bloqueado/)
    assert.match(txt,/Sacrifício indisponível/)
  }
  const normal=petCollectionDetailText(pets[3],options)
  assert.match(normal,/♻️ Ver e confirmar sacrifício/)
  assert.match(normal,/R\$ 4\.000/)
})

test('sacrifício mostra 50% da adoção ou valor simbólico de Raid sem mudar a economia',()=>{
  const bought=petCollectionSacrificeText(pets[3],options)
  assert.match(bought,/50% do preço de adoção/)
  assert.match(bought,/R\$ 4\.000/)
  assert.match(bought,/IRREVERSÍVEL/)
  assert.match(bought,/1️⃣ \*CONFIRMAR SACRIFÍCIO\*/)
  const raid=petCollectionSacrificeText(pets[1],options)
  assert.match(raid,/Pet de Raid\/evento: retorno simbólico/)
  assert.doesNotMatch(raid,/50% do preço de adoção/)
})

test('destruição de pet exige seleção pelo ID real e confirmação em dois passos',async()=>{
  const src=await readFile(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(src,/setQuickFlow\(chat,sender,'pet_collection_sacrifice_confirm'/)
  assert.match(src,/pet\.species!==species\|\|pet\.name!==petName/)
  assert.match(src,/const result=await sacrificePet\(sender,pet\.id\)/)
  assert.match(src,/não é mais possível sacrificar diretamente por comando/)
  assert.match(src,/setQuickFlow\(chat,sender,'pet_collection_categories'/)
})
