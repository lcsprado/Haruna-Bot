import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {classPvpAttack,classPvpDefense,classPvpCritBonus} from '../src/neon/pvp-class-powers.js'
import {PVP_COMBATANTS,buildFairFighter,simulateFairDuel,auditSeventeen} from '../src/neon/pvp-balance-simulator.js'
import {PLAYER_CLASSES} from '../src/neon/game-catalog.js'
import {HERO_COMBAT_PROFILES} from '../src/neon/playable-heroes-core.js'

test('17 combatentes: 10 classes e sete herois no mesmo nivel e com gear equivalente',()=>{
  assert.equal(PVP_COMBATANTS.length,17)
  assert.equal(new Set(PVP_COMBATANTS).size,17)
  assert.equal(Object.keys(PLAYER_CLASSES).length,10)
  assert.equal(Object.keys(HERO_COMBAT_PROFILES).length,7)
  for(const id of PVP_COMBATANTS){
    const a=buildFairFighter(id),b=buildFairFighter(id,{gear:true})
    assert.deepEqual([b.maxHp-a.maxHp,b.atk-a.atk,b.def-a.def,b.spd-a.spd],[900,300,300,35])
    assert.equal(a.hp,a.maxHp)
  }
})

test('Despertar nao afeta herois nem classes que nao o desbloquearam',()=>{
  for(const id of Object.keys(PLAYER_CLASSES)){
    const inactive=classPvpAttack({classId:id,applied:false,awakeningStage:5,damage:200,critical:true,attackIndex:8})
    const dormant=classPvpAttack({classId:id,applied:true,awakeningStage:0,damage:200,critical:true,attackIndex:8})
    assert.equal(inactive.technique,null)
    assert.equal(dormant.technique,null)
    assert.equal(classPvpCritBonus(id,false,5),0)
  }
  for(const id of Object.keys(HERO_COMBAT_PROFILES)){
    const a=buildFairFighter(id,{awakening:5}),b=buildFairFighter(id,{awakening:0})
    assert.equal(a.awakening,0)
    assert.deepEqual([a.atk,a.def,a.spd],[b.atk,b.def,b.spd])
  }
})

test('Despertar V: todas as dez classes ativam tecnicas e efeitos verificaveis',()=>{
  for(const id of Object.keys(PLAYER_CLASSES)){
    let state={},base=0,advanced=0,healed=0,shielded=0,skills=0,blocked=0
    for(let i=1;i<=25;i++){
      const args={classId:id,applied:true,damage:250,critical:i%3===0,
        hp:Math.round(3100*(i%6===0?.20:.38)),maxHp:3100,
        attackIndex:i,roll:0,awakeningState:state,awakeningStage:5}
      const full=classPvpAttack(args)
      state=full.awakeningState
      base+=classPvpAttack({...args,awakeningStage:0}).damage
      advanced+=full.damage
      healed+=full.heal
      if(full.technique)skills++
      const defense=classPvpDefense({classId:id,applied:true,damage:300,roll:id==='monk'?.035:.5,
        hp:800,maxHp:3100,awakeningStage:5,awakeningState:state})
      state=defense.awakeningState
      shielded+=defense.shieldAbsorbed
      blocked+=defense.blocked
      if(defense.technique)skills++
    }
    assert.ok(advanced>=base,id+' PvP awakening damaged class offensive powers')
    assert.ok(advanced>base||healed>0||skills>0||blocked>0,id+' class awakening no improvement')
    assert.ok(skills>0||healed>0||shielded>0,id+' no active power')
    assert.ok(blocked>=0&&healed>=0&&shielded>=0)
  }
  const monk=classPvpDefense({classId:'monk',applied:true,awakeningStage:5,damage:300,roll:.035,hp:1000,maxHp:3100})
  assert.equal(monk.dodged,true)
  assert.equal(monk.damage,0)
  assert.ok(monk.awakeningState.counter)
  assert.equal(classPvpCritBonus('samurai',true,5),.01)
})

test('HP, escudos, bloqueios e curas permanecem em limites seguros',()=>{
  for(const id of PVP_COMBATANTS){
    for(let seed=1;seed<=8;seed++){
      const other=PVP_COMBATANTS[(PVP_COMBATANTS.indexOf(id)+seed)%PVP_COMBATANTS.length]
      const d=simulateFairDuel(id,other,{seed})
      for(const x of [d.a,d.b]){
        assert.ok(x.hp>=0&&x.hp<=x.maxHp,id)
        assert.ok(x.metrics.damage>=0&&x.metrics.blocked>=0&&x.metrics.healed>=0)
        assert.ok(x.metrics.shield>=0&&x.metrics.dodges>=0)
      }
      assert.ok(d.rounds>=1&&d.rounds<=20)
    }
  }
})

test('TODOS contra TODOS: 136 pares nos dois lados, com e sem equipamento identico',()=>{
  const bare=auditSeventeen({duelsPerOrder:40,gear:false})
  const equipped=auditSeventeen({duelsPerOrder:40,gear:true})
  for(const audit of [bare,equipped]){
    assert.equal(audit.combatants,17)
    assert.equal(audit.pairs.length,136)
    assert.equal(audit.battles,10880)
    assert.equal(audit.ranking.length,17)
    assert.equal(audit.pairs.length,136)
    assert.equal(audit.ranking.reduce((s,x)=>s+x.wins,0),10880)
    assert.ok(audit.ranking.every(x=>x.fights===1280))
    for(const field of ['healedPerFight','blockedPerFight','criticalsPerFight','abilitiesPerFight'])
      assert.ok(audit.ranking.some(x=>x[field]>0),field+' never counted')
  }
  const summary=audit=>({scenario:audit.scenario,battles:audit.battles,
    ranking:audit.ranking.map(x=>({name:x.id,winPct:x.winRate,damage:x.damagePerFight,
      blocked:x.blockedPerFight,healed:x.healedPerFight,shield:x.shieldPerFight,
      criticals:x.criticalsPerFight,abilities:x.abilitiesPerFight}))})
  console.log('ALPHA_PVP_17_RESULT '+JSON.stringify(summary(bare)))
  console.log('ALPHA_PVP_17_RESULT '+JSON.stringify(summary(equipped)))
})

test('Motor de PvP de producao carrega Despertar e mede todos os efeitos',()=>{
  const src=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const battle=src.slice(src.indexOf('export async function battle('),src.indexOf('export async function combatLeaderboard('))
  assert.match(battle,/SELECT jid,stage FROM player_awakenings WHERE jid=ANY/)
  assert.match(battle,/classPvpCritBonus\(a\.class_id/)
  assert.match(battle,/classPvpCritBonus\(b\.class_id/)
  assert.match(battle,/classPvpAttack\(\{\.\.\.attackArgs/)
  assert.match(battle,/classPvpDefense\(defenseArgs\)/)
  assert.match(battle,/awakeningState:from\.awakeningState/)
  assert.match(battle,/to\.awakeningState=defense\.awakeningState/)
  assert.match(battle,/const dmg=dodged\|\|defense\.dodged\?0:/)
  assert.match(battle,/const pvpMetrics=Object\.fromEntries/)
  assert.match(battle,/shieldAbsorbed/)
  assert.doesNotMatch(battle,/classAttack\(\{\.\.\.attackArgs/)
  assert.doesNotMatch(battle,/classDefense\(\{classId:to\.classId/)
})
