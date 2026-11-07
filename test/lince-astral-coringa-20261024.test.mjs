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
  assert.equal(petStyleLabel('raposa_astral'),'🃏 Coringa')
  assert.match(petHpType('raposa_astral'),/Coringa/)
  const {label:lx,...lince}=petCombatSpecialty('lince_astral')
  const {label:fx,...fox}=petCombatSpecialty('raposa_astral')
  assert.deepEqual(lince,fox)
})
test('Lince completa categoria predador em qualquer slot com 2/3 do bônus',()=>{
  const variants=[
    team('lince_astral','leao_solar','pantera_vulcanica'),
    team('leao_solar','lince_astral','pantera_vulcanica'),
    team('leao_solar','pantera_vulcanica','lince_astral')
  ]
  for(const pets of variants){
    const s=petTeamSynergy(pets)
    assert.equal(s.style,'predador')
    assert.match(s.label,/Caçada Coordenada.*2\/3/)
    near(s.attack,.02*2/3);near(s.crit,.02*2/3);near(s.defense,0);near(s.speed,0)
    assert.match(s.text,/Sinergia parcial 2\/3/)
  }
})
test('Completa cada categoria com bônus proporcional, inclusive os Vitais',()=>{
  const specs=[
    [['fenix_alpha','grifo_celestial'], 'voador', .02,0,0,8,0,0],
    [['guardiao_caos','colosso_alpha'],'guardiao',0,.04,0,0,0,0],
    [['serpente_cosmica','oraculo_alpha'],'mistico',0,.02,.025,0,0,0],
    [['leao_solar','pantera_vulcanica'],'predador',.02,0,.02,0,0,0],
    [['leviata_eternidade','cervo_aurora_viva'],'vital',0,.02,0,0,.08,.05]
  ]
  for(const [[a,b],style,attack,defense,crit,speed,hp,vitalPulse] of specs){
    const s=petTeamSynergy(team(a,b,'lince_astral'))
    assert.equal(s.style,style)
    near(s.attack,attack*2/3);near(s.defense,defense*2/3)
    near(s.crit,crit*2/3);near(s.speed,speed*2/3)
    near(s.hp,hp*2/3);near(s.vitalPulse,vitalPulse*2/3)
    assert.match(s.text,/Sinergia parcial 2\/3/)
  }
})
test('Dois Coringas e um pet de estilo reconhecido concedem somente 1/3',()=>{
  for(const [pet,style,attack,defense,crit,speed,hp,vitalPulse] of [
    ['fenix_alpha','voador',.02,0,0,8,0,0],
    ['guardiao_caos','guardiao',0,.04,0,0,0,0],
    ['leao_solar','predador',.02,0,.02,0,0,0],
    ['oraculo_alpha','mistico',0,.02,.025,0,0,0],
    ['leviata_eternidade','vital',0,.02,0,0,.08,.05]
  ]){
    const s=petTeamSynergy(team('lince_astral',pet,'camaleao_lendario'))
    assert.equal(s.style,style)
    near(s.attack,attack/3);near(s.defense,defense/3)
    near(s.crit,crit/3);near(s.speed,speed/3)
    near(s.hp,hp/3);near(s.vitalPulse,vitalPulse/3)
    assert.match(s.label,/1\/3/)
  }
})
test('Estilos misturados não recebem Elo Universal nem qualquer sinergia',()=>{
  for(const pets of [
    team('lince_astral','leao_solar','fenix_alpha'),
    team('fenix_alpha','leao_solar','lince_astral'),
    team('leao_solar','lince_astral','fenix_alpha'),
    team('lince_astral','leviata_eternidade','fenix_alpha'),
    team('lince_astral','guaxinim_errante_20261027','camaleao_lendario')
  ])assert.equal(petTeamSynergy(pets),null)
})
test('Todos os Coringas registrados completam dois originais ou formam pares com um',()=>{
  const coringas=['morcego_madrugada','camaleao_lendario','lince_astral','raposa_astral','onca_eclipse_20261026','guaxinim_errante_20261027']
  for(const coringa of coringas){
    const x=petTeamSynergy(team('fenix_alpha','grifo_celestial',coringa))
    near(x.attack,.02*2/3)
    assert.match(x.label,/2\/3/)
  }
  for(let i=0;i<coringas.length;i++)for(let j=i+1;j<coringas.length;j++){
    const x=petTeamSynergy(team('fenix_alpha',coringas[i],coringas[j]))
    near(x.attack,.02/3)
    assert.match(x.label,/1\/3/)
  }
})
test('Raposa Astral e Onça do Eclipse completam exatamente 1/3 do Voador',()=>{
  const formation=team('fenix_alpha','onca_eclipse_20261026','raposa_astral')
  const synergy=petTeamSynergy(formation)
  assert.equal(synergy.style,'voador')
  assert.match(synergy.label,/Esquadrão Aéreo.*1\/3/)
  assert.doesNotMatch(synergy.label,/Elo Universal/)
  near(synergy.attack,.02/3)
  near(synergy.speed,8/3)
  near(synergy.defense,0)
  near(synergy.crit,0)
  assert.match(synergy.text,/Sinergia parcial 1\/3/)
})
test('Raposa Astral respeita categorias mistas e não concede sinergia extra',()=>{
  assert.equal(petTeamSynergy(team('raposa_astral','fenix_alpha','leviata_eternidade')),null)
  const x=petTeamSynergy(team('raposa_astral','lince_astral','oraculo_alpha'))
  assert.equal(x.style,'mistico')
  near(x.defense,.02/3)
  near(x.crit,.025/3)
  assert.match(x.label,/1\/3/)
  assert.equal(petTeamSynergy(team('raposa_astral','lince_astral','onca_eclipse_20261026')),null)
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
test('Resolver puro recusa estilos mistos, repetições e Coringas sem original',()=>{
  assert.equal(resolveAstralLynxWildcard(['leao_solar','lince_astral','fenix_alpha'],['predador',null,'voador']),null)
  assert.deepEqual(resolveAstralLynxWildcard(['lince_astral','leao_solar','pantera_vulcanica'],[null,'predador','predador']),{style:'predador',universal:false,originalCount:2,wildcardCount:1})
  assert.deepEqual(resolveAstralLynxWildcard(['lince_astral','camaleao_lendario','fenix_alpha'],[null,null,'voador']),{style:'voador',universal:false,originalCount:1,wildcardCount:2})
  assert.equal(resolveAstralLynxWildcard(['lince_astral','camaleao_lendario','guaxinim_errante_20261027'],[null,null,null]),null)
  assert.equal(resolveAstralLynxWildcard(['leao_solar','leao_solar','lince_astral'],['predador','predador',null]),null)
  assert.equal(resolveAstralLynxWildcard(['leao_solar','fenix_alpha','raposa_astral'],['predador','voador',null]),null)
})
