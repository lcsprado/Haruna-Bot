import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {businessCollectionElapsedSeconds,formatBusinessCollectionElapsed,businessIntervalGross} from '../src/neon/business-profit.js'

test('mostra 10 horas sem coletar usando a ultima coleta efetiva',()=>{
  const now=1_800_000_000
  const elapsed=businessCollectionElapsedSeconds(now,now-10*3600,[{acquired_at:now-20*3600}])
  assert.equal(elapsed,36_000)
  assert.equal(formatBusinessCollectionElapsed(elapsed),'10h 0min')
})
test('primeira coleta usa a compra mais antiga dos negocios',()=>{
  const now=1_800_000_000
  assert.equal(businessCollectionElapsedSeconds(now,0,[{acquired_at:now-3600},{acquired_at:now-7200}]),7200)
  assert.equal(formatBusinessCollectionElapsed(7200),'2h 0min')
})
test('intervalos longos nao sao truncados a capacidade de lucros',()=>{
  const now=1_800_000_000
  assert.equal(formatBusinessCollectionElapsed(businessCollectionElapsedSeconds(now,now-26*3600-15*60)), '26h 15min')
  assert.equal(businessIntervalGross({profitHour:300,capacityHours:8},{level:1,last_collected_at:now-26*3600},now),2400)
})
test('menos de uma hora, horario futuro e registros incompletos',()=>{
  assert.equal(formatBusinessCollectionElapsed(17*60+30),'17min')
  assert.equal(businessCollectionElapsedSeconds(1_800_000_000,1_800_000_010),0)
  assert.equal(businessCollectionElapsedSeconds(1_800_000_000,0,[]),null)
  assert.equal(formatBusinessCollectionElapsed(null),'0min')
  assert.equal(formatBusinessCollectionElapsed(Number.NaN),null)
})
test('comando de coleta exibe tempo sem alterar valores e usa timestamp da transacao',()=>{
  const progression=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
  const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(progression,/SELECT MAX\(created_at\) AS last_claim/)
  assert.match(progression,/collectionElapsedSeconds=businessCollectionElapsedSeconds\(now,lastClaim,rows\)/)
  assert.match(progression,/firstBusinessCollection:lastClaim<=0/)
  assert.match(bot,/Tempo sem coletar/)
  assert.match(bot,/formatBusinessCollectionElapsed\(r.collectionElapsedSeconds\)/)
})
