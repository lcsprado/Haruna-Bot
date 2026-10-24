import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {MIMIC_EVENT} from '../src/neon/mimic-hunt.js'
import {relicCatalog} from '../src/neon/relics.js'
const mimicSource=readFileSync(new URL('../src/neon/mimic-hunt.js',import.meta.url),'utf8')
test('título do Mimic é insígnia equipável recebida às 20 caçadas',()=>{
 const badge=MIMIC_EVENT.milestones.find(m=>m.box==='titulo_cacador_mimics_20261024')
 assert.equal(badge.hunts,20)
 assert.equal(badge.qty,1)
 assert.equal(MIMIC_EVENT.maxHunts,30)
 const final=MIMIC_EVENT.milestones.find(m=>m.hunts===30)
 assert.equal(final.box,'caixa_epica')
})
test('status da insígnia de participação e podium, não aplica no PvP',()=>{
 const specs=[
 ['titulo_cacador_mimics_20261024',.02,.005],
 ['titulo_mimic_campiao_20261024',.04,.015],
 ['titulo_mimic_vice_20261024',.03,.01],
 ['titulo_mimic_terceiro_20261024',.025,.005]
 ]
 for(const [id,damage,crit] of specs){
  const r=relicCatalog[id]
  assert.equal(r.boss,damage)
  assert.equal(r.raidAttack,damage)
  assert.equal(r.bossCrit,crit)
  assert.equal(r.raidCrit,crit)
  assert.match(r.effect,/sem PvP/)
  assert.equal(r.pvp,undefined)
 }
})
test('prêmios permanecem com um título não acumulável',()=>{
 assert.match(mimicSource,/m\.box==='titulo_cacador_mimics_20261024'\?'Insígnia Caçador Lendário'/)
 assert.match(mimicSource,/const titles=\['titulo_mimic_campiao_20261024'/)
})
