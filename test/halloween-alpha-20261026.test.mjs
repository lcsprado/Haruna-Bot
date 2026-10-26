import test from 'node:test'
import assert from 'node:assert/strict'
import {
 HALLOWEEN_BOSSES,HALLOWEEN_GEAR,HALLOWEEN_START,HALLOWEEN_END,
 HALLOWEEN_SHOP_END,HALLOWEEN_CORCEL_COST,HALLOWEEN_SOUL_ID,
 halloweenActive,halloweenBoss,halloweenDropCatalog,
 halloweenMinimumDamage,halloweenPhases,halloweenMysticHelmetReduction
} from '../src/neon/halloween-rules.js'

test('Halloween starts on October 26 in Sao Paulo and expires before Seven Sins Sunday',()=>{
 assert.equal(halloweenActive(HALLOWEEN_START),true)
 assert.equal(halloweenActive(HALLOWEEN_START-1),false)
 assert.equal(halloweenActive(HALLOWEEN_END),false)
 assert.equal(HALLOWEEN_SHOP_END,Date.parse('2026-11-01T12:00:00-03:00'))
 assert.equal(HALLOWEEN_BOSSES.length,6)
 for(let i=0;i<6;i++){
  const at=Date.parse('2026-10-'+String(26+i)+'T18:00:00-03:00')
  assert.equal(halloweenBoss(at)?.day,HALLOWEEN_BOSSES[i].day)
 }
 assert.equal(halloweenBoss(Date.parse('2026-11-01T18:00:00-03:00')),null)
})
test('four rare exclusive items in two drop pools',()=>{
 assert.equal(HALLOWEEN_GEAR.length,4)
 assert.equal(HALLOWEEN_GEAR.filter(x=>x.category==='helmet').length,2)
 assert.equal(HALLOWEEN_GEAR.filter(x=>x.category==='boots').length,2)
 assert.deepEqual(halloweenDropCatalog(Date.parse('2026-10-26T20:00:00-03:00')).map(x=>x.dropDay),['normal','normal'])
 assert.deepEqual(halloweenDropCatalog(Date.parse('2026-10-31T20:00:00-03:00')).map(x=>x.dropDay),['final','final'])
 assert.ok(HALLOWEEN_GEAR.every(x=>x.chance>0&&x.chance<=.015))
})
test('mystic helmet only grants 1.5% defense to three mystics',()=>{
 const helm='halloween_elmo_almas_20261026'
 assert.equal(halloweenMysticHelmetReduction({helmetId:helm,teamStyle:'mistico',teamCount:3}),.015)
 assert.equal(halloweenMysticHelmetReduction({helmetId:helm,teamStyle:'predador',teamCount:3}),0)
 assert.equal(halloweenMysticHelmetReduction({helmetId:helm,teamStyle:'mistico',teamCount:2}),0)
 assert.equal(halloweenMysticHelmetReduction({helmetId:'halloween_elmo_abobora_20261026',teamStyle:'mistico',teamCount:3}),0)
})
test('bosses are progressively difficult with three phases',()=>{
 for(let i=1;i<HALLOWEEN_BOSSES.length;i++)assert.ok(HALLOWEEN_BOSSES[i].hp>HALLOWEEN_BOSSES[i-1].hp)
 const hp=HALLOWEEN_BOSSES[0].hp
 assert.equal(halloweenPhases(hp,hp),1)
 assert.equal(halloweenPhases(hp*.5,hp),2)
 assert.equal(halloweenPhases(hp*.25,hp),3)
 assert.ok(halloweenMinimumDamage(hp)>0)
})
test('pet altar is a fixed one-time-cost item with unique currency',()=>{
 assert.equal(HALLOWEEN_CORCEL_COST,100)
 assert.notEqual(HALLOWEEN_SOUL_ID,'fragmento_ascensao_pecados_20261024')
})
