import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {PECADOS_HERO_IDS} from '../src/neon/sete-pecados-catalog.js'
import {resolveCollabWildcardTeam,resolveAstralLynxWildcard} from '../src/neon/pet-astral-wildcard.js'

const src=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const first=src.indexOf('export function petTeamSynergy(pets=[]){')
const last=src.indexOf('export const LEGENDARY_PET_SUMMONS=[',first)
assert.ok(first>0&&last>first)
const js=src.slice(first,last).replace('export function petTeamSynergy','function petTeamSynergy')
const styles={fenix_celestial:'voador',grifo_celestial:'voador',dragao_corrompido:'voador',golem_ancestral:'guardiao',leao_solar:'predador'}
const synergy=runInNewContext(js+'\npetTeamSynergy',{
  PECADOS_HERO_IDS,
  PET_COLLAB_TEAM_GROUPS:[{id:'sete-pecados',label:'7 Pecados Capitais',species:PECADOS_HERO_IDS}],
  resolveCollabWildcardTeam,resolveAstralLynxWildcard,
  resolveBatTeamStyles:species=>species.map(s=>styles[s]||null),
  PET_TEAM_WILDCARD_BONUS:{attack:.015,defense:.02,crit:0,speed:0,label:'Elo Universal',text:'Elo Universal'},
  PET_TEAM_STYLE_BONUS:{voador:{attack:.02,defense:0,crit:0,speed:8,label:'Esquadrão Aéreo',text:'Voador'},guardiao:{attack:0,defense:.04,crit:0,speed:0,label:'Muralha Viva',text:'Guardião'}}
})
const team=(...ids)=>synergy(ids.map(species=>({species})))

test('Pecados migrados nunca reativam bônus como pets',()=>{
  assert.equal(team('pecado_diane','pecado_ban','guaxinim_errante_20261027'),null)
  assert.equal(team('pecado_meliodas','pecado_ban','pecado_diane'),null)
  assert.equal(team('pecado_diane','fenix_celestial','guaxinim_errante_20261027'),null)
})

test('Guaxinim preserva sinergia comum sem bônus duplo',()=>{
  const x=team('fenix_celestial','grifo_celestial','guaxinim_errante_20261027')
  assert.equal(x.attack,.02)
  assert.equal(x.speed,8)
  assert.equal(x.collabAttack,0)
  assert.equal(x.collabCrit,0)
  assert.match(x.label,/Esquadrão Aéreo/)
  assert.doesNotMatch(x.label,/Collab|Universal/)
})

test('Elo Universal substitui e não acumula sinergias incompatíveis',()=>{
  const x=team('fenix_celestial','golem_ancestral','guaxinim_errante_20261027')
  assert.equal(x.attack,.015)
  assert.equal(x.defense,.02)
  assert.equal(x.collabAttack,0)
  assert.match(x.label,/Elo Universal/)
})

test('Não concede bônus para espécies duplicadas',()=>{
  assert.equal(team('fenix_celestial','fenix_celestial','guaxinim_errante_20261027'),null)
})
