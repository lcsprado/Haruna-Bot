import test from 'node:test'
import assert from 'node:assert/strict'
import {raidLoteCombatAdapter} from '../src/neon/raid-lote-combat-adapter.js'
const id='11111111-1111-4111-8111-111111111111'
const attempt={id,job_id:'job-1',raid_chat:'__alpha_raid_lote__:'+id,level:75}
const mock=(overrides={})=>{
  const calls=[]
  const fn=(name,answer)=>async(...args)=>{calls.push({name,args});return answer}
  const deps={
    startRaid:fn('startRaid',{startedAt:10000,status:'active'}),
    raidRound:fn('raidRound',{round:1,hp:9000}),
    readRaidState:fn('readRaidState',{status:'active',mode:'lote',loteAttemptId:id}),
    loadAttempt:fn('loadAttempt',{id,job_id:'job-1',raid_started_at_ms:null}),
    settleAttempt:fn('settleAttempt',{status:'won'})
  }
  Object.assign(deps,overrides)
  return {deps,calls}
}
test('inicía a tentativa usando a rota interna com pre-pagamento, uma vez',async()=>{
  const {deps,calls}=mock()
  const result=await raidLoteCombatAdapter(deps).begin(attempt,'jid')
  assert.deepEqual(result,{status:'started',startedAt:10000})
  assert.deepEqual(calls.map(x=>x.name),['loadAttempt','startRaid'])
  assert.deepEqual(calls[1].args,[attempt.raid_chat,'jid',75,{loteAttemptId:id}])
})
test('retomada não cria nem cobra uma segunda luta',async()=>{
  const {deps,calls}=mock({loadAttempt:async()=>({id,job_id:'job-1',raid_started_at_ms:12345})})
  assert.deepEqual(await raidLoteCombatAdapter(deps).begin(attempt,'jid'),{status:'resume',startedAt:12345})
  assert.equal(calls.length,0)
})
test('tentativa precisa estar registrada e vinculada ao mesmo job',async()=>{
  const {deps,calls}=mock({loadAttempt:async()=>({id,job_id:'outro',raid_started_at_ms:null})})
  await assert.rejects(()=>raidLoteCombatAdapter(deps).begin(attempt,'jid'),/nao registrada/)
  assert.equal(calls.length,0)
})
test('rodada usa o mesmo motor real sem fabricar resultado',async()=>{
  const {deps,calls}=mock()
  assert.deepEqual(await raidLoteCombatAdapter(deps).tick(attempt),{status:'running',round:1,hp:9000})
  assert.deepEqual(calls.map(x=>x.name),['readRaidState','raidRound'])
})
test('cooldown respeitado',async()=>{
  const {deps}=mock({raidRound:async()=>({reason:'cooldown',remainingMs:8000})})
  assert.deepEqual(await raidLoteCombatAdapter(deps).tick(attempt),{status:'cooldown',remainingMs:8000})
})
test('conclusao ja persistida chama liquidacao unica',async()=>{
  const {deps,calls}=mock({readRaidState:async()=>({mode:'lote',loteAttemptId:id,status:'completed'})})
  assert.deepEqual(await raidLoteCombatAdapter(deps).tick(attempt),{status:'won'})
  assert.deepEqual(calls.map(x=>x.name),['settleAttempt'])
})
test('vitoria retornada pela rodada aguarda commit para liquidar',async()=>{
  const {deps}=mock({raidRound:async()=>({victory:true})})
  assert.deepEqual(await raidLoteCombatAdapter(deps).tick(attempt),{status:'settle_pending'})
})
test('sala ausente ou inconsistente bloqueia sem forjar derrota',async()=>{
  const {deps}=mock({readRaidState:async()=>null})
  assert.deepEqual(await raidLoteCombatAdapter(deps).tick(attempt),{status:'needs_reconciliation'})
  const invalid=mock({readRaidState:async()=>({mode:'manual',status:'completed'})})
  await assert.rejects(()=>raidLoteCombatAdapter(invalid.deps).tick(attempt),/nao corresponde/)
})
