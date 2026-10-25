import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  COLLAB_RAID_FRAGMENTS_PER_WIN,COLLAB_RAID_DAILY_CAP,
  COLLAB_RAID_MIN_DAMAGE,COLLAB_RAID_MIN_SHARE,
  collabRaidBrazilDay,collabRaidEligible,collabRaidPayout,
  COLLAB_FRAGMENT_ITEM,COLLAB_GEAR_UPGRADE_FRAGMENTS
} from '../src/neon/collab-fragment-rules.js'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const games=read('../src/neon/games.js')
const index=read('../src/neon/index.js')
const db=read('../src/neon/db.js')
const collab=read('../src/neon/sete-pecados-collab.js')

test('Sábados e dois domingos: Raid não libera materiais demais por dia',()=>{
  assert.equal(COLLAB_RAID_FRAGMENTS_PER_WIN,10)
  assert.equal(COLLAB_RAID_DAILY_CAP,30)
  assert.equal(COLLAB_RAID_MIN_DAMAGE,25000)
  assert.equal(COLLAB_RAID_MIN_SHARE,.025)
  assert.equal(collabRaidPayout(0,30000,.10),10)
  assert.equal(collabRaidPayout(10,30000,.10),10)
  assert.equal(collabRaidPayout(20,30000,.10),10)
  assert.equal(collabRaidPayout(25,30000,.10),5)
  assert.equal(collabRaidPayout(30,30000,.10),0)
  assert.equal(collabRaidPayout(100,30000,.10),0)
  assert.equal(collabRaidPayout(0,24999,.10),0)
  assert.equal(collabRaidPayout(0,30000,.024),0)
  assert.equal(collabRaidEligible(25000,.025),true)
})

test('A meia-noite vale em Brasília e não em UTC',()=>{
  assert.equal(collabRaidBrazilDay(Date.parse('2026-10-25T02:59:59.000Z')),'2026-10-24')
  assert.equal(collabRaidBrazilDay(Date.parse('2026-10-25T03:00:00.000Z')),'2026-10-25')
  assert.equal(collabRaidBrazilDay(Date.parse('2026-11-02T02:59:59.000Z')),'2026-11-01')
})

test('Raids existentes ficam independentes da nova Raid especial',()=>{
  assert.match(games,/name:'Raid dos Sete Pecados — Abismo Sagrado',collab:true,minLevel:70,hp:1150000,atk:285/)
  assert.match(games,/75:35/)
  assert.match(games,/const minPlayers=1/)
  assert.match(games,/cfg.minLevel\|\|cfg.level/)
  assert.match(games,/if\(cfg.collab\)/)
  assert.match(games,/collabRaidPayout\(creditedToday,p.damage,share\)/)
  assert.match(games,/dailyKey='collab_raid_fragments_daily:'\+day\+':'\+p.jid/)
  assert.match(games,/FROM trevo_settings WHERE key=\$1 FOR UPDATE/)
  assert.match(games,/inventories\.quantity\+EXCLUDED\.quantity/)
  assert.match(db,/\['chave_raid_75'/)
  assert.match(db,/sellable=FALSE,stackable=TRUE WHERE id='fragmento_ascensao_pecados_20261024'/)
  assert.equal(COLLAB_FRAGMENT_ITEM,'fragmento_ascensao_pecados_20261024')
})

test('Comandos exibem limite real e evolução usa o mesmo material',()=>{
  assert.match(index,/collabRaidNumber/)
  assert.match(index,/COLLAB_RAID_DAILY_CAP/)
  assert.match(index,/RAID DOS SETE PECADOS — ABERTA/)
  assert.match(collab,/collabRaidBrazilDay/)
  assert.match(collab,/COLLAB_RAID_DAILY_CAP/)
  assert.match(collab,/collabFragmentBalance\(sender\)/)
  assert.match(collab,/upgradeEquipment\(sender,target.id,null,null,'normal','collab_fragments'\)/)
  assert.equal(COLLAB_GEAR_UPGRADE_FRAGMENTS,12)
})
