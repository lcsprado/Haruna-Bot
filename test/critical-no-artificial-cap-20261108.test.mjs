import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pvpCritChance} from '../src/neon/pvp-crit.js'
import {effectiveShieldedCritChance,shieldedCriticalMultiplier} from '../src/neon/anti-crit-shields.js'

const source=(file)=>readFileSync(new URL('../src/neon/'+file,import.meta.url),'utf8')

test('bônus de crítico superam antigos tetos de PvP, Boss e Raid',()=>{
  const chance=pvpCritChance({equipmentCrit:.55,petCrit:.10})
  assert.ok(Math.abs(chance-.75)<1e-9)
  const db=source('db.js'),games=source('games.js'),app=source('index.js')
  assert.doesNotMatch(db,/Math\.min\(\.40,/)
  assert.doesNotMatch(games,/crit:Math\.min\(\.45,/)
  assert.doesNotMatch(games,/totalCritChance=Math\.min\(\.45,/)
  assert.doesNotMatch(games,/Math\.min\(\.50,petCritChance\+gearCritChance\)/)
  assert.doesNotMatch(app,/raidCritPct=Math\.min\(/)
  assert.doesNotMatch(app,/bossCritPct=Math\.min\(/)
  assert.doesNotMatch(source('pvp-combat.js'),/Math\.min\(\.40,/)
})

test('escudos continuam reduzindo a chance e o dano do crítico',()=>{
  const chance=pvpCritChance({equipmentCrit:.55,petCrit:.10})
  assert.ok(Math.abs(effectiveShieldedCritChance(chance,.12)-.63)<1e-9)
  assert.ok(Math.abs(effectiveShieldedCritChance(1.05,.12)-.88)<1e-9)
  assert.ok(Math.abs(shieldedCriticalMultiplier(1.6,.18)-1.492)<1e-9)
  assert.equal(effectiveShieldedCritChance(.50,0),.50)
})
