import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const gameCatalog=readFileSync(new URL('../src/neon/game-catalog.js',import.meta.url),'utf8')
const webApi=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')

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
  assert.ok(boss.includes("if(!eventSession && i>=29) break"),'common/weekly boss must still stop after 30 attacks')
  assert.ok(boss.includes("const eventSession=sessionMode==='event'"),'event boss must use continuous auto-combat mode')
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
  assert.ok(gameCatalog.includes("aguia:{label:'🦅 Precisão',stat:'crit',base:9}"),'Águia crit should be 9% base')
  assert.ok(gameCatalog.includes("tigre:{label:'🐯 Fúria',stat:'damage',base:8}"),'Tigre damage should be 8% base')
  assert.ok(gameCatalog.includes("leao:{label:'🦁 Rei da Caçada',stat:'damage',base:9}"),'Leão damage should be 9% base')
  assert.ok(gameCatalog.includes("dragao:{label:'🐉 Caçador de Boss',stats:{bossDamage:10,defense:4}}"),'Dragão should have 10% boss damage + 4% defense')
  assert.ok(gameCatalog.includes("baleia_colossal:{label:'🐋 Canto Colossal',stats:{defense:10,xp:4}}"),'Baleia should have 10% defense + 4% XP')
  assert.ok(gameCatalog.includes("tubarao_abissal:{label:'🦈 Frenesi Abissal',stats:{damage:7,crit:3}}"),'Tubarão hybrid should remain unchanged')
  assert.ok(gameCatalog.includes("fenix_celestial:{label:'🌟 Graça Celestial',stats:{defense:10,dodge:8,xp:8},healPct:8,healCooldown:4,raid:true}"),'Fênix Celestial should remain unchanged')
})

test('boss and event combat auto-heal pets like raids',()=>{
  assert.ok(games.includes("const petPotionIds=['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema']"),'Boss pet potion inventory lookup missing')
  assert.ok(games.includes("const chosenPet=raidPetPotion(petPotionRows,missing)"),'Boss must reuse raid pet-potion selection')
  assert.ok(games.includes("autoPetHeal={id:chosenPet.item_id"),'Boss must return pet auto-heal details')
  assert.ok(index.includes("🐾🧪 *AUTOCURA DO PET!*"),'Boss session must announce pet auto-heal')
})


test('player classes are persisted RPG stats, not cosmetic-only',()=>{
  assert.ok(gameCatalog.includes("paladin:Object.freeze({id:'paladin',name:'Paladino',role:'Tank',hp:80,atk:-4,def:12,spd:-3"),'Paladin tank baseline changed or missing')
  assert.ok(db.includes('export async function setPlayerClass'),'class persistence function missing')
  assert.ok(db.includes("class_applied BOOLEAN NOT NULL DEFAULT FALSE"),'stats class migration missing')
})

test('web login has server-side self-test and direct exchange',()=>{
  assert.ok(webApi.includes("url.pathname==='/api/v1/health/auth'"),'web auth self-test endpoint missing')
  assert.ok(webApi.includes("url.pathname==='/api/v1/auth/link'"),'one-tap web auth endpoint missing')
})

test('web app has no duplicate critical render functions',()=>{
  const count=name=>(app.match(new RegExp('function\\s+'+name+'\\s*\\(','g'))||[]).length
  assert.equal(count('raidSpriteKey'),1,'raidSpriteKey duplicated')
  assert.equal(count('ownedPetCard'),1,'ownedPetCard duplicated')
  assert.equal(count('itemArtMarkup'),1,'itemArtMarkup duplicated')
})


test('WhatsApp preview cannot consume a web login code',()=>{
  assert.ok(webApi.includes("/rpg#code="),'!web must put the one-time code in a URL fragment')
  const start=webApi.indexOf("url.pathname==='/api/v1/auth/link'")
  const end=webApi.indexOf("url.pathname==='/api/v1/auth/exchange'",start)
  assert.ok(start>=0&&end>start,'auth routes missing')
  const getRoute=webApi.slice(start,end)
  assert.ok(!getRoute.includes('exchangeWebLinkCode('),'GET auth link must never consume a one-time code')
  assert.ok(app.includes("hashParams.get('code')"),'browser must read the login code from the fragment')
})


test('team pet healing targets the selected collection pet',()=>{
  assert.ok(db.includes('export async function usePetPotion(jid,itemId=null,petId=null)'),'pet healing must accept an optional collection pet id')
  assert.ok(webApi.includes("body.petId==null?null:positiveInt(body.petId,'Pet')"),'web pet.heal must forward the selected pet id')
  assert.ok(app.includes('data-team-pet-heal'),'team pet cards need a direct heal button')
  assert.ok(app.includes('data-pet-card-heal'),'collection pet cards need a direct heal button')
})

test('pet healing result is rendered as UI instead of raw JSON',()=>{
  assert.ok(app.includes("value.petName&&value.healed!=null&&value.hp!=null&&value.maxHp!=null"),'pet heal result renderer missing')
})

test('inventory and shop labels are localized',()=>{
  assert.ok(app.includes("common:'Comum',uncommon:'Incomum',rare:'Raro',epic:'Épico'"),'rarity localization missing')
  assert.ok(app.includes("weapon:'Arma',armor:'Armadura',boots:'Botas'"),'category localization missing')
})


test('player healing uses the best available potion',()=>{
  assert.ok(db.includes('export async function usePotion(jid,itemId=null)'),'player heal should allow automatic potion choice')
  assert.ok(webApi.includes("case 'player.heal': return usePotion(jid,body.itemId?String(body.itemId):null)"),'player.heal web action missing')
  assert.ok(app.includes("data-player-heal"),'player heal button missing')
})

test('legacy duplicate equipment is removed from the web shop',()=>{
  assert.ok(webApi.includes("return Boolean(getEquipmentInfo(item.id))"),'legacy unsupported equipment should be filtered from shop')
})

test('raid materials do not fall through into armor artwork',()=>{
  assert.ok(app.includes("nucleo_titan:['🟠💎','Núcleo do Titã']"),'Núcleo do Titã fallback missing')
  assert.ok(app.includes("fragmento_celestial:['🔷💎','Fragmento Celestial']"),'Fragmento Celestial mapping missing')
  assert.ok(app.includes("raw.includes('nucleo titan')"),'material guard must run before armor matching')
})
