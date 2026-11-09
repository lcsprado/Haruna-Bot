import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BOSS_CRIT_RESISTANCE,raidBossCritResistance,effectivePveCritChance} from '../src/neon/boss-crit-resistance.js'

const source=path=>readFileSync(new URL('../src/neon/'+path,import.meta.url),'utf8')

test('resistencia progressiva: boss 15 pp; raids 50/60/65/70/75 com 15/20/25/30/35 pp',()=>{
  assert.equal(BOSS_CRIT_RESISTANCE,.15)
  for(const [level,expected] of [[10,0],[15,0],[40,0],[50,.15],[60,.20],[65,.25],[70,.30],[75,.35]]){
    assert.equal(raidBossCritResistance(level),expected)
  }
})

test('subtrai pontos percentuais sem restaurar teto bruto e limita apenas a probabilidade em 100%',()=>{
  assert.ok(Math.abs(effectivePveCritChance(.828,BOSS_CRIT_RESISTANCE)-.678)<1e-12)
  for(const [level,expected] of [[50,.678],[60,.628],[65,.578],[70,.528],[75,.478]]){
    assert.ok(Math.abs(effectivePveCritChance(.828,raidBossCritResistance(level))-expected)<1e-12)
  }
  assert.ok(Math.abs(effectivePveCritChance(1.10,.25)-.85)<1e-12)
  assert.equal(effectivePveCritChance(1.5,.25),1)
  assert.equal(effectivePveCritChance(.10,.30),0)
  assert.equal(effectivePveCritChance(.70,0),.70)
})

test('o motor usa resistencia nos golpes reais, e !boss/!raid informam a resistencia',()=>{
  const games=source('games.js'),index=source('index.js')
  assert.match(games,/effectivePveCritChance\(petCritChance\+gearCritChance,raidBossCritResistance\(s\.level\)\)/)
  assert.match(games,/const crit=roll<effectiveCritChance/)
  assert.match(games,/effectivePveCritChance\(totalCritChance,BOSS_CRIT_RESISTANCE\)/)
  assert.match(games,/critResistance:raidBossCritResistance\(r\.level\)/)
  assert.match(index,/const bossCritLine=/)
  assert.match(index,/raidBossCritResistance\(requestedRoom\.level\)/)
  assert.match(index,/raidBossCritResistance\(r\.level\)/)
  assert.match(index,/Resistência CRIT:/)
})
