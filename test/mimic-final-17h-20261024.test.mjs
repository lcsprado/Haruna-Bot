import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {MIMIC_EVENT,mimicOutcome} from '../src/neon/mimic-hunt.js'
import {relicCatalog} from '../src/neon/relics.js'

test('evento termina às 17h e tem 60 caçadas possíveis',()=>{
 assert.equal(new Date(MIMIC_EVENT.endsAt).toISOString(),'2026-10-24T20:00:00.000Z')
 assert.equal(MIMIC_EVENT.maxHunts,60)
 assert.equal(MIMIC_EVENT.cooldownMs,120000)
 assert.deepEqual(MIMIC_EVENT.milestones.map(x=>x.hunts),[10,20,30,45,60])
})
test('metas e prêmio final totalizam 650 mil reais',()=>{
 assert.equal(MIMIC_EVENT.milestones.find(x=>x.hunts===20).cash,200000)
 assert.equal(MIMIC_EVENT.milestones.find(x=>x.hunts===30).box,'insignia_cacador_mimics_20261024')
 assert.equal(MIMIC_EVENT.milestones.find(x=>x.hunts===45).box,'caixa_lendaria')
 assert.equal(MIMIC_EVENT.milestones.find(x=>x.hunts===60).cash,350000)
 assert.equal(MIMIC_EVENT.milestones.reduce((n,m)=>n+m.cash,0),650000)
})
test('fragmentos por raridade aumentados',()=>{
 assert.deepEqual([mimicOutcome(9999).fragments,mimicOutcome(1000).fragments,mimicOutcome(200).fragments,mimicOutcome(0).fragments],[5,8,14,30])
})
test('quatro insígnias de evento com bônus de Boss e Raid, sem PvP',()=>{
 for(const [id,bonus,crit] of [
  ['insignia_cacador_mimics_20261024',0.02,0],
  ['insignia_senhor_baus_mimics_20261024',0.03,0],
  ['insignia_mestre_mimics_20261024',0.04,0.01],
  ['insignia_rei_mimics_20261024',0.05,0.02]
 ]){
  assert.equal(relicCatalog[id].boss,bonus)
  assert.equal(relicCatalog[id].raidAttack,bonus)
  assert.equal(relicCatalog[id].bossCrit||0,crit)
  assert.equal(relicCatalog[id].pvp,undefined)
 }
})
test('migração única de fragmentos e meta de 20 conciliada sem prêmios duplicados',()=>{
 const code=readFileSync(new URL('../src/neon/mimic-hunt.js',import.meta.url),'utf8')
 assert.match(code,/mimic_frg_rebalance_20261024_final_v3/)
 assert.match(code,/ON CONFLICT\(key\) DO NOTHING RETURNING key/)
 assert.match(code,/FROM claim WHERE s.event_key=\$3/)
 assert.match(code,/catchUpTwentyMilestone\(\)/)
 assert.match(code,/p.hunts>=20 && p.hunts<25 && !p.milestone20/)
 assert.match(code,/if\(m.hunts===20\)s.milestone20=true/)
 assert.doesNotMatch(code,/setInterval\(/)
})
