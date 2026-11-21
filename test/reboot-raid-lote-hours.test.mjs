import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {raidLoteDurationPlan,raidLoteWaitsForSchedule,raidLoteScheduleText} from '../src/neon/raid-lote-policy.js'

test('V2: 4, 8 e 12 horas significam sessão contínua, sem teto de 3/6/9 Raids',()=>{
  for(const h of [4,8,12]){
    const plan=raidLoteDurationPlan(h+'h')
    assert.equal(plan.hours,h)
    assert.equal(plan.continuous,true)
    assert.equal(plan.intervalMinutes,0)
    assert.equal(plan.attempts,undefined)
  }
  for(const invalid of [0,1,3,6,10,24,12.5,null,true,'4h extra'])
    assert.throws(()=>raidLoteDurationPlan(invalid),/Escolha/)
})
test('V2: sessão começa imediatamente; legado pré-pago mantém seu horário',()=>{
  const t=Date.parse('2026-11-18T10:00:00Z')
  const continuous={status:'running',billing_mode:'per_attempt',duration_hours:4,
    session_ends_at:new Date(t+4*60*60000),next_attempt_at:new Date(t+80*60000)}
  assert.equal(raidLoteWaitsForSchedule(continuous,t),false)
  assert.match(raidLoteScheduleText(continuous,t),/240 min restantes.*sem intervalo/)
  assert.match(raidLoteScheduleText({...continuous,current_attempt_id:'existing'},t),/Raid em andamento/)
  const legacy={status:'running',duration_hours:8,next_attempt_at:new Date(t+80*60000)}
  assert.equal(raidLoteWaitsForSchedule(legacy,t),true)
  assert.equal(raidLoteWaitsForSchedule(legacy,t+80*60000),false)
  assert.match(raidLoteScheduleText(legacy,t),/80 min/)
})
test('worker somente seleciona pacotes devidos; cobrança das sessões acontece na reserva',()=>{
  const w=readFileSync(new URL('../src/neon/raid-lote-worker.js',import.meta.url),'utf8')
  assert.equal(w.split('next_attempt_at IS NULL OR next_attempt_at<=NOW() OR current_attempt_id IS NOT NULL OR cancel_requested').length,3)
  const store=readFileSync(new URL('../src/neon/raid-lote-store.js',import.meta.url),'utf8')
  assert.match(store,/billing_mode='per_attempt' THEN NOW\(\)/)
  assert.match(store,/if\(cash\+bank<quote.totalPrice\)/)
  assert.match(store,/await enqueueRaidLoteNotice\(c,job.id,job.jid\)/)
  const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(wa,/startTimedRaidLoteSession\(db/)
  assert.match(wa,/sem intervalo|sem espera de 80 minutos/)
})
