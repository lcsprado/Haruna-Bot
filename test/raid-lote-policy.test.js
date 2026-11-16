import test from 'node:test'
import assert from 'node:assert/strict'
import {RAID_LOTE_V1,raidLoteQuote,raidLoteReward,raidLoteGearChance,raidLoteShouldStop,raidLoteCashPayout} from '../src/neon/raid-lote-policy.js'

test('pacote 10 raids 75 cobrado integralmente antes de iniciar',()=>{
  assert.deepEqual(raidLoteQuote(480000,10),{
    attempts:10,keyPrice:480000,feePerAttempt:48000,
    ownedKeysUsed:0,keysToBuy:10,
    keysTotal:4800000,serviceTotal:480000,totalPrice:5280000,
    fullPackageValue:5280000,
    prepaid:true,refundable:false
  })
})
test('chaves existentes sao gastas no pacote sem cobrar duas vezes',()=>{
  assert.equal(raidLoteQuote(480000,10,3).ownedKeysUsed,3)
  assert.equal(raidLoteQuote(480000,10,3).keysToBuy,7)
  assert.equal(raidLoteQuote(480000,10,3).totalPrice,3840000)
  assert.equal(raidLoteQuote(480000,10,3).fullPackageValue,5280000)
  assert.equal(RAID_LOTE_V1.paymentMode,'prepaid_no_refund')
  assert.equal(RAID_LOTE_V1.refundUnusedAttempts,false)
})
test('recompensas menores com truncamento',()=>{
  assert.equal(raidLoteCashPayout(633600,480000),604800) // líquido 76.800 = metade de 153.600
  assert.equal(raidLoteReward(10,'fragment'),4)
  assert.equal(raidLoteReward(1,'fragment'),0)
  assert.equal(raidLoteReward(90,'masteryXp'),45)
  assert.equal(raidLoteReward(29000,'heroXp'),17400)
  assert.equal(raidLoteGearChance(.003),.00075)
})
test('lucro líquido: vitoria RaidLote tem metade do ganho da Raid manual, sem perda',()=>{
  assert.equal(RAID_LOTE_V1.cashNetProfitBasisPoints,5000)
  const samples=[
    {level:60,key:230000,manual:318800,automatic:297400,net:44400},
    {level:70,key:390000,manual:534800,automatic:501400,net:72400},
    {level:75,key:480000,manual:633600,automatic:604800,net:76800}
  ]
  for(const sample of samples){
    const fee=Math.ceil(sample.key*.1)
    const reward=raidLoteCashPayout(sample.manual,sample.key)
    const manualNet=sample.manual-sample.key
    assert.equal(reward,sample.automatic,'Raid '+sample.level)
    assert.equal(reward-sample.key-fee,sample.net,'lucro de vitória Raid '+sample.level)
    assert.equal(sample.net,Math.floor(manualNet*.5),'metade do lucro manual Raid '+sample.level)
    assert.ok(reward>sample.key+fee)
  }
  assert.equal(raidLoteCashPayout(100000,100000),110000) // cobre chave e taxa sem lucro extra
  assert.throws(()=>raidLoteCashPayout(Number.MAX_SAFE_INTEGER,100000))
})
test('limites e overflow rejeitados',()=>{
  for(const n of [0,11,-1,1.5])assert.throws(()=>raidLoteQuote(480000,n))
  assert.throws(()=>raidLoteQuote(-1,1))
  assert.throws(()=>raidLoteQuote(Number.MAX_SAFE_INTEGER,10))
  assert.throws(()=>raidLoteCashPayout(-1,480000))
  assert.throws(()=>raidLoteReward(10000,'cash'),/nao suportada/)
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

// Protege a integração real: a probabilidade de caixa também deve ser reduzida.
test('caixas no combate real usam apenas 25% da chance manual',async()=>{
  const {readFileSync}=await import('node:fs')
  const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(src,/boxChance=Math\.min\(\.85,loteReduced\?raidLoteGearChance\(boxChance\):\(lote\?boxChance:boxChance\*ownerDrop\)\)/)
  assert.equal(raidLoteGearChance(.55),.1375)
})
