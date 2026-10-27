import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PET_TEAM_WILDCARD_SPECIES,resolveCollabWildcardTeam} from '../src/neon/pet-astral-wildcard.js'
import {PECADOS_HERO_IDS,pecadosBonus} from '../src/neon/sete-pecados-catalog.js'
import {PET_STATUS_SPECIALTIES,petSpecialtyStats,petCombatSpecialty} from '../src/neon/game-catalog.js'

const group={id:'sete-pecados',label:'7 Pecados Capitais',species:PECADOS_HERO_IDS}
const match=(ids,groups=[group])=>resolveCollabWildcardTeam(ids,groups)

test('full collab permanece mais forte que os times com coringa',()=>{
  const full=match(PECADOS_HERO_IDS.slice(0,3))
  assert.equal(full.full,true)
  assert.equal(full.attack,pecadosBonus(3))
  assert.equal(full.crit,.05)
  assert.equal(full.wildcardCount,0)
})

test('cada pet Coringa cadastrado completa 2 heróis da mesma collab',()=>{
  assert.equal(PET_TEAM_WILDCARD_SPECIES.length,5)
  for(const wildcard of PET_TEAM_WILDCARD_SPECIES){
    const result=match([PECADOS_HERO_IDS[0],PECADOS_HERO_IDS[1],wildcard])
    assert.equal(result?.attack,.12,wildcard)
    assert.equal(result?.crit,.03,wildcard)
    assert.equal(result?.heroesCount,2,wildcard)
    assert.equal(result?.wildcardCount,1,wildcard)
    assert.equal(result?.full,false,wildcard)
  }
})

test('todos os pares distintos de Coringas completam 1 herói sem virar Full Collab',()=>{
  for(let a=0;a<PET_TEAM_WILDCARD_SPECIES.length;a++){
    for(let b=a+1;b<PET_TEAM_WILDCARD_SPECIES.length;b++){
      const result=match([PECADOS_HERO_IDS[0],PET_TEAM_WILDCARD_SPECIES[a],PET_TEAM_WILDCARD_SPECIES[b]])
      assert.equal(result?.attack,.06)
      assert.equal(result?.crit,.01)
      assert.equal(result?.heroesCount,1)
      assert.equal(result?.wildcardCount,2)
    }
  }
})

test('não concede collab só com Coringas ou quando há pets duplicados',()=>{
  assert.equal(match(PET_TEAM_WILDCARD_SPECIES.slice(0,3)),null)
  assert.equal(match([PECADOS_HERO_IDS[0],PECADOS_HERO_IDS[0],PET_TEAM_WILDCARD_SPECIES[0]]),null)
  assert.equal(match([PECADOS_HERO_IDS[0],PET_TEAM_WILDCARD_SPECIES[0],PET_TEAM_WILDCARD_SPECIES[0]]),null)
  assert.equal(match([PECADOS_HERO_IDS[0],PECADOS_HERO_IDS[1],'raposa_astral']),null)
})

test('não mistura heróis de collabs diferentes nem empilha grupos ambíguos',()=>{
  const other={id:'outra-collab',label:'Outra Collab',species:['heroi_outro_1','heroi_outro_2','heroi_outro_3']}
  assert.equal(match([PECADOS_HERO_IDS[0],'heroi_outro_1',PET_TEAM_WILDCARD_SPECIES[0]],[group,other]),null)
  assert.equal(match([PECADOS_HERO_IDS[0],PECADOS_HERO_IDS[1],PET_TEAM_WILDCARD_SPECIES[0]],[group,{...group,id:'duplicado'}]),null)
  assert.equal(match(['heroi_outro_1','heroi_outro_2',PET_TEAM_WILDCARD_SPECIES[0]],[group,other])?.attack,.12)
})

test('integração está conectada à rotina de sinergia sem afetar inventário',async()=>{
  const source=await readFile(new URL('../src/neon/db.js',import.meta.url),'utf8')
  assert.match(source,/resolveCollabWildcardTeam\(species,PET_COLLAB_TEAM_GROUPS\)/)
  assert.match(source,/collabAttack:Number\(collab\?\.attack\|\|0\)/)
  assert.match(source,/collabCrit:Number\(collab\?\.crit\|\|0\)/)
  assert.doesNotMatch(source,/species\.includes\('guaxinim_errante_20261027'\)/)
})

test('bônus próprios do Guaxinim Errante são ataque e crítico, sem defesa/esquiva',()=>{
  const stats=petSpecialtyStats('guaxinim_errante_20261027')
  assert.deepEqual(stats,{damage:5,crit:4})
  const specialty=PET_STATUS_SPECIALTIES.guaxinim_errante_20261027
  assert.equal(specialty.raid,true)
  assert.match(specialty.label,/Coringa/)
  assert.equal(petCombatSpecialty('guaxinim_errante_20261027').damage,.05)
  assert.equal(petCombatSpecialty('guaxinim_errante_20261027').crit,.04)
  assert.equal(petCombatSpecialty('guaxinim_errante_20261027').defense,0)
  assert.equal(petCombatSpecialty('guaxinim_errante_20261027').dodge,0)
})
