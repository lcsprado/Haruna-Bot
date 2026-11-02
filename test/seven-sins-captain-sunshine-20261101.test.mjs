import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAYABLE_HERO_IDS,HERO_COMBAT_PROFILES,heroAttack,heroDefense,
  heroPvpAttack,heroPvpDefense
} from '../src/neon/playable-heroes-core.js'
import {auditSeventeen} from '../src/neon/pvp-balance-simulator.js'

const noon=Date.parse('2026-11-01T12:00:00-03:00')
const midnight=Date.parse('2026-11-01T23:00:00-03:00')

// Same base damage, same matching-weapon bonus, same incoming hits.
// No account, inventory, database or rewards are touched.
function pveTrace(heroId,nowMs=noon,masteryStage=3) {
  let state={},damage=0,healed=0,blocked=0,peak=0,skills=0
  for(let attackIndex=1;attackIndex<=100;attackIndex++){
    const hit=heroAttack({heroId,damage:1000,hp:950,maxHp:1000,attackIndex,
      context:'boss',masteryStage,nowMs,state,gear:{attack:.04,heal:heroId==='pecado_ban'?.02:0}})
    const defended=heroDefense({heroId,damage:300,state:hit.state,gear:{defense:.04}})
    damage+=hit.damage;healed+=hit.heal;blocked+=300-defended.damage
    peak=Math.max(peak,hit.damage)
    if(hit.technique)skills++
    state=defended.state
    assert.ok(hit.damage>=1&&hit.damage<=1360,heroId+' exceeded Boss bound')
    assert.ok(defended.damage>=210&&defended.damage<=300,heroId+' exceeded defense bound')
  }
  return {damage,healed,blocked,peak,skills}
}

test('Meliodas supera o dano continuo de Ban; Ban preserva a recuperacao superior',()=>{
  const captain=pveTrace('pecado_meliodas')
  const immortal=pveTrace('pecado_ban')
  assert.ok(captain.damage>immortal.damage,'captain offensive identity was not achieved')
  assert.ok(captain.skills>0,'Full Counter and Revenge Counter are inactive')
  assert.ok(immortal.healed>captain.healed,'Ban must retain sustainable HP advantage')
  assert.ok(immortal.blocked>0,'Ban defensive skill stopped working')
})

test('Escanor e maior explosao diurna; Sunshine segue contextual e The One dura 3 golpes',()=>{
  const day=pveTrace('pecado_escanor',noon)
  const night=pveTrace('pecado_escanor',midnight)
  const captain=pveTrace('pecado_meliodas',noon)
  assert.ok(day.damage>night.damage,'Sunshine should depend on daylight')
  assert.ok(day.damage>captain.damage,'Escanor should have best daytime burst pressure')
  assert.equal(day.peak,1360)
  assert.ok(night.peak<=1300,'night-time Escanor should stay under standard Boss burst')
  let state={}
  const hits=[]
  for(let index=25;index<=28;index++){
    const hit=heroAttack({heroId:'pecado_escanor',damage:1000,attackIndex:index,
      masteryStage:3,nowMs:midnight,state,context:'boss'})
    hits.push(hit.damage);state=hit.state
  }
  assert.deepEqual(hits,[1300,1300,1300,1000])
})

test('7 papeis preservados: Diane defende mais; King cura aliados; Ban regenera',()=>{
  const summaries=Object.fromEntries(PLAYABLE_HERO_IDS.map(id=>[id,pveTrace(id)]))
  assert.equal(Object.keys(summaries).length,7)
  assert.ok(summaries.pecado_diane.blocked>summaries.pecado_meliodas.blocked)
  assert.ok(summaries.pecado_ban.healed>0)
  const king=heroAttack({heroId:'pecado_king',damage:1000,maxHp:2000,
    attackIndex:8,masteryStage:3,context:'raid'})
  assert.ok(king.allyHeal>0)
  assert.ok(summaries.pecado_gowther.skills>0)
  assert.ok(summaries.pecado_merlin.skills>0)
})

test('PvP conta contra-ataque Meliodas e explosao Escanor, sem ultrapassar 8%',()=>{
  const prepared=heroPvpAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:5,
    masteryStage:3})
  assert.equal(prepared.state.counterReady,true)
  const struck=heroPvpDefense({heroId:'pecado_meliodas',damage:350,state:prepared.state})
  const counter=heroPvpAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:6,
    masteryStage:3,state:struck.state})
  assert.equal(counter.technique,'Full Counter')
  assert.ok(counter.damage>prepared.damage)
  assert.ok(counter.damage<=1080)
  const solar=heroPvpAttack({heroId:'pecado_escanor',damage:1000,attackIndex:5,
    hp:900,maxHp:1000,masteryStage:3})
  const weak=heroPvpAttack({heroId:'pecado_escanor',damage:1000,attackIndex:5,
    hp:500,maxHp:1000,masteryStage:3})
  assert.ok(solar.damage>weak.damage)
  const ultimate=heroPvpAttack({heroId:'pecado_escanor',damage:1000,attackIndex:12,
    hp:900,maxHp:1000,masteryStage:3,gear:{attack:.015}})
  assert.equal(ultimate.damage,1080)
  for(const heroId of PLAYABLE_HERO_IDS){
    for(const masteryStage of [1,3,5]){
      let state={}
      for(let attackIndex=1;attackIndex<=30;attackIndex++){
        const hit=heroPvpAttack({heroId,damage:1000,hp:950,maxHp:1000,
          attackIndex,masteryStage,state,gear:{attack:.015}})
        const defense=heroPvpDefense({heroId,damage:1000,state:hit.state,gear:{defense:.02}})
        assert.ok(hit.damage>=1000&&hit.damage<=1080,heroId+' PvP damage cap')
        assert.ok(defense.damage>=900&&defense.damage<=1000,heroId+' PvP defense cap')
        state=defense.state
      }
    }
  }
})

test('17 combatentes seguem comparaveis com e sem equipamentos iguais',()=>{
  for(const gear of [false,true]){
    const audit=auditSeventeen({duelsPerOrder:8,gear,mastery:5,awakening:5})
    assert.equal(audit.combatants,17)
    assert.equal(audit.pairs.length,136)
    assert.equal(audit.battles,2176)
    assert.ok(audit.ranking.every(r=>r.winRate>=0&&r.winRate<=100))
    assert.ok(audit.ranking.some(r=>r.blockedPerFight>0))
    assert.ok(audit.ranking.some(r=>r.healedPerFight>0))
  }
})

test('progressao e equipamentos dos jogadores ficam intactos',()=>{
  assert.equal(HERO_COMBAT_PROFILES.pecado_meliodas.atk,18)
  assert.equal(HERO_COMBAT_PROFILES.pecado_escanor.atk,21)
  assert.equal(HERO_COMBAT_PROFILES.pecado_ban.atk,14)
  assert.equal(HERO_COMBAT_PROFILES.pecado_diane.def,22)
})