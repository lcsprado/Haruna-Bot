import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {resolveAstralLynxWildcard} from '../src/neon/pet-astral-wildcard.js'
import {petCombatSpecialty} from '../src/neon/game-catalog.js'

// Os cálculos de sinergia não fazem consultas ao banco; use URI sem servidor.
process.env.DATABASE_URL ||= 'postgres://not-used:not-used@127.0.0.1:5432/alpha_test'
const {petTeamSynergy,petStyleLabel,petHpType,db}=await import('../src/neon/db.js')
after(async()=>{await db.end()})
const team=(...species)=>species.map(s=>({species:s}))
const eps=1e-10
const near=(a,b)=>assert.ok(Math.abs(a-b)<eps,`Expected ${b}, got ${a}`)

test('Lince é anunciado coringa e conserva os bônus individuais de Raposa Astral',()=>{
  assert.equal(petStyleLabel('lince_astral'),'🃏 Coringa')
  assert.match(petHpType('lince_astral'),/Coringa/)
  const {label:lx,...lince}=petCombatSpecialty('lince_astral')
  const {label:fx,...fox}=petCombatSpecialty('raposa_astral')
  assert.deepEqual(lince,fox)
})
test('Lince completa categoria predador em qualquer slot, sem bônus adicional',()=>{
  const variants=[
    team('lince_astral','leao_solar','pantera_vulcanica'),
    team('leao_solar','lince_astral','pantera_vulcanica'),
    team('leao_solar','pantera_vulcanica','lince_astral')
  ]
  for(const pets of variants){
    const s=petTeamSynergy(pets)
    assert.equal(s.style,'predador')
    assert.match(s.label,/Caçada Coordenada/)
    near(s.attack,.02);near(s.crit,.02);near(s.defense,0);near(s.speed,0)
  }
})
test('Completa as demais categorias com mesmo bônus anterior',()=>{
  const specs=[
    [['fenix_alpha','grifo_celestial'], 'voador', .02,0,0,8],
    [['guardiao_caos','colosso_alpha'],'guardiao',0,.04,0,0],
    [['serpente_cosmica','oraculo_alpha'],'mistico',0,.02,.025,0]
  ]
  for(const [[a,b],style,attack,defense,crit,speed] of specs){
    const s=petTeamSynergy(team(a,b,'lince_astral'))
    assert.equal(s.style,style)
    near(s.attack,attack);near(s.defense,defense);near(s.crit,crit);near(s.speed,speed)
  }
})
test('Qualquer dupla mista ativa apenas Elo Universal, sem acumular duas sinergias',()=>{
  const variants=[
    team('lince_astral','leao_solar','fenix_alpha'),
    team('fenix_alpha','leao_solar','lince_astral'),
    team('leao_solar','lince_astral','fenix_alpha'),
    team('lince_astral','raposa_astral','oraculo_alpha'),
    team('lince_astral','camaleao_lendario','fenix_alpha')
  ]
  for(const pets of variants){
    const s=petTeamSynergy(pets)
    assert.equal(s.style,'coringa')
    assert.equal(s.label,'🃏 Elo Universal')
    near(s.attack,.015);near(s.defense,.02);near(s.crit,0);near(s.speed,0)
  }
})
test('Sem sinergia de equipe com 1/2 pets ou espécies repetidas',()=>{
  assert.equal(petTeamSynergy(team('lince_astral')),null)
  assert.equal(petTeamSynergy(team('lince_astral','leao_solar')),null)
  assert.equal(petTeamSynergy(team('lince_astral','leao_solar','leao_solar')),null)
})
test('Coringas anteriores preservam as regras e trio sem Lince não muda',()=>{
  const bat=petTeamSynergy(team('morcego_madrugada','leao_solar','pantera_vulcanica'))
  assert.equal(bat.style,'predador')
  assert.equal(petTeamSynergy(team('morcego_madrugada','leao_solar','fenix_alpha')),null)
  const standard=petTeamSynergy(team('leao_solar','pantera_vulcanica','fera_caos'))
  near(standard.attack,.02)
  near(standard.crit,.02)
})
test('Resolver puro não ignora ordem, duplicatas ou ausência do Lince',()=>{
  assert.deepEqual(resolveAstralLynxWildcard(['leao_solar','lince_astral','fenix_alpha'],['predador',null,'voador']),{style:'coringa',universal:true})
  assert.deepEqual(resolveAstralLynxWildcard(['lince_astral','leao_solar','pantera_vulcanica'],[null,'predador','predador']),{style:'predador',universal:false})
  assert.equal(resolveAstralLynxWildcard(['leao_solar','leao_solar','lince_astral'],['predador','predador',null]),null)
  assert.equal(resolveAstralLynxWildcard(['leao_solar','fenix_alpha','raposa_astral'],['predador','voador',null]),null)
})
