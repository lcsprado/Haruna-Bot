import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 RACING_CARS,RACING_PARTS,RACING_UPGRADES,RACING_TIERS,
 RACING_MAX_TUNING,RACING_TOTAL_UPGRADE_COST,RACING_COOLDOWN_SECONDS,
 racingModel,racingPart,racingTuning,racingStats,racingDriverLevel,
 racingPower,racingNpcDuel,racingDuel,racingRepairCost,racingCashPrize,racingXpPrize
} from '../src/neon/racing-rules.js'

const source=path=>readFileSync(new URL('../src/neon/'+path,import.meta.url),'utf8')

test('four separate equal-price cars, different strengths, same tuning ceiling',()=>{
 assert.equal(RACING_CARS.length,4)
 assert.equal(new Set(RACING_CARS.map(c=>c.id)).size,4)
 assert.deepEqual([...new Set(RACING_CARS.map(c=>c.price))],[150000])
 assert.equal(racingModel('gol').name,'Gol Quadrado')
 assert.equal(racingTuning(Object.fromEntries(RACING_PARTS.map(p=>[p.id,7]))),42)
 assert.equal(RACING_MAX_TUNING,42)
 assert.ok(racingStats('uno').accel>racingStats('gol').accel)
 assert.ok(racingStats('corsa').grip>racingStats('palio').grip)
 assert.ok(racingStats('palio').speed>racingStats('uno').speed)
 for(const c of RACING_CARS)assert.ok(racingPower({modelId:c.id},'cidade','equilibrada')>0)
})
test('long, expensive time-gated path to competitive racing',()=>{
 assert.equal(RACING_PARTS.length,6)
 assert.equal(RACING_UPGRADES.length,7)
 assert.equal(RACING_UPGRADES[6].price,2200000)
 assert.equal(RACING_UPGRADES[6].seconds,12*3600)
 assert.equal(RACING_TOTAL_UPGRADE_COST,25530000)
 assert.ok(RACING_UPGRADES.every((x,i)=>i===0||(x.price>RACING_UPGRADES[i-1].price&&x.seconds>RACING_UPGRADES[i-1].seconds)))
 assert.ok(RACING_TIERS.every((t,i)=>i===0||(t.minTuning>RACING_TIERS[i-1].minTuning&&t.minDriver>RACING_TIERS[i-1].minDriver)))
 assert.equal(RACING_COOLDOWN_SECONDS,600)
 assert.ok(racingPart('turbo'))
})
test('upgrades have material advantage, no cheap car can dominate top division',()=>{
 const max=Object.fromEntries(RACING_PARTS.map(p=>[p.id,7]))
 for(const c of RACING_CARS){
  const base={modelId:c.id,condition:100,driverLevel:1,upgrades:{}}
  const upgraded={...base,driverLevel:50,upgrades:max}
  assert.ok(racingPower(upgraded,'cidade')>racingPower(base,'cidade')*2)
  assert.equal(racingNpcDuel(base,'lenda','cidade',()=>.5).won,false)
  assert.ok(racingNpcDuel(upgraded,'rua','cidade',()=>.5).won)
 }
 // Track choice and driver ability matter but do not replace equipment.
 const sample={modelId:'gol',condition:100,driverLevel:50,upgrades:max}
 assert.ok(racingPower(sample,'cidade')>racingPower({...sample,driverLevel:1},'cidade'))
 assert.notEqual(racingPower(sample,'reta'),racingPower(sample,'serra'))
})
test('PvP rewards performance not only RNG, with bounded 3% variation',()=>{
 const stock={modelId:'gol',condition:100,driverLevel:1,upgrades:{}}
 const tuned={...stock,upgrades:{motor:4,pneus:4,cambio:4}}
 for(const r of [()=>0,()=>.5,()=>1]){
  const result=racingDuel(tuned,stock,'cidade',r)
  assert.equal(result.winner,'a')
 }
 assert.ok(racingRepairCost('gol',{},100)===0)
 assert.ok(racingRepairCost('gol',{turbo:7},50)>racingRepairCost('gol',{},50))
 assert.ok(racingCashPrize('rua',true)<racingCashPrize('lenda',true))
 assert.equal(racingCashPrize('lenda',true),12500)
 assert.ok(racingXpPrize('rua',false)<racingXpPrize('rua',true))
 assert.equal(racingDriverLevel(0),1)
 assert.ok(racingDriverLevel(20000)>10)
})
test('persistent transactional safety, independent of Uber',()=>{
 const src=source('racing-alpha.js')
 const commands=source('racing-commands.js')
 const entry=source('index.js')
 assert.match(src,/CREATE UNIQUE INDEX IF NOT EXISTS racing_one_equipped_alpha/)
 assert.match(src,/CREATE UNIQUE INDEX IF NOT EXISTS racing_challenge_pending_alpha/)
 assert.match(src,/SELECT jid FROM users WHERE jid=ANY\(\$1::text\[\]\) ORDER BY jid FOR UPDATE/)
 assert.match(src,/pending_until<=\$2 RETURNING id/)
 assert.match(src,/if\(s\.cars\.some\(x=>x\.pending_part\)\)/)
 assert.match(src,/UPDATE wallets SET cash=cash-\$2 WHERE jid=\$1/)
 assert.match(src,/if\(Number\(w\?\.cash\|\|0\)<next\.price\)/)
 assert.match(src,/checkRace\(ac,a\.profile\);checkRace\(bc,b\.profile\)/)
 assert.match(src,/ON CONFLICT DO NOTHING/)
 assert.ok(!src.includes('user_cars'))
 assert.ok(!src.includes('clt_uber'))
 assert.match(commands,/!comprarcorrida gol/)
 assert.match(entry,/await initRacingAlpha\(\)/)
 assert.match(entry,/await handleRacingAlphaCommand/)
})
