import test from 'node:test'
import assert from 'node:assert/strict'
import {heroAttack} from '../src/neon/playable-heroes-core.js'
import {classAttack,classDefense,PLAYER_CLASSES} from '../src/neon/game-catalog.js'
import {PECADOS_HEROES} from '../src/neon/sete-pecados-catalog.js'
import {
  raidAttackSkillEvents,raidDefenseSkillEvents,incrementRaidSkillCounts,formatRaidSkillLine
} from '../src/neon/raid-skill-summary.js'

test('cada um dos sete heróis tem eventos reais nas técnicas de maestria II e III',()=>{
  for(const hero of PECADOS_HEROES){
    const id=hero.species
    const stage3={heroId:id,masteryStage:3}
    const at8=heroAttack({heroId:id,damage:1000,maxHp:2000,attackIndex:8,masteryStage:3})
    const at25=heroAttack({heroId:id,damage:1000,maxHp:2000,attackIndex:25,masteryStage:3})
    const events8=raidAttackSkillEvents({...stage3,attackIndex:8,result:at8})
    const events25=raidAttackSkillEvents({...stage3,attackIndex:25,result:at25})
    assert.ok(events8.length>=1,id+' especial na oitava')
    assert.ok(events25.length>=1,id+' especial no 25º')
    assert.ok(events8.every(n=>typeof n==='string'&&n.length>0))
    assert.match(formatRaidSkillLine({activeHeroId:id,skillActivations:{[events8[0]]:1}}),/⚡ \*[^:]+:\*/ )
  }
})

test('heróis sem maestria necessária não exibem habilidades não desbloqueadas',()=>{
  for(const hero of PECADOS_HEROES){
    if(hero.species==='pecado_ban')continue // Imortalidade é a passiva de estágio I
    const x=heroAttack({heroId:hero.species,attackIndex:8,masteryStage:1,damage:900})
    assert.deepEqual(raidAttackSkillEvents({heroId:hero.species,attackIndex:8,masteryStage:1,result:x}),[])
  }
})

test('classes regulares registram gatilhos sem depender de herói',()=>{
  const cases=[
    {id:'warrior',stage:3,index:4,critical:false,hp:900,prev:{},expected:'Ímpeto de Guerra'},
    {id:'assassin',stage:3,index:5,critical:false,hp:900,prev:{finisherReady:true},expected:'Execução'},
    {id:'mage',stage:2,index:8,critical:false,hp:900,prev:{},expected:'Explosão'},
    {id:'archer',stage:2,index:6,critical:false,hp:900,prev:{},expected:'Flecha Perfurante'},
    {id:'paladin',stage:2,index:8,critical:false,hp:900,prev:{},expected:'Julgamento Divino'},
    {id:'berserker',stage:2,index:1,critical:false,hp:200,prev:{},expected:'Fúria de Sangue'},
    {id:'monk',stage:2,index:2,critical:false,hp:900,prev:{counterReady:true},expected:'Contra-ataque'},
    {id:'necromancer',stage:2,index:7,critical:false,hp:900,prev:{},expected:'Maldição'},
    {id:'druid',stage:0,index:12,critical:false,hp:600,prev:{},expected:'Natureza Viva'},
    {id:'samurai',stage:3,index:4,critical:true,hp:900,prev:{samuraiFocus:4},expected:'Lâmina Perfeita'}
  ]
  assert.equal(cases.length,Object.keys(PLAYER_CLASSES).length)
  for(const {id,stage,index,critical,hp,prev,expected} of cases){
    const result=classAttack({classId:id,applied:true,awakeningStage:stage,attackIndex:index,critical,hp,maxHp:1000,awakeningState:prev,roll:1,damage:1000,context:'raid'})
    const events=raidAttackSkillEvents({classId:id,classApplied:true,awakeningStage:stage,attackIndex:index,critical,hp,maxHp:1000,previousState:prev,result})
    assert.ok(events.includes(expected),id+': '+events.join(','))
  }
})

test('eventos defensivos são contados apenas ao acontecer',()=>{
  const monk=classDefense({classId:'monk',applied:true,roll:0,hp:900,maxHp:1000,context:'raid',damage:1000,awakeningStage:2})
  assert.deepEqual(raidDefenseSkillEvents({classId:'monk',classApplied:true,awakeningStage:2,result:monk}),['Reflexos Supremos'])
  assert.deepEqual(raidDefenseSkillEvents({classId:'monk',classApplied:false,result:monk}),[])
  const pala=classDefense({classId:'paladin',applied:true,hp:200,maxHp:1000,damage:800,context:'raid',awakeningStage:5})
  assert.ok(raidDefenseSkillEvents({classId:'paladin',classApplied:true,awakeningStage:5,result:pala}).includes('Intervenção Divina'))
})

test('boletim tem exatamente uma linha por jogador e máximo 3 técnicas',()=>{
  const ban=formatRaidSkillLine({activeHeroId:'pecado_ban',playerClassId:'paladin',
    skillActivations:{Imortalidade:18,Snatch:18,'Hunter Fest':6}})
  assert.equal(ban.split('\n').filter(Boolean).length,1)
  assert.match(ban,/Ban:/)
  assert.doesNotMatch(ban,/Paladino|Bênção Restauradora/)
  const samurai=formatRaidSkillLine({playerClassId:'samurai',playerClassApplied:true,
    skillActivations:{'Lâmina Perfeita':10,'Postura Iai':3,'Corte da Lua':1,'Defesa':2}})
  assert.match(samurai,/Samurai:/)
  assert.match(samurai,/\+1 outros/)
  assert.equal(samurai.split('\n').filter(Boolean).length,1)
  assert.match(formatRaidSkillLine({playerClassId:'berserker',playerClassApplied:true}),/Berserker:.*nenhum gatilho especial/)
  assert.match(formatRaidSkillLine({activeHeroId:'pecado_king'}),/King:.*nenhum gatilho especial/)
  assert.equal(incrementRaidSkillCounts({Imortalidade:2},['Imortalidade','Snatch']).Imortalidade,3)
  assert.match(formatRaidSkillLine({activeHeroId:'pecado_ban',skillActivations:{Snatch:2},skillTrackingPartial:true}),/contagem parcial/)
})
