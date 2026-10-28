import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PECADOS_HEROES,PECADOS_HERO_IDS,pecadosBonus} from '../src/neon/sete-pecados-catalog.js'

// Execute a production snapshot of the pure synergy function without opening a DB connection.
const dbSource=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const gamesSource=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
function take(start,end){
  const a=dbSource.indexOf(start),b=dbSource.indexOf(end,a)
  assert.ok(a>=0&&b>a,'Bloco de cálculo da sinergia não localizado: '+start)
  return dbSource.slice(a,b)
}
const endOfStyles=dbSource.includes('const PET_TEAM_WILDCARD_BONUS=')?'const PET_TEAM_WILDCARD_BONUS=':'const PET_TEAM_STYLE_BONUS='
const speciesStyles=new Function('PECADOS_HEROES',take('const PET_TEAM_STYLE_BY_SPECIES=',endOfStyles)+'\nreturn PET_TEAM_STYLE_BY_SPECIES')(PECADOS_HEROES)
const styleBonuses=new Function(take('const PET_TEAM_STYLE_BONUS=','function resolveBatTeamStyles(')+'\nreturn PET_TEAM_STYLE_BONUS')()
const resolveBatTeamStyles=new Function('PET_TEAM_STYLE_BY_SPECIES',take('function resolveBatTeamStyles(','export function petStyleLabel(')+'\nreturn resolveBatTeamStyles')(speciesStyles)
const petTeamSynergy=new Function(
  'PECADOS_HERO_IDS','pecadosBonus','PET_TEAM_STYLE_BY_SPECIES','PET_TEAM_STYLE_BONUS','PET_TEAM_WILDCARD_BONUS','resolveBatTeamStyles','resolveAstralLynxWildcard','resolveCollabWildcardTeam','PET_COLLAB_TEAM_GROUPS',
  take('export function petTeamSynergy(pets=[])','export const LEGENDARY_PET_SUMMONS=').replace(/^export /,'')+'\nreturn petTeamSynergy'
)(PECADOS_HERO_IDS,pecadosBonus,speciesStyles,styleBonuses,{},resolveBatTeamStyles,()=>null,()=>null,[])
const pet=(species)=>({species})
const team=(...species)=>species.map(pet)

test('Escanor + Avatar Primordial + Fênix do Eclipse não possuem sinergia',()=>{
  assert.equal(petTeamSynergy(team('pecado_escanor','avatar_primordial','fenix_eclipse')),null)
})
test('Um ou dois heróis da collab não ativam nem dano nem rótulo especial',()=>{
  assert.equal(pecadosBonus(0),0)
  assert.equal(pecadosBonus(1),0)
  assert.equal(pecadosBonus(2),0)
  assert.equal(pecadosBonus(3),.20)
  assert.equal(petTeamSynergy(team('pecado_escanor')),null)
  assert.equal(petTeamSynergy(team('pecado_escanor','pecado_ban')),null)
})
test('dois Pecados e um pet comum não completam sinergia de pets',()=>{
  assert.equal(petTeamSynergy(team('pecado_escanor','pecado_ban','leao_solar')),null)
})
test('três Pecados não podem formar equipe pet nem receber bônus da collab',()=>{
  assert.equal(petTeamSynergy(team('pecado_escanor','pecado_ban','pecado_meliodas')),null)
})
test('três Pecados de estilos diferentes também não formam time pet',()=>{
  assert.equal(petTeamSynergy(team('pecado_escanor','pecado_king','pecado_merlin')),null)
})
test('Três voadores comuns mantêm o bônus de estilo',()=>{
  const result=petTeamSynergy(team('fenix_eclipse','fenix_celestial','dragao_corrompido'))
  assert.equal(result.label,'🪽 Esquadrão Aéreo')
  assert.equal(result.attack,.02)
  assert.equal(result.speed,8)
  assert.equal(result.collabCount,0)
})
test('Nenhuma vantagem especial deve ser liberada para espécies duplicadas',()=>{
  assert.equal(petTeamSynergy(team('pecado_escanor','pecado_ban','pecado_ban')),null)
})
test('Raid filtra Pecados de partidas já abertas e recalcula sinergia somente de pets',()=>{
  assert.match(gamesSource,/p\.teamPassives=\(p\.teamPassives\|\|\[\]\)\.filter/)
  assert.match(gamesSource,/PECADOS_HERO_IDS\.includes\(String\(p\.pet\?\.species\|\|''\)\)/)
  assert.match(gamesSource,/const baseTeamSynergy=petTeamSynergy\(p\.teamPassives\|\|\[\]\)/)
  assert.doesNotMatch(gamesSource,/const teamSynergy=p\.teamSynergy\|\|\{/)
})
