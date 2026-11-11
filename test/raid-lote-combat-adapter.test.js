import test from 'node:test'
import assert from 'node:assert/strict'
import {raidLoteCombatAdapter} from '../src/neon/raid-lote-combat-adapter.js'
const id='11111111-1111-4111-8111-111111111111'
const attempt={id,raid_chat:'__alpha_raid_lote__:'+id,level:75}
const mock=(overrides={})=>{
  const calls=[]
  const fn=(name,answer)=>async(...args)=>{calls.push({name,args});return answer}
  const deps={
    createRaid:fn('createRaid',{}),
    joinRaid:fn('joinRaid',{}),
    startRaid:fn('startRaid',{startedAt:10000}),
    raidRound:fn('raidRound',{round:1,hp:9000}),
    getRaidStatus:fn('getRaidStatus',{status:'active'}),
    loadAttempt:fn('loadAttempt',{raid_started_at_ms:null}),
    attachAttempt:fn('attachAttempt',{}),
    settleAttempt:fn('settleAttempt',{status:'won'})
  }
  Object.assign(deps,overrides)
  return {deps,calls}
}
test('motor sem suporte a prepagamento nao inicia nem cobra segunda chave',async()=>{
  const {deps,calls}=mock()
  await assert.rejects(()=>raidLoteCombatAdapter(deps).begin(attempt,'jid','Jogador'),/nao habilitado/)
  assert.deepEqual(calls.map(x=>x.name),['loadAttempt'])
})
test('retomada nunca cria uma segunda sala',async()=>{
  const {deps,calls}=mock({loadAttempt:async()=>({raid_started_at_ms:12345})})
  const result=await raidLoteCombatAdapter(deps).begin(attempt,'jid','Jogador')
  assert.deepEqual(result,{status:'resume',startedAt:12345})
  assert.equal(calls.length,0)
})
test('motor habilitado inicia uma vez e vincula ao identificador persistido',async()=>{
  const {deps,calls}=mock()
  for(const k of ['createRaid','joinRaid','startRaid'])deps[k].supportsRaidLotePrepaid=true
  const result=await raidLoteCombatAdapter(deps).begin(attempt,'jid','Jogador')
  assert.equal(result.status,'started')
  assert.deepEqual(calls.map(x=>x.name),['loadAttempt','createRaid','joinRaid','startRaid','attachAttempt'])
  assert.deepEqual(calls.at(-1).args,[id,10000])
})
test('motor processa rodada real sem fabricar resultado',async()=>{
  const {deps,calls}=mock()
  const result=await raidLoteCombatAdapter(deps).tick(attempt)
  assert.deepEqual(result,{status:'running',round:1,hp:9000})
  assert.deepEqual(calls.map(x=>x.name),['getRaidStatus','raidRound'])
})
test('cooldown de 8 segundos nao conta como rodada',async()=>{
  const {deps}=mock({raidRound:async()=>({reason:'cooldown',remainingMs:8000})})
  assert.deepEqual(await raidLoteCombatAdapter(deps).tick(attempt),{status:'cooldown',remainingMs:8000})
})
test('vitoria liquida somente quando motor persistiu completed',async()=>{
  const {deps,calls}=mock({getRaidStatus:async()=>({status:'completed'})})
  assert.equal((await raidLoteCombatAdapter(deps).tick(attempt)).status,'won')
  assert.deepEqual(calls.map(x=>x.name),['settleAttempt'])
})
test('sala ausente nao gera derrota falsa',async()=>{
  const {deps}=mock({getRaidStatus:async()=>null})
  assert.deepEqual(await raidLoteCombatAdapter(deps).tick(attempt),{status:'needs_reconciliation'})
})
test('redutores sao aplicados ao valor base antes de qualquer credito',()=>{
  const {deps}=mock()
  const r=raidLoteCombatAdapter(deps).rewards
  assert.equal(r.cash(633600),506880)
  assert.equal(r.playerXp(1000),600)
  assert.equal(r.heroXp(125),75)
  assert.equal(r.petXp(100),60)
  assert.equal(r.masteryXp(90),45)
  assert.equal(r.fragment(10),4)
  assert.equal(r.gearChance(.02),.005)
})
