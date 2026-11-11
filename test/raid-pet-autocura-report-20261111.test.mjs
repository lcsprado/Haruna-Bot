import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

// A contagem do boletim representa poções debitadas, não desmaios.
// A prova transacional é o contexto "raid-preventive" na auditoria.
const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

test('Raid e Boss identificam contagem como autocuras, nunca como quedas',()=>{
  assert.match(source,/const tallyRaidPetHeals=\(\)=>/)
  assert.match(source,/const petHealSummary=\(\)=>/)
  assert.equal(source.split('autocuras: *${v.count}* •').length-1,2)
  assert.doesNotMatch(source,/caiu \*\$\{v\.count\}x\* •/)
})

test('boletim da Raid contabiliza somente eventos com poção realmente usada',()=>{
  assert.match(source,/if\(e\.type!=='boss'\|\|!e\.autoPetHeal\)continue/)
  assert.match(source,/v\.count\+\+/)
  assert.match(source,/if\(raidPetHealTally\.size\)text\+='\\n\\n🐾🧪 \*BOLETIM DE AUTOCURA DOS PETS\*'/)
})
