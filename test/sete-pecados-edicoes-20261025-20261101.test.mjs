import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PECADOS_EDITIONS,PECADOS_BOSS_PHASES,PECADOS_ESSENCES,PECADOS_ESSENCES_PER_PHASE,PECADOS_FULL_CLEAR_BONUS_ESSENCES,PECADOS_MIN_BOSS_DAMAGE,pecadosEditionCompletionBonus} from '../src/neon/sete-pecados-catalog.js'
const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8')
const games=read('src/neon/games.js')
const collab=read('src/neon/sete-pecados-collab.js')

test('Boss dos Sete Pecados: duas edições, oito fases e dificuldade 5,4 milhões',()=>{
  assert.equal(PECADOS_EDITIONS.length,2)
  assert.equal(PECADOS_EDITIONS[0].start,Date.parse('2026-10-25T18:00:00-03:00'))
  assert.equal(PECADOS_EDITIONS[1].start,Date.parse('2026-11-01T18:00:00-03:00'))
  assert.equal(PECADOS_BOSS_PHASES.length,8)
  assert.equal(PECADOS_BOSS_PHASES.reduce((sum,p)=>sum+p.hp,0),5400000)
  assert.equal(PECADOS_BOSS_PHASES[0].hp,300000)
  assert.equal(PECADOS_BOSS_PHASES[7].hp,1200000)
  assert.equal(PECADOS_MIN_BOSS_DAMAGE,10000)
  assert.match(games,/const PECADOS_PHASES=PECADOS_BOSS_PHASES/)
})
test('Prêmios: no dia 25/10 são somente duas invocações, dia 01/11 mantém três',()=>{
  assert.equal(PECADOS_ESSENCES.length,7)
  assert.equal(PECADOS_ESSENCES_PER_PHASE,2)
  assert.equal(PECADOS_FULL_CLEAR_BONUS_ESSENCES,7)
  assert.equal(pecadosEditionCompletionBonus(PECADOS_EDITIONS[0].key),0)
  assert.equal(pecadosEditionCompletionBonus(PECADOS_EDITIONS[1].key),7)
  assert.equal(pecadosEditionCompletionBonus('unknown'),0)
  assert.equal(PECADOS_ESSENCES.length*PECADOS_ESSENCES_PER_PHASE+pecadosEditionCompletionBonus(PECADOS_EDITIONS[0].key),14)
  assert.equal(PECADOS_ESSENCES.length*PECADOS_ESSENCES_PER_PHASE+pecadosEditionCompletionBonus(PECADOS_EDITIONS[1].key),21)
  assert.match(games,/\[p\.jid,itemId,PECADOS_ESSENCES_PER_PHASE\]/)
  assert.match(games,/const extraEssences=pecadosEditionCompletionBonus\(s\.scheduleKey\)/)
  assert.match(games,/if\(extraEssences>0\)/)
  assert.match(games,/\[p\.jid,PECADOS_ESSENCES\[0\],extraEssences\]/)
  assert.match(games,/const full=PECADOS_PHASES\.every/)
  assert.doesNotMatch(games,/bonus_pecados_repetido/)
})
test('Arma e armadura repetidas preservam cópias; personagem repetido gera 50 universais',()=>{
  assert.match(collab,/if\(duplicate&&category==='personagem'\)/)
  assert.match(collab,/copyPreserved:duplicate&&category!=='personagem'/)
  assert.match(collab,/INSERT INTO inventories\(jid,item_id,quantity\) VALUES\(\$1,\$2,1\) ON CONFLICT/)
  assert.match(collab,/PERSONAGEM REPETIDO/)
  assert.match(collab,/EQUIPAMENTO REPETIDO/)
})
