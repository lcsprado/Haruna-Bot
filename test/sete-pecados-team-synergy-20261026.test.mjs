import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PECADOS_HERO_IDS} from '../src/neon/sete-pecados-catalog.js'
import {resolveCollabWildcardTeam} from '../src/neon/pet-astral-wildcard.js'

const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const gameplay=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')

// Regras atuais após Hero-only: os Pecados antigos são personagens, não pets.
// Os cenários de escalação real ficam em web-vital-team-synergy-20261110.test.mjs.
test('Hero-only: personagens da collab não são pets nas sinergias',()=>{
 assert.equal(PECADOS_HERO_IDS.length,7)
 assert.match(source,/filter\(p=>p&&!PECADOS_HERO_IDS\.includes\(String\(p\.species\|\|''\)\)\)/)
 assert.match(source,/const vital=team\.length===3&&unique\?resolveVitalTeam\(species\):null/)
})
test('Nenhuma collab se forma sem pelo menos uma espécie original',()=>{
 const original=[...PECADOS_HERO_IDS]
 assert.equal(resolveCollabWildcardTeam(['lince_astral','raposa_astral','morcego_madrugada'],[
  {id:'sete-pecados',label:'7 Pecados',species:original}
 ]),null)
})
test('Raid recalcula a sinergia a cada round e não usa os dados congelados na sala',()=>{
 assert.equal((gameplay.match(/const baseTeamSynergy=petTeamSynergy\(p\.teamPassives\|\|\[\]\)/g)||[]).length,2)
 assert.doesNotMatch(gameplay,/const teamSynergy=p\.teamSynergy\|\|\{/)
})
