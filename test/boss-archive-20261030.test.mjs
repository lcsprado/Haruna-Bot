import test from 'node:test'
import assert from 'node:assert/strict'
import {isUnarchivedWeeklyBoss20261030,formatBossArchive20261030} from '../src/neon/boss-archive-20261030.js'
const state={mode:'completed',weeklyCompleted:true,weekendKey:'2026-10-30',hp:0,maxHp:8210620}
const awards=[
  {jid:'a',name:'LP',cash:5061414},{jid:'b',name:'Augusto',cash:4047621},
  {jid:'c',name:'João Pedro',cash:3038625},{jid:'d',name:'Kaique',cash:2022339}
]
const inventory=[
  ...awards.map(({jid},i)=>({jid,item_id:'caixa_epica',quantity:[15,12,9,7][i]})),
  ...awards.map(({jid},i)=>({jid,item_id:'caixa_lendaria',quantity:[3,2,1,0][i]})),
  ...awards.map(({jid},i)=>({jid,item_id:i===0?'insignia_semanal_20261030_campeao':'insignia_semanal_20261030_guardiao',quantity:1}))
]
test('bloqueia bosses diferentes e resultados novos',()=>{
  assert.equal(isUnarchivedWeeklyBoss20261030({...state,weekendKey:'2026-11-06'}),false)
  assert.equal(isUnarchivedWeeklyBoss20261030({...state,result:{rewards:[]}}),false)
})
test('compõe ranking auditado sem dar itens ou dinheiro',()=>{
  const [m]=formatBossArchive20261030(state,awards,inventory)
  assert.match(m,/R\$ 5\.061\.414/)
  assert.match(m,/R\$ 2\.022\.339/)
  assert.match(m,/15 Caixas Épicas \+ 3 Caixas Lendárias/)
  assert.match(m,/7 Caixas Épicas/)
  assert.match(m,/Nenhum saldo ou item foi duplicado/)
  assert.doesNotMatch(m,/Quantia.*XP/)
})
test('sem quatro pagamentos íntegros, não publica nada',()=>{
  assert.deepEqual(formatBossArchive20261030(state,awards.slice(0,3),inventory),[])
  assert.deepEqual(formatBossArchive20261030(state,[{...awards[0],cash:42},...awards.slice(1)],inventory),[])
})
