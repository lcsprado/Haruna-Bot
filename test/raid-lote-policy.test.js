import test from 'node:test'
import assert from 'node:assert/strict'
import {RAID_LOTE_V1,raidLoteQuote,raidLoteReward,raidLoteGearChance,raidLoteShouldStop} from '../src/neon/raid-lote-policy.js'

test('10 raids 75: 4.8M keys plus 480k service',()=>{
  assert.deepEqual(raidLoteQuote(480000,10,0),{
    attempts:10,keyPrice:480000,feePerAttempt:48000,keysToBuy:10,
    maxKeySpend:4800000,maxServiceSpend:480000,maxTotalSpend:5280000
  })
})
test('existing keys never charged twice',()=>{
  const quote=raidLoteQuote(480000,10,3)
  assert.equal(quote.keysToBuy,7)
  assert.equal(quote.maxTotalSpend,3840000)
})
test('rewards always rounded down, never increased',()=>{
  assert.equal(raidLoteReward(633600,'cash'),506880)
  assert.equal(raidLoteReward(10,'fragment'),4)
  assert.equal(raidLoteReward(1,'fragment'),0)
  assert.equal(raidLoteReward(90,'masteryXp'),45)
  assert.equal(raidLoteReward(29000,'heroXp'),17400)
  assert.equal(raidLoteGearChance(.003),.00075)
})
test('reject invalid or oversized lots',()=>{
  for(const count of [0,11,-1,1.5])assert.throws(()=>raidLoteQuote(480000,count))
  assert.throws(()=>raidLoteQuote(-1,1))
  assert.throws(()=>raidLoteReward(-1,'cash'))
})
test('stop on death, loss, cancel, or last attempt',()=>{
  assert.equal(raidLoteShouldStop({won:true,attemptsCompleted:1,attemptsRequested:10}),false)
  assert.equal(raidLoteShouldStop({won:false,attemptsCompleted:1,attemptsRequested:10}),true)
  assert.equal(raidLoteShouldStop({won:true,dead:true,attemptsCompleted:1,attemptsRequested:10}),true)
  assert.equal(raidLoteShouldStop({won:true,cancelRequested:true,attemptsCompleted:1,attemptsRequested:10}),true)
  assert.equal(raidLoteShouldStop({won:true,attemptsCompleted:10,attemptsRequested:10}),true)
})
test('never automatically purchase consumables or amplify temporary events',()=>{
  assert.equal(RAID_LOTE_V1.allowAutomaticConsumablePurchases,false)
  assert.equal(RAID_LOTE_V1.applyTemporaryRewardMultipliers,false)
})
