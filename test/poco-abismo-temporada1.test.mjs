import test from 'node:test'
import assert from 'node:assert/strict'
import {
  POCO_SEASON,POCO_DROP_WEIGHTS,POCO_GEAR,pocoCashForFloor,pocoRewardTotal,
  pocoRollDrop,pocoNormalize,pocoStart,pocoDecision,pocoBossSkill,pocoEnd,
  pocoRankingCompare,pocoBetter,pocoSeasonActive
} from '../src/neon/poco-abismo-rules.js'

test('janela semanal: segunda até sexta 21h Brasília, sem reabrir após corte',()=>{
  assert.equal(POCO_SEASON.floorLimit,30)
  assert.deepEqual(POCO_SEASON.bossFloors,[5,10,15,20,25,30])
  assert.deepEqual(POCO_SEASON.dropBossFloors,[10,15,20,25,30])
  assert.equal(POCO_SEASON.responseMs,120000)
  assert.equal(pocoSeasonActive(POCO_SEASON.startAt-1),false)
  assert.equal(pocoSeasonActive(POCO_SEASON.startAt),true)
  assert.equal(pocoSeasonActive(POCO_SEASON.endAt-1),true)
  assert.equal(pocoSeasonActive(POCO_SEASON.endAt),false)
})
test('dinheiro econômico: somente marcos por primeira conquista, total 3,5M',()=>{
  assert.equal(pocoCashForFloor(1),30000)
  assert.equal(pocoCashForFloor(10),50000)
  assert.equal(pocoCashForFloor(30),250000)
  assert.equal(pocoCashForFloor(0),0)
  assert.equal(pocoRewardTotal(),3500000)
})
test('drop exato: 0,6% exclusivo, 0,12% por peça e 28,4% vazio',()=>{
  assert.equal(POCO_DROP_WEIGHTS.reduce((sum,x)=>sum+x.weight,0),10000)
  assert.equal(POCO_GEAR.length,5)
  for(let i=0;i<5;i++){
    assert.deepEqual(pocoRollDrop(()=>(i*12)/10000),{kind:'exclusive',itemId:POCO_GEAR[i].id})
    assert.deepEqual(pocoRollDrop(()=>((i+1)*12-1)/10000),{kind:'exclusive',itemId:POCO_GEAR[i].id})
  }
  assert.equal(pocoRollDrop(()=>.006).kind,'legendary_box')
  assert.equal(pocoRollDrop(()=>.046).kind,'epic_box')
  assert.equal(pocoRollDrop(()=>.166).kind,'forge_materials')
  assert.equal(pocoRollDrop(()=>.366).kind,'fragments')
  assert.equal(pocoRollDrop(()=>.616).kind,'cash_bonus')
  assert.equal(pocoRollDrop(()=>.716).kind,'none')
  assert.throws(()=>pocoRollDrop(()=>1),RangeError)
})
test('normalização: vantagem de progressão limitada a 5%; composição salva em snapshot',()=>{
  const base=pocoNormalize({level:1,effective_atk:30,effective_def:10,heroId:'pecado_ban',weapon_id:'w1',petIds:[7,8,9]})
  const advanced=pocoNormalize({level:600,effective_atk:30000,effective_def:20000,heroId:'pecado_ban',weapon_id:'w2'})
  assert.ok(advanced.bonus<=.05)
  assert.ok(advanced.atk/base.atk<=1.051)
  assert.ok(advanced.maxHp/base.maxHp<=1.051)
  assert.deepEqual(base.composition.petIds,['7','8','9'])
  assert.equal(base.composition.weaponId,'w1')
})
test('início automático limpa 4 andares e para para escolha no guardião 5',()=>{
  const {state,cleared}=pocoStart({profile:{heroId:'pecado_diane',level:300},seed:12,now:100})
  assert.deepEqual(cleared,[1,2,3,4])
  assert.equal(state.floor,4)
  assert.equal(state.boss.floor,5)
  assert.equal(state.deadline,120100)
  assert.equal(state.potions,2)
  assert.equal(state.skillCharges,5)
})
test('decisão inválida não muda o estado, cura consome recurso e o Boss reage',()=>{
  const {state}=pocoStart({profile:{heroId:'pecado_ban'},seed:2,now:50})
  const copy=structuredClone(state)
  assert.throws(()=>pocoDecision(state,0,{now:100}),RangeError)
  assert.deepEqual(state,copy)
  const res=pocoDecision(state,3,{now:100})
  assert.equal(res.state.potions,1)
  assert.equal(res.state.turns,state.turns+1)
  assert.equal(res.state.deadline,120100)
  assert.deepEqual(state,copy)
})
test('120s: resposta tardia encerra tentativa, progresso do ranking não regride',()=>{
  const {state}=pocoStart({profile:{},seed:2,now:100})
  const last=pocoDecision(state,1,{now:120101})
  assert.equal(last.state.status,'ended')
  assert.equal(last.state.report.reason,'timeout')
  assert.equal(last.state.floor,4)
  const retry=pocoStart({profile:{},seed:3,now:130000,attempt:2})
  assert.equal(retry.state.floor,4)
  assert.equal(retry.state.turns,4)
  assert.equal(retry.state.attempt,2)
  assert.throws(()=>pocoEnd(state,'timeout',state.deadline),/ainda aberto/)
})
test('ranking: andar antes do tempo virtual; após andar, menor número de rodadas',()=>{
  const a={jid:'a',floor:30,turns:70,hp:200,potions:1,endedAt:9}
  const b={jid:'b',floor:30,turns:69,hp:1,potions:0,endedAt:10}
  const c={jid:'c',floor:29,turns:1,hp:900,potions:2,endedAt:1}
  assert.ok(pocoRankingCompare(b,a)<0)
  assert.ok(pocoRankingCompare(a,c)<0)
  assert.equal(pocoBetter(b,a),true)
  assert.equal(pocoBetter(c,a),false)
})
test('todas as identidades podem terminar até o andar 30 com tática adequada',()=>{
  for(const heroId of ['pecado_diane','pecado_ban','pecado_meliodas','samurai']){
    let wins=0
    for(let seed=1;seed<=60;seed++){
      let {state}=pocoStart({profile:{heroId,level:200,effective_atk:500,effective_def:500},seed,now:1})
      for(let n=0;state.status==='active'&&n<120;n++){
        const skill=pocoBossSkill(state.boss.floor,state.boss.turn)
        const choice=state.hp<state.stats.maxHp*.60&&state.potions&&skill.type==='barrier'?3
          :skill.type==='charge'?2
          :skill.type==='bleed'&&state.skillCharges?4:1
        state=pocoDecision(state,choice,{now:state.deadline-1000}).state
      }
      if(state.floor===30)wins++
    }
    assert.ok(wins>=20,'Uma classe não consegue terminar: '+heroId+'; '+wins+'/60')
  }
})

test('derrota em andar comum após Guardião preserva o último andar de fato concluído',()=>{
 const {state}=pocoStart({seed:1,now:1000})
 state.hp=1
 state.boss.hp=1
 const result=pocoDecision(state,1,{now:1100})
 assert.equal(result.bossDefeated,5)
 assert.deepEqual(result.cleared,[5])
 assert.equal(result.state.report.reason,'death')
 assert.equal(result.state.floor,5)
 assert.equal(result.state.turns,6)
})
