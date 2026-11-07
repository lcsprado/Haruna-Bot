import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {CRIT_CAPS} from '../src/neon/critical-chance-policy.js'

const source=name=>readFileSync(new URL('../src/neon/'+name,import.meta.url),'utf8')
const count=(text,pattern)=>(text.match(pattern)||[]).length

test('tetos de crítico: PvP 50%, Boss 55%, Raid 60%',()=>{
  assert.deepEqual({...CRIT_CAPS},{pvp:.50,boss:.55,raid:.60})
  for(const mode of ['pvp','boss','raid']){
    assert.equal(Math.min(CRIT_CAPS[mode],.99),CRIT_CAPS[mode])
    assert.equal(Math.min(CRIT_CAPS[mode],.30),.30)
  }
})

test('PvP usa o teto 50% na ficha, no duelo, no pet e no relatório',()=>{
  const db=source('db.js')
  assert.equal(count(db,/Math\.min\(CRIT_CAPS\.pvp,/g),7)
  assert.doesNotMatch(db,/Math\.min\(\.40,.*(?:crit|Crit)/)
  const index=source('index.js')
  assert.match(index,/const pvpCritNoPet=Math\.min\(CRIT_CAPS\.pvp,/)
  assert.match(index,/const pvpCritWithPet=Math\.min\(CRIT_CAPS\.pvp,/)
})

test('Boss 55% e Raid 60% usam teto em todos os lançamentos de ataque',()=>{
  const games=source('games.js')
  assert.equal(count(games,/crit:Math\.min\(CRIT_CAPS\.raid,/g),2)
  assert.match(games,/Math\.min\(CRIT_CAPS\.raid,petCritChance\+gearCritChance\)/)
  assert.match(games,/const totalCritChance=Math\.min\(CRIT_CAPS\.boss,/)
  assert.doesNotMatch(games,/crit:Math\.min\(\.45,/)
  const index=source('index.js')
  assert.match(index,/const raidCritPct=Math\.min\(CRIT_CAPS\.raid,/)
  assert.match(index,/const bossCritPct=Math\.min\(CRIT_CAPS\.boss,/)
  assert.match(index,/const raidCritNoPetsPct=Math\.min\(CRIT_CAPS\.raid,/)
  assert.match(index,/const bossCritNoPetsPct=Math\.min\(CRIT_CAPS\.boss,/)
})

test('!status separa Boss e Raid, e a Web acompanha teto PvP',()=>{
  const index=source('index.js')
  assert.match(index,/🎯 CRIT PvP: \$\{pvpCritPct\.toLocaleString/)
  assert.match(index,/👹 CRIT Boss: \$\{bossCritPct\.toLocaleString/)
  assert.match(index,/🐉 CRIT Raid: \$\{raidCritPct\.toLocaleString/)
  assert.doesNotMatch(index,/👹 CRIT Boss\/Raid:/)
  assert.match(source('web-api.js'),/effective_crit:Math\.min\(CRIT_CAPS\.pvp,/)
})
