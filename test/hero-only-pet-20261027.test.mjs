import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PECADOS_HERO_IDS} from '../src/neon/sete-pecados-catalog.js'
import {isSevenSinHeroSpecies,planHeroOnlyPetTeam} from '../src/neon/hero-only-pet-rules.js'

const pet=(id,species,active=false)=>({id,species,active})
const slot=(slot,pet_id,species)=>({slot,pet_id,species})

test('todos os sete Pecados são somente heróis e nunca pets',()=>{
  assert.equal(PECADOS_HERO_IDS.length,7)
  for(const id of PECADOS_HERO_IDS)assert.equal(isSevenSinHeroSpecies(id),true,id)
  assert.equal(isSevenSinHeroSpecies('fenix_celestial'),false)
})

test('converte principal Pecado para reserva comum sem destruir coleção',()=>{
  const old=[slot(1,2,'pecado_escanor'),slot(2,5,'fenix_celestial'),slot(3,8,'dragao_corrompido')]
  const owned=[pet(2,'pecado_escanor',true),pet(5,'fenix_celestial'),pet(8,'dragao_corrompido')]
  const originals=structuredClone({old,owned})
  const {teamIds,primary}=planHeroOnlyPetTeam(old,owned)
  assert.deepEqual(teamIds,[5,8])
  assert.equal(primary.id,5)
  assert.deepEqual({old,owned},originals)
})

test('times de três Pecados ficam sem pets, preservando personagens',()=>{
  const old=PECADOS_HERO_IDS.slice(0,3).map((species,i)=>slot(i+1,i+1,species))
  const owned=PECADOS_HERO_IDS.slice(0,3).map((species,i)=>pet(i+1,species,true))
  assert.deepEqual(planHeroOnlyPetTeam(old,owned),{teamIds:[],primary:null})
})

test('sem pets no time, usa um comum disponível e não expedições',()=>{
  // O banco fornece somente pets elegíveis, fora de expedição.
  const result=planHeroOnlyPetTeam([slot(1,1,'pecado_ban')],[pet(9,'golem_ancestral')])
  assert.deepEqual(result.teamIds,[9])
})

test('sinergia antiga, potes, duelos e expedições não reativam Pecados',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  const migration=readFileSync(new URL('../src/neon/hero-only-pet-migration.js',import.meta.url),'utf8')
  const collab=readFileSync(new URL('../src/neon/sete-pecados-collab.js',import.meta.url),'utf8')
  const web=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
  assert.match(db,/export function petTeamSynergy\(pets=\[\]\)\{/)
  assert.match(db,/PECADOS_HERO_IDS\.includes\(String\(p\.species\|\|''\)\)/)
  assert.match(db,/Os Sete Pecados não podem integrar Time Pet/)
  assert.match(db,/não recebem poções de pet/)
  assert.match(db,/não participam de expedições de pets/)
  assert.match(db,/personagens jogáveis, nunca pets/)
  assert.match(games,/p\.teamPassives=\(p\.teamPassives\|\|\[\]\)\.filter/)
  assert.match(games,/function petBossBonus\(pet\)/)
  assert.match(games,/PECADOS_HERO_IDS\.includes\(String\(pet\.species\|\|''\)\)/)
  assert.match(migration,/planHeroOnlyPetTeam\(oldTeam,eligible\)/)
  assert.match(migration,/hero_legacy_pet_audit/)
  assert.doesNotMatch(migration,/DELETE FROM pet_collection/)
  assert.match(collab,/PERSONAGENS JOGÁVEIS — 7 PECADOS/)
  assert.match(web,/Personagem desbloqueado/)
})
