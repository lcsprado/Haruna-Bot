import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {raidLoteDurationPlan,raidLoteWaitsForSchedule,raidLoteScheduleText} from '../src/neon/raid-lote-policy.js'
test('V2: 4, 8 e 12h são 3, 6 e 9 tentativas, intervalos de 80 minutos',()=>{
 for(const h of [4,8,12]){
  const plan=raidLoteDurationPlan(h+'h')
  assert.equal(plan.hours,h)
  assert.equal(plan.attempts,h*3/4)
  assert.equal(plan.attempts*plan.intervalMinutes,h*60)
 }
 for(const invalid of [0,1,3,6,10,24,12.5,null,true,'4h extra'])
  assert.throws(()=>raidLoteDurationPlan(invalid),/Escolha/)
})
test('espera persistente respeita limite temporal, combate existente e cancelamento',()=>{
 const t=Date.parse('2026-11-18T10:00:00Z')
 const job={status:'running',duration_hours:8,next_attempt_at:new Date(t+80*60000)}
 assert.equal(raidLoteWaitsForSchedule(job,t),true)
 assert.equal(raidLoteWaitsForSchedule(job,t+80*60000),false)
 assert.equal(raidLoteWaitsForSchedule({...job,current_attempt_id:'existing'},t),false)
 assert.equal(raidLoteWaitsForSchedule({...job,cancel_requested:true},t),false)
 assert.equal(raidLoteWaitsForSchedule({status:'queued'},t),false)
 assert.match(raidLoteScheduleText(job,t),/8h.*80 min/)
})
test('worker não escreve leases em pacotes esperando a próxima tentativa',()=>{
 const w=readFileSync(new URL('../src/neon/raid-lote-worker.js',import.meta.url),'utf8')
 assert.equal(w.split('next_attempt_at IS NULL OR next_attempt_at<=NOW() OR current_attempt_id IS NOT NULL OR cancel_requested').length,3)
 const s=readFileSync(new URL('../src/neon/raid-lote-store.js',import.meta.url),'utf8')
 assert.match(s,/next_attempt_at=CASE WHEN duration_hours IS NULL THEN NULL ELSE NOW\(\)/)
 const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(wa,/durationHours:durationPlan\?\.hours\?\?null/)
})
