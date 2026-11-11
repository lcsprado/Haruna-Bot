import test from 'node:test'
import assert from 'node:assert/strict'
import {RAID_LOTE_V1,raidLoteQuote,raidLoteReward,raidLoteGearChance,raidLoteShouldStop} from '../src/neon/raid-lote-policy.js'

test('pacote 10 raids 75 cobrado integralmente antes de iniciar',()=>{
  assert.deepEqual(raidLoteQuote(480000,10),{
    attempts:10,keyPrice:480000,feePerAttempt:48000,
    keysTotal:4800000,serviceTotal:480000,totalPrice:5280000,
    prepaid:true,refundable:false
  })
})
test('chaves existentes nao reduzem o preco do pacote fechado',()=>{
  assert.equal(raidLoteQuote(480000,10).totalPrice,5280000)
  assert.equal(RAID_LOTE_V1.paymentMode,'prepaid_no_refund')
  assert.equal(RAID_LOTE_V1.refundUnusedAttempts,false)
})
test('recompensas menores com truncamento',()=>{
  assert.equal(raidLoteReward(633600,'cash'),506880)
  assert.equal(raidLoteReward(10,'fragment'),4)
  assert.equal(raidLoteReward(1,'fragment'),0)
  assert.equal(raidLoteReward(90,'masteryXp'),45)
  assert.equal(raidLoteReward(29000,'heroXp'),17400)
  assert.equal(raidLoteGearChance(.003),.00075)
})
test('limites e overflow rejeitados',()=>{
  for(const n of [0,11,-1,1.5])assert.throws(()=>raidLoteQuote(480000,n))
  assert.throws(()=>raidLoteQuote(-1,1))
  assert.throws(()=>raidLoteQuote(Number.MAX_SAFE_INTEGER,10))
  assert.throws(()=>raidLoteReward(-1,'cash'))
})
test('falha, morte ou cancelamento encerram o lote sem reembolso',()=>{
  assert.equal(raidLoteShouldStop({won:true,attemptsCompleted:1,attemptsRequested:10}),false)
  assert.equal(raidLoteShouldStop({won:false,attemptsCompleted:1,attemptsRequested:10}),true)
  assert.equal(raidLoteShouldStop({won:true,dead:true,attemptsCompleted:1,attemptsRequested:10}),true)
  assert.equal(raidLoteShouldStop({won:true,cancelRequested:true,attemptsCompleted:1,attemptsRequested:10}),true)
  assert.equal(raidLoteShouldStop({won:true,attemptsCompleted:10,attemptsRequested:10}),true)
})
test('nunca compra consumiveis nem amplifica eventos',()=>{
  assert.equal(RAID_LOTE_V1.allowAutomaticConsumablePurchases,false)
  assert.equal(RAID_LOTE_V1.applyTemporaryRewardMultipliers,false)
})
