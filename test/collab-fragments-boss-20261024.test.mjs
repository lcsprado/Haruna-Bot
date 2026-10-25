import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  COLLAB_FARM_PHASES,COLLAB_FRAGMENTS_PER_PHASE,COLLAB_MIN_DAMAGE,
  COLLAB_FARM_END,COLLAB_FARM_START,COLLAB_FARM_ID,COLLAB_FRAGMENT_ITEM,
  collabRemainingPersonalDamage,collabEligibleForFragments,
  COLLAB_PET_UPGRADE_FRAGMENTS,COLLAB_GEAR_UPGRADE_FRAGMENTS
} from '../src/neon/collab-fragment-rules.js'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const games=read('../src/neon/games.js')
const db=read('../src/neon/db.js')
const index=read('../src/neon/index.js')
const collab=read('../src/neon/sete-pecados-collab.js')

test('4 fases de sábado, cooperativas e com desafio crescente',()=>{
 assert.equal(COLLAB_FARM_PHASES.length,4)
 assert.ok(COLLAB_FARM_START<COLLAB_FARM_END)
 assert.ok(COLLAB_FARM_PHASES.every((p,i)=>i===0||(p.hp>COLLAB_FARM_PHASES[i-1].hp&&p.atk>COLLAB_FARM_PHASES[i-1].atk)))
 assert.equal(COLLAB_FRAGMENTS_PER_PHASE,24)
 assert.equal(COLLAB_FRAGMENTS_PER_PHASE*COLLAB_FARM_PHASES.length,96)
 assert.equal(COLLAB_MIN_DAMAGE,10000)
 assert.equal(collabRemainingPersonalDamage(320000,0),192000)
 assert.equal(collabRemainingPersonalDamage(320000,192000),0)
 assert.equal(collabRemainingPersonalDamage(320000,320000),0)
 assert.ok(collabRemainingPersonalDamage(320000,0)<320000)
 assert.equal(collabEligibleForFragments(9999),false)
 assert.equal(collabEligibleForFragments(10000),true)
})

test('Boss isolado do semanal, trava por participante e pagamento uma vez por fase',()=>{
 assert.match(games,/const GLOBAL_BOSS_EVENT_CHAT=/)
 assert.match(games,/export async function tickCollabFragmentFarm/)
 assert.match(games,/current\.eventId===COLLAB_FARM_ID/)
 assert.match(games,/blockingBoss:current\.name/)
 assert.match(games,/await loadGame\(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event'\)/)
 assert.match(games,/collabRemainingPersonalDamage\(s\.maxHp,existingParticipant\.damage\|\|0\)/)
 assert.match(games,/settleCollabFarmPhase\(c,s\)/)
 assert.match(games,/await saveGame\(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',next\)/)
 assert.match(games,/inventories\.quantity\+EXCLUDED\.quantity/)
 assert.match(index,/tickCollabFragmentFarm\(\)/)
 assert.match(index,/r\.eventId===COLLAB_FARM_ID/)
 assert.match(index,/COLLAB_FARM_END-Date\.now\(\)\+500/)
})

test('Fragmentos exclusivos compram progressão real e não alteram armas comuns',()=>{
 assert.equal(COLLAB_PET_UPGRADE_FRAGMENTS,12)
 assert.equal(COLLAB_GEAR_UPGRADE_FRAGMENTS,12)
 assert.notEqual(COLLAB_FRAGMENT_ITEM,'fragmento_universal_raid')
 assert.match(db,/payment='cash'/)
 assert.match(db,/usingCollabFragments=payment==='collab_fragments'/)
 assert.match(db,/!PECADOS_GEAR_IDS\.includes\(itemId\)/)
 assert.match(db,/equipment_upgrade_collab_fragments/)
 assert.match(db,/fragmentCost,cash:/)
 assert.match(collab,/await growCollabHero\(sender,target\.species\)/)
 assert.match(collab,/upgradeEquipment\(sender,target\.id,null,null,'normal','collab_fragments'\)/)
 assert.match(collab,/UPDATE pet_collection SET level=/)
 assert.match(collab,/UPDATE pets SET level=/)
 assert.match(collab,/fragmentos/)
})
