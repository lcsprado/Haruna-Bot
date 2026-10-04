import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')

test('critical command handlers remain registered',()=>{
  for(const cmd of ['ping','saldo','all','raid','boss','perfil']){
    assert.ok(index.includes(`'${cmd}'`) || index.includes(`cmd==='${cmd}'`) || index.includes(`cmd==="${cmd}"`),`missing handler/reference for !${cmd}`)
  }
})

test('boss and raid combat loop limits stay separated',()=>{
  const bossStart=index.indexOf('async function runBossSession')
  const raidStart=index.indexOf('async function runRaidCombat')
  assert.ok(bossStart>=0 && raidStart>bossStart,'combat functions missing or reordered unexpectedly')
  const boss=index.slice(bossStart,raidStart)
  const raid=index.slice(raidStart)
  assert.ok(boss.includes('for(let i=0;i<30;i++){'),'boss session must stay at 30 attacks')
  assert.ok(!boss.includes('for(let i=0;i<180;i++){'),'boss session must not inherit raid loop')
  assert.ok(raid.includes('for(let i=0;i<180;i++){'),'raid combat runner must keep extended loop')
})

test('03:03 event wiring remains intact',()=>{
  assert.ok(index.includes('autoStartNightBossEvent'),'night event scheduler import/call missing')
  assert.ok(games.includes('export async function autoStartNightBossEvent'),'night event export missing')
  assert.ok(games.includes("eventId:'night_0303'"),'night event state missing')
})

test('Coroa da Madrugada keeps dual stats',()=>{
  assert.ok(db.includes("coroa_madrugada: { category:'armor', atk:20, def:50"),'midnight crown stats changed or missing')
})

test('raid timers remain level-scaled',()=>{
  assert.ok(games.includes("10:12,15:15,20:18,25:22,30:30,40:40,50:50"),'raid duration table changed unexpectedly')
})

test('equiparpet without args opens the interactive team flow',()=>{
  assert.ok(index.includes("const pickTokens=String(args.join(' ')||'').trim().split(/[\\s,;]+/).filter(Boolean)"),'equiparpet must discard empty tokens before Number conversion')
  assert.ok(index.includes("setQuickFlow(chat,sender,'pet_team_select'"),'interactive team selection flow missing')
})

test('purchasable pet specialties keep the intended progression',()=>{
  assert.ok(games.includes("aguia:{label:'🦅 Precisão',crit:.09}"),'Águia crit should be 9% base')
  assert.ok(games.includes("tigre:{label:'🐯 Fúria',damage:.08}"),'Tigre damage should be 8% base')
  assert.ok(games.includes("leao:{label:'🦁 Rei da Caçada',damage:.09}"),'Leão damage should be 9% base')
  assert.ok(games.includes("dragao:{label:'🐉 Caçador de Boss',bossDamage:.10,defense:.04}"),'Dragão should have 10% boss damage + 4% defense')
  assert.ok(games.includes("baleia_colossal:{label:'🐋 Canto Colossal',defense:.10,xp:.04}"),'Baleia should have 10% defense + 4% XP')
  assert.ok(games.includes("tubarao_abissal:{label:'🦈 Frenesi Abissal',damage:.07,crit:.03}"),'Tubarão hybrid should remain unchanged')
  assert.ok(games.includes("fenix_celestial:{label:'🌟 Graça Celestial',defense:.10,dodge:.08,xp:.08,healPct:.08,healCooldown:4,raid:true}"),'Fênix Celestial should remain unchanged')
})

test('boss and event combat auto-heal pets like raids',()=>{
  assert.ok(games.includes("const petPotionIds=['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica']"),'Boss pet potion inventory lookup missing')
  assert.ok(games.includes("const chosenPet=raidPetPotion(petPotionRows,missing)"),'Boss must reuse raid pet-potion selection')
  assert.ok(games.includes("autoPetHeal={id:chosenPet.item_id"),'Boss must return pet auto-heal details')
  assert.ok(index.includes("🐾🧪 *AUTOCURA DO PET!*"),'Boss session must announce pet auto-heal')
})
