import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8')
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8')
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8')

test('todos os sete herois possuem retratos correspondentes, sem sprites do Paladino',()=>{
  const portraits={pecado_meliodas:'chara01',pecado_diane:'chara04',
    pecado_ban:'chara05',pecado_king:'chara06',pecado_gowther:'chara07',
    pecado_merlin:'chara08',pecado_escanor:'chara09'}
  for(const [hero,portrait] of Object.entries(portraits)){
    assert.ok(app.includes(hero+":{name:"),hero)
    assert.ok(app.includes("portrait:'"+portrait+"'"),hero)
  }
  assert.match(app,/tv-tokyo\.co\.jp\/anime\/7-taizai_funnu\/images\/chara\//)
  assert.match(app,/function characterVisual\(ch,className\)/)
  assert.match(app,/characterVisual\(ch,'combat-character-art'\)/)
  assert.match(app,/characterVisual\(mine,'duel-character-svg'\)/)
})

test('ficha e seleção usam heroi ativo, classe salva e progressao real',()=>{
  const picked=app.slice(app.indexOf('function selectedCharacter(){'),app.indexOf('function classRule('))
  assert.match(picked,/activePlayableHero\(\)/)
  assert.match(picked,/selectedClassCharacter\(\)/)
  const heroCards=app.slice(app.indexOf('function renderPlayableHeroes(){'),app.indexOf('function renderCharacter(){'))
  assert.match(heroCards,/characterVisual\(character,'character-official-art'\)/)
  assert.match(heroCards,/h\.petLevel/)
  assert.match(heroCards,/h\.masteryStage/)
  const character=app.slice(app.indexOf('function renderCharacter(){'),app.indexOf('function renderPets(){'))
  assert.match(character,/const activeHero=activePlayableHero\(\)/)
  assert.match(character,/const selected=selectedClassCharacter\(\)/)
  assert.match(character,/collab-current-hero/)
  assert.match(character,/const active=!activeHero&&applied&&ch\.id===selected\.id/)
  assert.match(character,/const saved=Boolean\(activeHero&&applied&&ch\.id===selected\.id\)/)
  assert.match(character,/Classe preservada/)
  assert.match(app,/collab-home-active/)
})

test('atributos do heroi vêm do servidor autoritativo, nunca da classe simulada no cliente',()=>{
  assert.match(api,/getPlayableHeroCombatSheet/)
  assert.match(api,/activeHeroCombat=heroes\.some/)
  assert.match(api,/profile,combatProfile,activeHeroCombat,inventory/)
  assert.match(app,/ui\.data\?\.activeHeroCombat/)
  assert.match(app,/effective_atk:hero\.atk/)
  assert.match(app,/effective_def:hero\.def/)
  assert.match(app,/effective_spd:hero\.spd/)
})

test('retratos responsivos e PWA com cache renovado',()=>{
  assert.match(css,/collab-hero-portrait/)
  assert.match(css,/collab-current-hero/)
  assert.match(css,/collab-hero-card-art/)
  assert.match(html,/\/app\.js\?v=20261028-seven-sins-web-v1/)
  assert.match(html,/\/styles\.css\?v=20261028-seven-sins-web-v1/)
  assert.match(sw,/alpha-rpg-pwa-20261028-seven-sins-web-v1/)
})
