import test from 'node:test'
import assert from 'node:assert/strict'
import {STONES,MINING_RARITY_WEIGHTS,planStoneApplication,miningStoneVariant} from '../src/neon/enchantment-stones-catalog.js'
import {MINING_DURATION_SECONDS,MINING_GUARANTEED_REWARD,MINING_PICKAXES,MINING_PICKAXE_SOURCES,MINING_STONE_TABLE,miningPickaxesBySource,miningQuote,miningPurchaseQuote,miningRepairQuote,miningStartQuote,miningActivityGuard,settleMiningExpedition} from '../src/neon/torre-mineracao-4h.js'

test('4 horas fixas; porcentagem depende exclusivamente da picareta',()=>{
  assert.equal(MINING_DURATION_SECONDS,14400)
  assert.deepEqual(Object.fromEntries(Object.entries(MINING_PICKAXES).map(([id,row])=>[id,row.stoneChancePercent])),{
    madeira:3,ferro:6,aco:10,ouro:12,diamante:15
  })
  assert.equal(miningQuote('madeira').durationSeconds,14400)
  assert.throws(()=>miningQuote('sem_picareta'),/inválida/)
})
test('antes de 4h, não entrega minério nem sorteia pedra',()=>{
  assert.deepEqual(settleMiningExpedition({pickaxeId:'diamante',startedAt:100,now:100+14399}),{
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
test('cinco famílias de pedras, tabela soma 100%, no máximo uma pedra',()=>{
  assert.equal(MINING_STONE_TABLE.reduce((n,x)=>n+x.weight,0),100)
  assert.deepEqual(MINING_STONE_TABLE.map(x=>x.id),[
    'pedra_forca_alpha','pedra_fortaleza_alpha','pedra_agilidade_alpha','pedra_precisao_alpha','pedra_furia_alpha'
  ])
  for(const kindRoll of [0,.299,.300,.549,.55,.749,.75,.899,.9,.999]){
    const result=settleMiningExpedition({pickaxeId:'madeira',startedAt:100,now:14500,stoneRoll:0,kindRoll})
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
  assert.throws(()=>settleMiningExpedition({pickaxeId:'aco',startedAt:100,now:14500,stoneRoll:1,kindRoll:0}),/Sorteios/)
  assert.throws(()=>settleMiningExpedition({pickaxeId:'aco',startedAt:100,now:14500,stoneRoll:0,kindRoll:NaN}),/Sorteios/)
  assert.throws(()=>settleMiningExpedition({pickaxeId:'aco',startedAt:100,now:99,stoneRoll:0,kindRoll:0}),/Horário/)
})

test('tres picaretas com nomes exclusivos na loja, uma no primeiro evento e uma no Cerco',()=>{
  assert.equal(Object.keys(MINING_PICKAXES).length,5)
  assert.deepEqual(Object.keys(MINING_PICKAXE_SOURCES),['loja','evento_inaugural','cerco'])
  assert.equal(miningPickaxesBySource('loja').length,3)
  assert.deepEqual(miningPickaxesBySource('evento_inaugural').map(p=>p.id),['diamante'])
  assert.deepEqual(miningPickaxesBySource('cerco').map(p=>p.id),['ouro'])
  const names=Object.values(MINING_PICKAXES).map(p=>p.name)
  assert.equal(new Set(names).size,5)
  assert.deepEqual(names,['Picareta de Madeira','Picareta de Ferro','Picareta de Aço','Picareta de Ouro','Picareta de Diamante'])
  assert.equal(miningQuote('diamante').source,'evento_inaugural')
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

test('cada picareta tem durabilidade 4-8 e consome um uso ao iniciar a mineração',()=>{
  const expected={madeira:4,ferro:5,aco:6,ouro:7,diamante:8}
  for(const [id,maxUses] of Object.entries(expected)){
    assert.equal(MINING_PICKAXES[id].maxUses,maxUses)
    const full=miningStartQuote(id,maxUses)
    assert.equal(full.maxUses,maxUses)
    assert.equal(full.usesBefore,maxUses)
    assert.equal(full.usesAfter,maxUses-1)
    assert.equal(miningStartQuote(id,1).usesAfter,0)
    assert.throws(()=>miningStartQuote(id,0),/Repare/)
    assert.throws(()=>miningStartQuote(id,maxUses+1),/Durabilidade/)
  }
})

test('reparo custa dinheiro proporcional aos usos especificos de cada picareta, sem item adicional',()=>{
  const expected={madeira:{maxUses:4,fullRepairCash:1200},
    ferro:{maxUses:5,fullRepairCash:3000},aco:{maxUses:6,fullRepairCash:6000},
    ouro:{maxUses:7,fullRepairCash:10000},diamante:{maxUses:8,fullRepairCash:15000}}
  for(const [id,{maxUses,fullRepairCash}] of Object.entries(expected)){
    const empty=miningRepairQuote(id,0)
    assert.equal(empty.costCash,fullRepairCash)
    assert.equal(empty.usesAfterRepair,maxUses)
    assert.equal(empty.missingUses,maxUses)
    assert.equal(miningRepairQuote(id,maxUses).costCash,0)
    assert.equal(miningRepairQuote(id,maxUses-1).costCash,Math.ceil(fullRepairCash/maxUses))
    for(let remaining=0;remaining<=maxUses;remaining++){
      const quote=miningRepairQuote(id,remaining)
      assert.equal(quote.costCash,Math.ceil((maxUses-remaining)*fullRepairCash/maxUses))
      assert.equal(quote.missingUses,maxUses-remaining)
    }
  }
  assert.equal(miningRepairQuote('ouro',3).costCash,Math.ceil(4*10000/7))
  assert.equal(miningRepairQuote('diamante',4).costCash,7500)
  assert.throws(()=>miningRepairQuote('madeira',-1),/Durabilidade/)
})

test('analise de saldo do ciclo: picaretas melhores podem custar mais do que a renda garantida',()=>{
 const expected={madeira:2000,ferro:1000,aco:-1200,ouro:-4400,diamante:-8600}
 for(const [id,net] of Object.entries(expected)){
   const p=miningQuote(id)
   assert.equal(p.maxUses*p.guaranteedCash-p.fullRepairCash,net)
 }
})
test('precificacao segue faixas da economia real; somente 3 picaretas de loja sao vendidas',()=>{
 const expected={madeira:2000,ferro:7500,aco:20000}
 assert.deepEqual(Object.fromEntries(miningPickaxesBySource('loja').map(({id,purchaseCash})=>[id,purchaseCash])),expected)
 for(const [id,price] of Object.entries(expected)){
   const quote=miningPurchaseQuote(id)
   assert.equal(quote.priceCash,price)
   assert.equal(quote.durationSeconds,14400)
   assert.equal(quote.stoneChancePercent,MINING_PICKAXES[id].stoneChancePercent)
 }
 for(const id of ['ouro','diamante']){
   assert.equal(miningQuote(id).purchaseCash,null)
   assert.throws(()=>miningPurchaseQuote(id),/nao esta a venda/)
 }
})

test('20 pedras: raridade condicional, bônus e compatibilidade preservados',()=>{
 assert.equal(Object.keys(STONES).length,20)
 assert.equal(STONES.pedra_forca_alpha.value,5)
 assert.equal(STONES.pedra_forca_lendaria_alpha.value,35)
 assert.equal(STONES.pedra_furia_lendaria_alpha.value,.10)
 assert.equal(STONES.pedra_precisao_lendaria_alpha.value,.05)
 for(const [id,weights] of Object.entries(MINING_RARITY_WEIGHTS)){
  assert.equal(weights.reduce((a,b)=>a+b,0),100)
  let start=0
  for(let rank=0;rank<4;rank++){
   if(weights[rank]>0){
    const roll=(start+weights[rank]/2)/100
    assert.equal(STONES[miningStoneVariant('pedra_forca_alpha',id,roll)].rank,rank)
    const outcome=settleMiningExpedition({pickaxeId:id,startedAt:100,now:14500,stoneRoll:roll*MINING_PICKAXES[id].stoneChancePercent/100,kindRoll:0})
    assert.equal(STONES[outcome.stoneId].rank,rank)
   }
   start+=weights[rank]
  }
 }
})
test('substituição superior preserva três espaços, dois percentuais e impede downgrade',()=>{
 const rows=[{stone_id:'pedra_forca_alpha',quantity:2},{stone_id:'pedra_furia_alpha',quantity:1}]
 assert.deepEqual(planStoneApplication(rows,'pedra_forca_lendaria_alpha'),{replaceId:'pedra_forca_alpha',totalAfter:3})
 assert.equal(planStoneApplication(rows,'pedra_forca_alpha'),null)
 assert.equal(planStoneApplication(rows,'pedra_precisao_lendaria_alpha'),null)
 const pct=[{stone_id:'pedra_furia_alpha',quantity:2}]
 assert.deepEqual(planStoneApplication(pct,'pedra_furia_rara_alpha'),{replaceId:'pedra_furia_alpha',totalAfter:2})
 assert.deepEqual(planStoneApplication([],'pedra_furia_rara_alpha'),{replaceId:null,totalAfter:1})
})

import {miningSessionQuote,miningSessionOutcome,parseMiningDuration,MINING_HOURLY} from '../src/neon/mining-session-v2.js'
test('nova mineração escolhe tempo e consome usos, com lucro após reparo',()=>{
 assert.equal(parseMiningDuration('30m'),1800)
 assert.equal(parseMiningDuration('8h'),28800)
 assert.throws(()=>parseMiningDuration('9h'),/Escolha/)
 for(const [id,p] of Object.entries(MINING_PICKAXES)){
  for(const duration of [1800,3600,7200]){
   const q=miningSessionQuote(id,p.maxUses,duration)
   assert.equal(q.usesCost,Math.ceil(duration/3600))
   assert.equal(q.usesAfter,p.maxUses-q.usesCost)
   assert.ok(q.cash>miningRepairQuote(id,q.usesAfter).costCash)
  }
 }
 assert.throws(()=>miningSessionQuote('madeira',1,7200),/Resistência/)
})
test('sorteios por cinco minutos são cumulativos, reproduzíveis e não excedem tempo contratado',()=>{
 const row={pickaxe_id:'diamante',started_at:100,ends_at:29800-900,roll_seed:'ab'.repeat(32)}
 row.ends_at=row.started_at+28800
 const a=miningSessionOutcome(row,1900)
 assert.equal(a.ticks,6)
 assert.equal(a.cash,2500)
 assert.equal(a.xp,250)
 assert.deepEqual(a,miningSessionOutcome(row,1900))
 const b=miningSessionOutcome(row,row.ends_at)
 assert.deepEqual(b,miningSessionOutcome(row,row.ends_at+99999))
 assert.equal(b.ticks,96)
 assert.equal(b.cash,40000)
 for(const [id,n] of Object.entries(a.stones))assert.ok(b.stones[id]>=n)
 assert.ok(Object.values(b.stones).reduce((n,x)=>n+x,0)>1)
 assert.equal(miningSessionOutcome(row,399).cash,0)
})
