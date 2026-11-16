import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8')
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8')
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8')

test('sete heróis mantêm retratos individuais no atlas WebP, sem links externos ou Paladino',()=>{
 const portraits={pecado_meliodas:'chara01',pecado_diane:'chara04',
   pecado_ban:'chara05',pecado_king:'chara06',pecado_gowther:'chara07',
   pecado_merlin:'chara08',pecado_escanor:'chara09'}
 for(const [hero,portrait] of Object.entries(portraits)){
   assert.ok(app.includes(hero+':{name:'),hero)
   assert.ok(app.includes("portrait:'"+portrait+"'"),hero)
 }
 assert.match(app,/function characterVisual\(ch,className\)/)
 assert.ok(app.includes("return petCroppedSprite(ch.id,(className||'')+' collab-modern-portrait',ch.name)"))
 assert.ok(!app.includes('tv-tokyo.co.jp/anime/7-taizai_funnu/images/chara/'),'não voltar a URLs externas quebradas')
 assert.match(app,/characterVisual\(character,'character-official-art'\)/)
 assert.match(app,/duelFighterPortrait\(mine\)/)
})

test('herói ativo e classe salva permanecem separados na Web e na seleção',()=>{
 const selected=app.slice(app.indexOf('function selectedCharacter(){'),app.indexOf('function classRule('))
 assert.match(selected,/ui\.data\.combatProfile\.class_applied/)
 assert.match(selected,/ui\.data\.combatProfile\.class_id/)
 const heroes=app.slice(app.indexOf('function renderPlayableHeroes(){'),app.indexOf('const PET_TEAM_SLOT_LABELS=',app.indexOf('function renderPlayableHeroes(){')))
 assert.match(heroes,/const active=activePlayableHero\(\)/)
 assert.match(heroes,/h\.petLevel/)
 assert.match(heroes,/h\.masteryStage/)
 assert.match(heroes,/data-character-select/)
 const character=app.slice(app.indexOf('function renderCharacter(){'),app.indexOf('function renderPlayableHeroes(){'))
 assert.match(character,/const selected=selectedCharacter\(\)/)
 assert.match(character,/const activeHero=activePlayableHero\(\)/)
 assert.match(character,/const locked=Boolean\(activeHero\)/)
 assert.match(character,/collab-current-hero/)
 assert.match(character,/preservada enquanto o herói combate/)
})

test('servidor fornece atributos reais do herói e arena usa perfil efetivo do backend',()=>{
 assert.match(api,/const activeHeroCombat=heroes\.some\(hero=>hero\.active\)/)
 assert.match(api,/getPlayableHeroCombatSheet\(jid,combatProfile\)/)
 assert.match(api,/profile,combatProfile,activeHeroCombat,inventory/)
 assert.match(app,/const hero=activePlayableHero\(\)/)
 assert.match(app,/const myCombat=profile\(\)/)
 assert.match(app,/myCombat\.effective_atk/)
 assert.match(app,/myCombat\.effective_def/)
 assert.match(app,/myCombat\.effective_spd/)
 assert.doesNotMatch(app,/effective_atk:hero\.atk/,'não simular stats do herói no navegador')
})

test('retratos responsivos e cache Web atual sem recuperar aba NPC antiga',()=>{
 assert.match(css,/collab-modern-portrait/)
 assert.match(css,/collab-current-hero/)
 assert.match(css,/collab-hero-card-art/)
 assert.match(css,/@media\(max-width:610px\)\{\.collab-current-hero/)
 assert.match(html,/\/app\.js\?v=20261116-no-npcs-v1/)
 assert.match(html,/\/styles\.css\?v=20261116-no-npcs-v1/)
 assert.match(sw,/alpha-rpg-pwa-20261116-no-npcs-v1/)
})
