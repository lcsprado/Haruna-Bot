import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  COLLAB_FARM_PHASES,COLLAB_FRAGMENTS_PER_PHASE,COLLAB_MIN_DAMAGE,
  COLLAB_FARM_END,COLLAB_FARM_START,COLLAB_FARM_ID,COLLAB_FRAGMENT_ITEM,
  collabRemainingPersonalDamage,collabEligibleForFragments,
  COLLAB_PET_UPGRADE_FRAGMENTS,COLLAB_GEAR_UPGRADE_FRAGMENTS,
  COLLAB_RAID_FRAGMENTS_PER_WIN,COLLAB_RAID_DAILY_CAP,collabRaidPayout,collabRaidEligible,collabRaidBrazilDay
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

test('Raid dos Sete Pecados substitui o Boss temporário sem forçar equipe',()=>{
 const cfg=games.match(/\{level:75,name:'Raid dos Sete Pecados[^\n]*/)
 assert.ok(cfg,'A Raid deve ter configuração própria e material de collab')
 assert.match(cfg[0],/collab:true,minLevel:70,hp:1150000,atk:285/)
 assert.match(cfg[0],/material:\{id:COLLAB_FRAGMENT_ITEM/)
 assert.match(games,/70:50,75:35/)
 assert.match(games,/const minPlayers=1/)
 assert.match(games,/if\(cfg\.collab\)\{/)
 assert.equal(COLLAB_RAID_FRAGMENTS_PER_WIN,10)
 assert.equal(COLLAB_RAID_DAILY_CAP,30)
 assert.equal(collabRaidPayout(0,25000,.025),10)
 assert.equal(collabRaidPayout(25,25000,.025),5)
 assert.equal(collabRaidPayout(30,25000,.025),0)
 assert.equal(collabRaidPayout(0,24999,.025),0)
 assert.equal(collabRaidEligible(25000,.025),true)
 assert.equal(collabRaidBrazilDay(Date.parse('2026-10-25T02:59:00Z')),'2026-10-24')
 assert.equal(collabRaidBrazilDay(Date.parse('2026-10-25T03:01:00Z')),'2026-10-25')
 assert.match(games,/collabRaidEligible\(p\.damage,share\)/)
 assert.match(games,/const qty=collabRaidPayout\(creditedToday,p\.damage,share\)/)
 assert.match(games,/SELECT value FROM trevo_settings WHERE key=\$1 FOR UPDATE/)
 assert.match(games,/if\(Number\(s\.hp\)<=0\)\{/)
 assert.match(games,/const rewards=await finishRaidRewards\(c,s,cfg,chat\)/)
 assert.match(index,/!raid pecados/)
 assert.match(index,/!entrar pecados/)
 assert.match(index,/collabRaidNumber/)
 assert.doesNotMatch(index,/tickCollabFragmentFarm\(\)/)
 assert.match(db,/chave_raid_75/)
 assert.match(db,/fragmento_ascensao_pecados_20261024/)
 assert.ok(COLLAB_FARM_ID,'O antigo ID continua isolado; não há spawn agendado')
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
