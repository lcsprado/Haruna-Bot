import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const idsSource=app.match(/const SHOP_IDS=\[([\s\S]*?)\]\s*const BOX_IDS=/)?.[1]
assert.ok(idsSource,'lista fixa de itens da loja não encontrada')
const ids=[...idsSource.matchAll(/'([^']+)'/g)].map(match=>match[1])
const branchPrefix="} else if(['atalhos','atalho'].includes(cmd)){\n"
const begin=app.indexOf(branchPrefix)
const end=app.indexOf("} else if(['loja','shop'].includes(cmd))",begin)
assert.ok(begin>=0&&end>begin,'comando !atalhos não encontrado antes de !loja')
const snippet=app.slice(begin+branchPrefix.length,end)
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
const handler=new AsyncFunction('cmd','args','getShop','SHOP_IDS','shopCategoryLabel','fmt','reply',snippet)
const store=[
 {id:'pocao_pet_full',name:'Poção Pet Full',category:'consumable',price:1200},
 {id:'bota_cacador',name:'Botas do Caçador',category:'boots',price:40000},
 {id:'escudo_runico',name:'Escudo Rúnico',category:'shield',price:35000}
]
const call = async(args=[],items=store)=>{
 let result=''
 let reads=0
 const getShop=async()=>{reads++;return items}
 const reply=async(message)=>{result=message;return message}
 await handler('atalhos',args,getShop,ids,
  c=>({consumable:'CONSUMÍVEIS',boots:'BOTAS',shield:'ESCUDOS'}[c]||'CAIXAS'),
  n=>Number(n).toLocaleString('pt-BR'),reply)
 return {result,reads}
}

test('!comprar 9 e 35 continuam ligados aos itens reais da lista fixa',()=>{
 assert.equal(ids[8],'pocao_pet_full')
 assert.equal(ids[34],'bota_cacador')
 assert.match(app,/return SHOP_IDS\[idx\] \|\| null/)
})
test('!atalhos mostra os dois exemplos com nomes e totais consultados da loja',async()=>{
 const {result,reads}=await call()
 assert.equal(reads,1)
 assert.match(result,/!comprar 9 99\* — compra \*99× Poção Pet Full\* \(R\$ 118\.800\)/)
 assert.match(result,/!comprar 35 99\* — compra \*99× Botas do Caçador\* \(R\$ 3\.960\.000\)/)
 assert.match(result,/!all/)
 assert.match(result,/!centraluber todos/)
 assert.match(result,/!coletar/)
 assert.match(result,/!coletauber/)
 assert.match(result,/!forja5/)
 assert.match(result,/!venderrepetidos/)
 assert.match(result,/não compra nada|apenas informativo/)
})
test('!atalhos loja mostra a numeracao global, mesmo quando itens intermediarios somem',async()=>{
 const {result}=await call(['loja'])
 assert.match(result,/\*9\.\* Poção Pet Full — R\$ 1\.200/)
 assert.match(result,/\*35\.\* Botas do Caçador — R\$ 40\.000/)
 assert.match(result,/\*39\.\* Escudo Rúnico — R\$ 35\.000/)
 assert.doesNotMatch(result,/\*1\.\* Poção Pet Full/)
 assert.match(result,/não os números do menu por categoria/)
 assert.match(result,/efetua a compra imediatamente/)
})
test('itens indisponiveis geram aviso sem inventar um nome',async()=>{
 const {result}=await call([],[store[2]])
 assert.match(result,/!comprar 9 99\* — item indisponível/)
 assert.match(result,/!comprar 35 99\* — item indisponível/)
})
test('!atalhos e apenas informativo e esta disponivel durante sono',()=>{
 assert.match(app,/'comandos','commands','atalhos','atalho','ping'/)
 assert.match(app,/\*!atalhos\* — exemplos de comandos rápidos/)
 assert.match(app,/\*!atalhos loja\* — lista dos números fixos/)
 assert.doesNotMatch(snippet,/await buyItem\(/)
 assert.doesNotMatch(snippet,/await sellDuplicateEquipment\(/)
})
