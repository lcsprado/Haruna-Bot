import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeRaidLoteMaterials,formatRaidLoteMaterials} from '../src/neon/raid-lote-material-summary.js'

const won=material=>({status:'won',reward_summary:{rewards:[{cash:427840,exp:14400,material}]}})
test('Raid 70: dez vitorias somam as essencias recebidas de fato',()=>{
 const records=[5,5,4,5,5,5,4,4,5,6].map(qty=>won({id:'essencia_eclipse',name:'Essência do Eclipse',qty}))
 const summary=summarizeRaidLoteMaterials(records)
 assert.equal(summary.total,48)
 assert.deepEqual(summary.items,[{id:'essencia_eclipse',name:'Essência do Eclipse',qty:48}])
 assert.match(formatRaidLoteMaterials(records),/\+48/)
 assert.match(formatRaidLoteMaterials(records),/Essência do Eclipse ×48/)
})
test('Raid 75: fragmentos da ascensao sao discriminados pelo nome',()=>{
 const records=Array.from({length:9},()=>won({id:'fragmento_ascensao_pecados_20261024',name:'Fragmento da Ascensão',qty:4}))
 assert.match(formatRaidLoteMaterials(records),/Fragmento da Ascensão ×36/)
})
test('Nao conta tentativa em andamento, perdida ou recompensa inexistente',()=>{
 const records=[
  won({id:'fragmento',name:'Fragmento',qty:3}),
  {status:'active',reward_summary:{rewards:[{material:{id:'fragmento',name:'Fragmento',qty:9}}]}},
  {status:'lost',reward_summary:{rewards:[{material:{id:'fragmento',name:'Fragmento',qty:9}}]}},
  won(null),
  won({id:'fragmento',name:'Fragmento',qty:0})
 ]
 assert.equal(summarizeRaidLoteMaterials(records).total,3)
 assert.equal(formatRaidLoteMaterials([{status:'lost'}]),'\n🧩 Fragmentos/materiais ganhos: 0')
})
test('Materiais distintos ficam separados e nao sao somados com nomes trocados',()=>{
 const report=[
  won({id:'a',name:'Essência do Eclipse',qty:5}),
  won({id:'b',name:'Fragmento da Ascensão',qty:4}),
  won({id:'a',name:'Essência do Eclipse',qty:4})
 ]
 const s=summarizeRaidLoteMaterials(report)
 assert.equal(s.total,13)
 assert.equal(s.items.length,2)
 assert.match(formatRaidLoteMaterials(report),/Essência do Eclipse ×9/)
 assert.match(formatRaidLoteMaterials(report),/Fragmento da Ascensão ×4/)
})
