import test from 'node:test'
import assert from 'node:assert/strict'
import {MINING_DURATION_SECONDS,MINING_GUARANTEED_REWARD,MINING_PICKAXE_MAX_USES,MINING_PICKAXES,MINING_PICKAXE_SOURCES,MINING_STONE_TABLE,miningPickaxesBySource,miningQuote,miningRepairQuote,miningStartQuote,miningActivityGuard,settleMiningExpedition} from '../src/neon/torre-mineracao-4h.js'

test('4 horas fixas; porcentagem depende exclusivamente da picareta',()=>{
  assert.equal(MINING_DURATION_SECONDS,14400)
  assert.deepEqual(Object.fromEntries(Object.entries(MINING_PICKAXES).map(([id,row])=>[id,row.stoneChancePercent])),{
    pedra_sussurrante:3,veias_lunares:6,nucleo_carmesim:10,primeira_ruptura:12,trono_sitiado:15
  })
  assert.equal(miningQuote('pedra_sussurrante').durationSeconds,14400)
  assert.throws(()=>miningQuote('ferro'),/inválida/)
})
test('antes de 4h, não entrega minério nem sorteia pedra',()=>{
  assert.deepEqual(settleMiningExpedition({pickaxeId:'trono_sitiado',startedAt:100,now:100+14399}),{
    status:'running',remainingSeconds:1,stoneId:null,ore:0,cash:0,xp:0
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
    const result=settleMiningExpedition({pickaxeId:'pedra_sussurrante',startedAt:100,now:14500,stoneRoll:0,kindRoll})
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
  assert.throws(()=>settleMiningExpedition({pickaxeId:'nucleo_carmesim',startedAt:100,now:14500,stoneRoll:1,kindRoll:0}),/Sorteios/)
  assert.throws(()=>settleMiningExpedition({pickaxeId:'nucleo_carmesim',startedAt:100,now:14500,stoneRoll:0,kindRoll:NaN}),/Sorteios/)
  assert.throws(()=>settleMiningExpedition({pickaxeId:'nucleo_carmesim',startedAt:100,now:99,stoneRoll:0,kindRoll:0}),/Horário/)
})

test('tres picaretas com nomes exclusivos na loja, uma no primeiro evento e uma no Cerco',()=>{
  assert.equal(Object.keys(MINING_PICKAXES).length,5)
  assert.deepEqual(Object.keys(MINING_PICKAXE_SOURCES),['loja','evento_inaugural','cerco'])
  assert.equal(miningPickaxesBySource('loja').length,3)
  assert.deepEqual(miningPickaxesBySource('evento_inaugural').map(p=>p.id),['primeira_ruptura'])
  assert.deepEqual(miningPickaxesBySource('cerco').map(p=>p.id),['trono_sitiado'])
  const names=Object.values(MINING_PICKAXES).map(p=>p.name)
  assert.equal(new Set(names).size,5)
  assert.ok(names.every(name=>!['Picareta de Ferro','Picareta de Prata','Picareta de Ouro','Picareta Abissal'].includes(name)))
  assert.equal(miningQuote('trono_sitiado').source,'cerco')
  assert.throws(()=>miningPickaxesBySource('outro'),/inválida/)
})

test('4 horas sempre rendem R$ 800 e 250 XP, com ou sem pedra',()=>{
  assert.deepEqual(MINING_GUARANTEED_REWARD,{cash:800,xp:250})
  for(const id of Object.keys(MINING_PICKAXES)){
    const noStone=settleMiningExpedition({pickaxeId:id,startedAt:100,now:14500,stoneRoll:.99,kindRoll:.1})
    const withStone=settleMiningExpedition({pickaxeId:id,startedAt:100,now:14500,stoneRoll:0,kindRoll:.1})
    assert.deepEqual({cash:noStone.cash,xp:noStone.xp},{cash:800,xp:250})
    assert.deepEqual({cash:withStone.cash,xp:withStone.xp},{cash:800,xp:250})
    assert.equal(noStone.stoneId,null)
    assert.ok(withStone.stoneId)
  }
})

test('picareta dura 10 expedicoes, consome 1 por inicio e exige reparo no zero',()=>{
  assert.equal(MINING_PICKAXE_MAX_USES,10)
  assert.deepEqual({
    before:miningStartQuote('primeira_ruptura',10).usesBefore,
    after:miningStartQuote('primeira_ruptura',10).usesAfter
  },{before:10,after:9})
  assert.equal(miningStartQuote('trono_sitiado',1).usesAfter,0)
  assert.throws(()=>miningStartQuote('trono_sitiado',0),/Repare/)
  assert.throws(()=>miningStartQuote('trono_sitiado',11),/Durabilidade/)
})

test('reparo com dinheiro proporcional aos usos, sem material de reparo',()=>{
  const expected={pedra_sussurrante:500,veias_lunares:800,nucleo_carmesim:1200,primeira_ruptura:1600,trono_sitiado:2000}
  for(const [id,fullCost] of Object.entries(expected)){
    const empty=miningRepairQuote(id,0)
    assert.equal(empty.costCash,fullCost)
    assert.equal(empty.usesAfterRepair,10)
    assert.equal(miningRepairQuote(id,5).costCash,fullCost/2)
    assert.equal(miningRepairQuote(id,10).costCash,0)
    assert.equal(miningRepairQuote(id,9).costCash,fullCost/10)
  }
  assert.throws(()=>miningRepairQuote('pedra_sussurrante',-1),/Durabilidade/)
})
