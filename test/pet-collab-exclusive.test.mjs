import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {PECADOS_HERO_IDS} from '../src/neon/sete-pecados-catalog.js'
import {resolveCollabWildcardTeam,resolveAstralLynxWildcard} from '../src/neon/pet-astral-wildcard.js'

const dbText=await readFile(new URL('../src/neon/db.js',import.meta.url),'utf8')
const begin=dbText.indexOf('export function petTeamSynergy(pets=[]){')
const end=dbText.indexOf('export const LEGENDARY_PET_SUMMONS=[',begin)
assert.ok(begin>=0&&end>begin,'trecho de sinergia não encontrado')
const implementation=dbText.slice(begin,end).replace('export function petTeamSynergy','function petTeamSynergy')
const styles={
  pecado_diane:'guardiao',pecado_king:'guardiao',
  pecado_ban:'predador',pecado_meliodas:'predador',
  fenix_celestial:'voador',grifo_celestial:'voador',
  dragao_corrompido:'voador',golem_ancestral:'guardiao',
  leao_solar:'predador'
}
const teamSynergy=runInNewContext(implementation+'\npetTeamSynergy',{
  PET_COLLAB_TEAM_GROUPS:[{id:'sete-pecados',label:'7 Pecados Capitais',species:PECADOS_HERO_IDS}],
  resolveCollabWildcardTeam,resolveAstralLynxWildcard,
  resolveBatTeamStyles: species=>species.map(id=>styles[id]||null),
  PET_TEAM_WILDCARD_BONUS:{attack:.015,defense:.02,crit:0,speed:0,label:'🃏 Elo Universal',text:'+1,5% ATK e +2% DEF'},
  PET_TEAM_STYLE_BONUS:{
    guardiao:{attack:0,defense:.04,crit:0,speed:0,label:'Muralha Viva',text:'+4% DEF'},
    voador:{attack:.02,defense:0,crit:0,speed:8,label:'Esquadrão Aéreo',text:'+8 VEL e +2% ATK'},
    predador:{attack:.02,defense:0,crit:.02,speed:0,label:'Caçada Coordenada',text:'+2% ATK e +2% CRIT'}
  }
})
const team=(...species)=>teamSynergy(species.map(id=>({species:id})))

test('2 Pecados + Guaxinim: apenas sinergia de Collab, sem Elo Universal',()=>{
  const x=team('guaxinim_errante_20261027','pecado_diane','pecado_ban')
  assert.equal(x.attack,.12)
  assert.equal(x.crit,.03)
  assert.equal(x.defense,0)
  assert.equal(x.speed,0)
  assert.equal(x.collabAttack,.12)
  assert.equal(x.collabCrit,.03)
  assert.equal(x.collabAssist,true)
  assert.match(x.label,/Elo de Collab/)
  assert.doesNotMatch(x.label,/Elo Universal|Muralha Viva|Caçada Coordenada/)
  assert.doesNotMatch(x.text,/Elo Universal|1,5%|2% DEF/)
})

test('1 Pecado + 2 Coringas: aplica somente benefício menor',()=>{
  const x=team('pecado_diane','guaxinim_errante_20261027','lince_astral')
  assert.equal(x.attack,.06)
  assert.equal(x.crit,.01)
  assert.equal(x.defense,0)
  assert.equal(x.collabAssist,true)
  assert.doesNotMatch(x.label,/Elo Universal/)
})

test('3 Pecados: Full Collab permanece exclusiva, sem bônus de estilo',()=>{
  const x=team('pecado_meliodas','pecado_ban','pecado_diane')
  assert.equal(x.attack,.20)
  assert.equal(x.crit,.05)
  assert.equal(x.defense,0)
  assert.equal(x.collabCount,3)
  assert.match(x.label,/Full Collab/)
})

test('dois voadores + coringa continuam recebendo sinergia normal fora de Collab',()=>{
  const x=team('grifo_celestial','fenix_celestial','guaxinim_errante_20261027')
  assert.equal(x.attack,.02)
  assert.equal(x.speed,8)
  assert.equal(x.collabAttack,0)
  assert.match(x.label,/Esquadrão Aéreo/)
})

test('dupla de estilos diferentes + coringa mantém apenas Elo Universal',()=>{
  const x=team('pecado_diane','fenix_celestial','guaxinim_errante_20261027')
  assert.equal(x.attack,.015)
  assert.equal(x.defense,.02)
  assert.equal(x.collabAttack,0)
  assert.match(x.label,/Elo Universal/)
  assert.doesNotMatch(x.label,/Collab/)
})

test('espécies duplicadas não ativam sinergia',()=>{
  assert.equal(team('pecado_diane','pecado_diane','guaxinim_errante_20261027'),null)
})
