import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const gameCatalog=readFileSync(new URL('../src/neon/game-catalog.js',import.meta.url),'utf8')
const webApi=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
const webIndex=readFileSync(new URL('../web/index.html',import.meta.url),'utf8')
const webManifest=readFileSync(new URL('../web/manifest.webmanifest',import.meta.url),'utf8')
const serviceWorker=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8')
const renderServer=readFileSync(new URL('../src/neon/render.js',import.meta.url),'utf8')

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
  assert.ok(gameCatalog.includes("paladin:Object.freeze({id:'paladin',name:'Paladino',role:'Tank',hp:130,atk:7,def:22,spd:5"),'Paladin tank baseline changed or missing')
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


test('all player classes now have positive non-zero role bonuses',()=>{
  for(const id of ['warrior','assassin','mage','archer','paladin','berserker','monk','necromancer','druid','samurai']){
    const rx=new RegExp(id+":Object\\.freeze\\(\\{id:'"+id+"'[^}]*hp:(-?\\d+),atk:(-?\\d+),def:(-?\\d+),spd:(-?\\d+)")
    const m=gameCatalog.match(rx)
    assert.ok(m,'class missing: '+id)
    for(const n of m.slice(1).map(Number)) assert.ok(n>0,id+' must not have zero/negative class bonus')
  }
})

test('class reclassification requires scroll and seven-day cooldown',()=>{
  assert.ok(db.includes("const RECLASS_ITEM='pergaminho_reclassificacao'"),'reclass scroll id missing')
  assert.ok(db.includes('const RECLASS_SECONDS=7*24*60*60'),'7-day cooldown missing')
  assert.ok(db.includes("UPDATE inventories SET quantity=quantity-1"),'reclass scroll must be consumed')
  assert.ok(db.includes("class_hp_bonus INTEGER NOT NULL DEFAULT 0"),'class bonus snapshot migration missing')
  assert.ok(app.includes('Precisa de Pergaminho'),'web class lock state missing')
  assert.ok(app.includes('Primeira classe grátis'),'first-choice UX missing')
})


test('group web linking upgrades existing sessions',()=>{
  assert.ok(webApi.includes("UPDATE web_sessions SET chat_jid=$1,last_seen_at=$2 WHERE jid=$3 AND expires_at>$2"),'!web in a group must upgrade existing sessions')
  assert.ok(webApi.includes("groupLinked:true"),'auth health self-test must verify group binding')
})

test('corrected art sheet protects known broken assets',()=>{
  assert.ok(app.includes("FIXED_ART_SHEET='/assets/alpha-fixed-art.webp"),'corrected art sheet missing')
  assert.ok(app.includes("'fixed-wolvenaro'"),'Wolvenaro corrected art missing')
  assert.ok(app.includes("'fixed-urso-runico'"),'Urso Runico corrected art missing')
  assert.ok(app.includes("bota_leve:'fixed-bota-leve'"),'Bota Leve corrected art missing')
  assert.ok(app.includes("armadura_couro:'fixed-armadura-couro'"),'Armadura de Couro corrected art missing')
  assert.ok(app.includes("olho_abissal:'fixed-olho-abissal'"),'Olho Abissal corrected art missing')
  assert.ok(app.includes("nucleo_titan:'fixed-nucleo-tita'"),'Nucleo do Tita corrected art missing')
})

test('fuzzy equipment art matching is category gated',()=>{
  assert.ok(app.includes("if(category==='weapon')"),'weapon fuzzy art must be category gated')
  assert.ok(app.includes("if(category==='armor')"),'armor fuzzy art must be category gated')
})


test('Lucky 3x multiplies roulette profit, not returned stake',()=>{
  assert.ok(games.includes("const baseProfit=basePayout-amount"),'single roulette must separate stake from profit')
  assert.ok(games.includes("payout=amount+(baseProfit*lucky3xMultiplier())"),'single roulette Lucky 3x payout formula is wrong')
  assert.ok(games.includes("const baseProfit=basePayout-stake"),'group roulette must separate stake from profit')
  assert.ok(games.includes("payout=stake+(baseProfit*lucky3xMultiplier())"),'group roulette Lucky 3x payout formula is wrong')
})


test('Alpha RPG is installable as a PWA',()=>{
  const manifest=JSON.parse(webManifest)
  assert.equal(manifest.name,'Alpha RPG')
  assert.equal(manifest.start_url,'/rpg')
  assert.equal(manifest.display,'standalone')
  assert.ok(Array.isArray(manifest.icons)&&manifest.icons.some(x=>x.sizes==='192x192'),'192px PWA icon missing')
  assert.ok(manifest.icons.some(x=>x.sizes==='512x512'),'512px PWA icon missing')
  assert.ok(webIndex.includes('rel="manifest"'),'manifest link missing from web shell')
  assert.ok(webIndex.includes("navigator.serviceWorker.register('/sw.js'"),'service worker registration missing')
  assert.ok(webIndex.includes('beforeinstallprompt'),'install prompt handling missing')
  assert.ok(serviceWorker.includes("url.pathname.startsWith('/api/')"),'service worker must never cache authenticated API calls')
  assert.ok(renderServer.includes("'/manifest.webmanifest':'manifest.webmanifest'"),'Render must serve the manifest')
  assert.ok(renderServer.includes("'/sw.js':'sw.js'"),'Render must serve the service worker')
})


test('reclassification scroll is endgame Boss-only loot',()=>{
  assert.ok(db.includes("['pergaminho_reclassificacao','Pergaminho de Reclassificação'"),'reclass scroll item missing')
  assert.ok(db.includes("'special',0,'epic'"),'reclass scroll must not be sold in shop')
  assert.ok(db.includes("if(item.id==='pergaminho_reclassificacao' || Number(item.price)<=0)"),'direct purchase of drop-only items must be blocked')
  assert.ok(games.includes("if(Number(user?.level||1)<100) return null"),'reclass scroll must require level 100')
  assert.ok(games.includes("const chance=mode==='weekly'?.03:.01"),'Boss drop chances must be 3% weekly and 1% common/event')
  assert.ok(games.includes("const reclassDrop=await maybeGrantReclassScroll"),'Boss reward flow must roll the reclass scroll')
})
