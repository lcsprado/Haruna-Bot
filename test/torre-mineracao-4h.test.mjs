import test from 'node:test'
import assert from 'node:assert/strict'
import {MINING_DURATION_SECONDS,MINING_PICKAXES,MINING_STONE_TABLE,miningQuote,miningActivityGuard,settleMiningExpedition} from '../src/neon/torre-mineracao-4h.js'

test('4 horas fixas; porcentagem depende exclusivamente da picareta',()=>{
  assert.equal(MINING_DURATION_SECONDS,14400)
  assert.deepEqual(Object.fromEntries(Object.entries(MINING_PICKAXES).map(([id,row])=>[id,row.stoneChancePercent])),{
    ferro:3,prata:6,ouro:10,abissal:15
  })
  assert.equal(miningQuote('ferro').durationSeconds,14400)
  assert.throws(()=>miningQuote('pedra'),/inválida/)
})
test('antes de 4h, não entrega minério nem sorteia pedra',()=>{
  assert.deepEqual(settleMiningExpedition({pickaxeId:'abissal',startedAt:100,now:100+14399}),{
    status:'running',remainingSeconds:1,stoneId:null,ore:0
  })
})
test('aos 4h, chance por picareta; 1 pedra máxima, não soma porcentagens por hora',()=>{
  const start=100
  for(const [id,row] of Object.entries(MINING_PICKAXES)){
    const below=row.stoneChancePercent/100-0.00001
    const above=row.stoneChancePercent/100+0.00001
    assert.ok(settleMiningExpedition({pickaxeId:id,startedAt:start,now:start+14400,stoneRoll:below,kindRoll:0}).stoneId)
    assert.equal(settleMiningExpedition({pickaxeId:id,startedAt:start,now:start+14400,stoneRoll:above,kindRoll:0}).stoneId,null)
  }
})
test('somente pedras já existentes, tabela soma 100%, no máximo uma pedra',()=>{
  assert.equal(MINING_STONE_TABLE.reduce((n,x)=>n+x.weight,0),100)
  assert.deepEqual(MINING_STONE_TABLE.map(x=>x.id),[
    'pedra_forca_alpha','pedra_fortaleza_alpha','pedra_agilidade_alpha','pedra_precisao_alpha','pedra_furia_alpha'
  ])
  for(const kindRoll of [0,.299,.300,.549,.55,.749,.75,.899,.9,.999]){
    const result=settleMiningExpedition({pickaxeId:'ferro',startedAt:100,now:14500,stoneRoll:0,kindRoll})
    assert.ok(MINING_STONE_TABLE.some(x=>x.id===result.stoneId))
  }
})
test('bloqueia mineração se Raidlote, Carpinar, Dormir ou mineração atual estão ativos',()=>{
  assert.equal(miningActivityGuard({}).canStartMining,true)
  for(const activity of ['raidlote','carpinar','dormir','mining']){
    const check=miningActivityGuard({[activity]:true})
    assert.equal(check.canStartMining,false)
    assert.equal(check.active.length,1)
  }
  assert.deepEqual(miningActivityGuard({raidlote:true,dormir:true}).active,['raidlote','dormir'])
})
test('entrada inválida e resultado incompleto não podem fornecer prêmio',()=>{
  assert.throws(()=>settleMiningExpedition({pickaxeId:'ouro',startedAt:100,now:14500,stoneRoll:1,kindRoll:0}),/Sorteios/)
  assert.throws(()=>settleMiningExpedition({pickaxeId:'ouro',startedAt:100,now:14500,stoneRoll:0,kindRoll:NaN}),/Sorteios/)
  assert.throws(()=>settleMiningExpedition({pickaxeId:'ouro',startedAt:100,now:99,stoneRoll:0,kindRoll:0}),/Horário/)
})
