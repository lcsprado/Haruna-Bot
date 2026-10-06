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
  assert.ok(raid.includes('for(let i=0;;i++){'),'raid combat runner must continue until Raid state ends it')
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
  assert.ok(gameCatalog.includes("paladin:Object.freeze({id:'paladin',name:'Paladino',role:'Defensor',hp:130,atk:7,def:22,spd:5"),'Paladin defender baseline changed or missing')
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

test('level rewards are explicit, balanced through level 100 and use real claim history',()=>{
  for(const milestone of [55,60,65,70,75,80,85,90,95,100]){
    assert.ok(db.includes(milestone+':{cash:'),'missing explicit reward for Lv.'+milestone)
  }
  assert.ok(db.includes("100:{cash:750000,items:[['pergaminho_reclassificacao',1]"),'Lv.100 must grant the reclassification scroll')
  assert.ok(db.includes('if(milestone<5 || milestone>100 || milestone%5!==0) return null'),'level rewards must stop at 100')
  assert.ok(db.includes('export async function getClaimedLevelRewards(jid)'),'claimed milestones query missing')
  assert.ok(webApi.includes('claimedLevelRewards'),'PWA extras must expose actual claimed milestones')
  assert.ok(webApi.includes('Array.from({length:20}'),'PWA must list milestones through level 100')
  assert.ok(app.includes('const claimedSet=new Set'),'PWA must render claimed state from actual milestone history')
  assert.ok(app.includes("done=claimedSet.has(milestone)"),'claimed rewards must not be shown as available again')
  assert.ok(app.includes("pergaminho_reclassificacao:'Pergaminho de Reclassificação'"),'Lv.100 reward label must be readable')
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


test('all purchasable pets resolve without borrowing art from another species',()=>{
  const adoptable=[
    'cachorro','gato','coelho','papagaio','hamster','tartaruga','coruja','raposa','golfinho_celestial','lobo',
    'moreia_sombria','aguia','gaviao','panda','tubarao_abissal','guepardo','tigre','polvo_arcano',
    'gazela_mistica','leao','cervo_mistico','orca_guerra','cavalo_guerra','unicornio','baleia_colossal','dragao'
  ]
  const emojiStart=app.indexOf('const PET_SPECIES_EMOJI={')
  const emojiEnd=app.indexOf('\n};',emojiStart)
  const emojiMap=app.slice(emojiStart,emojiEnd)
  for(const species of adoptable){
    assert.ok(emojiMap.includes(species+':'),'missing species-safe fallback for adoptable pet '+species)
  }
  assert.ok(app.includes("return PET_NATIVE_SPRITES[s]||''"),'pet sprite resolver must not default to another animal')
  assert.ok(app.includes("return petSpeciesFallback(s,className,label)"),'pets without exact art must use a species-safe visual')
})

test('web pet gallery covers every catalog species with framed art',()=>{
  assert.ok(app.includes("return PET_NATIVE_SPRITES[s]||''"),'pet art must never silently fall through to a wrong animal')
  for(const species of ['oraculo_pedra','pantera_vulcanica','espectro_abissal','kraken_aco','esfinge_titanica','quimera_abissal','paladino_astral','lince_celestial','arcanjo_eclipse','colosso_alpha','oraculo_alpha']){
    assert.ok(app.includes("'pet-special-"+species+"'"),'missing exclusive special art for '+species)
  }
  assert.ok(app.includes('data-pet-adopt-direct'),'adoption cards must have a direct adoption action')
  assert.ok(app.includes('data-pet-adopt-name'),'adoption cards must allow naming before adoption')
  assert.ok(app.includes('data-pet-rename='),'every owned pet card must expose rename by collection id')
  assert.ok(webApi.includes("renamePet(jid,String(body.name||''),body.petId==null?null:positiveInt(body.petId,'Pet'))"),'web rename must target the selected pet id')
  assert.ok(db.includes('export async function renamePet(jid,name,petId=null)'),'backend must support renaming any collection pet')
})

test('web item and pet galleries never render wrong stacked artwork',()=>{
  const itemStart=app.indexOf('function itemSpriteKey')
  const itemEnd=app.indexOf('\nfunction ',itemStart+30)
  const itemBlock=app.slice(itemStart,itemEnd)
  for(const id of ['energetico_pet','espada_madeira','espada_ferro','espada_aco','lanca_solar','excalibur','armadura_aco','bota_cacador','bota_relampago','bota_celestial','escama_vulcanica','insignia_eclipse','marca_insone','coroa_madrugada']){
    assert.ok(itemBlock.includes(id+':'), 'missing explicit artwork mapping for '+id)
  }
  assert.ok(!itemBlock.includes("return '';"),'item artwork resolver must never return blank')
  assert.ok(app.includes('pet-image-fallback'),'exact pet images need a species-safe fallback')
  assert.ok(app.includes("classList.add(\\'pet-art-loaded\\')"),'exact pet art must hide fallback after loading')
  assert.ok(app.includes('onerror="this.remove()"'),'broken exact pet images must leave the safe fallback visible')
  assert.ok(!app.includes("className+' pet-fallback-underlay'"),'pet cards must not stack an unrelated sprite under the real art')
})

test('reported pet cards cannot resolve to the wrong animal',()=>{
  const spriteStart=app.indexOf('const PET_NATIVE_SPRITES={')
  const spriteEnd=app.indexOf('\n};',spriteStart)
  const native=app.slice(spriteStart,spriteEnd)
  assert.ok(!native.includes("coruja:'pet-crow'"),'Coruja must never render as Corvo')
  assert.ok(!native.includes("hamster:'pet-panda'"),'Hamster must never render as Panda')
  assert.ok(!native.includes("papagaio:'pet-eagle'"),'Papagaio must never render as Águia')
  assert.ok(app.includes("leao:'/assets/pets/leao.webp'"),'Leão must use its exact image asset')
  assert.ok(app.includes("gato:'/assets/pets/gato.webp'"),'Gato must use its exact image asset')
})

test('PWA rivalry actions are echoed with real opponents and dedicated duel UI',()=>{
  assert.ok(index.includes('globalThis.__alphaWebGroupLog'),'WhatsApp bridge for web actions missing')
  assert.ok(webApi.includes('async function sendWebGroupActivity'),'web activity formatter missing')
  for(const action of ["actionName==='battle'","actionName==='petduel'","actionName==='game.roulette'","actionName==='game.coinflip'"]){
    assert.ok(webApi.includes(action),'missing rivalry log for '+action)
  }
  assert.ok(webApi.includes('withTargetMeta(await battle'),'battle result must retain the selected opponent')
  assert.ok(webApi.includes("text='⚔️ *DUELO RPG*"),'battle activity must use a real duel message instead of raw action code')
  assert.ok(webApi.includes("if(result.ok===false)"),'battle cooldown must not create fake group activity')
  assert.ok(webApi.includes('targetName'),'social activity logs must preserve target names')
  assert.ok(app.includes("['duels','⚔️','Duelos']"),'dedicated Duelos navigation item missing')
  assert.ok(app.includes('function renderDuelArena(members)'),'two-character duel arena missing')
  assert.ok(app.includes('data-duel-launch'),'duel arena needs a real battle action')
  assert.ok(app.includes('data-duel-pet-launch'),'duel arena needs a pet duel action')
  assert.ok(webApi.includes('s.class_id,s.class_applied,s.hp,s.max_hp,s.atk,s.def,s.spd'),'social roster must expose real combat/class data')
  assert.ok(webApi.includes('effective_atk:Number(row.atk||0)+Number(weapon?.atk||0)+Number(armor?.atk||0)'),'duel roster must calculate opponent effective ATK')
  assert.ok(webApi.includes('effective_max_hp:effectiveMaxHp'),'duel roster must calculate opponent effective max HP')
  assert.ok(app.includes('target.effective_atk??target.atk'),'duel arena must render effective opponent ATK')
  assert.ok(app.includes('target.effective_max_hp??target.max_hp'),'duel arena must render effective opponent HP')
  assert.ok(webApi.includes('await sendWebGroupActivity(session,actionName,body,rawResult)'),'successful web actions must publish activity')
})


test('every successful PWA action has a WhatsApp activity fallback',()=>{
  assert.ok(webApi.includes("}else if(actionName==='daily'){"),'daily activity log missing')
  assert.ok(webApi.includes("}else if(actionName==='work'){"),'work activity log missing')
  assert.ok(webApi.includes("}else if(actionName==='all'){"),'all activity log missing')
  assert.ok(webApi.includes("}else if(actionName.startsWith('raid.')){"),'raid activity log missing')
  assert.ok(webApi.includes("}else if(actionName.startsWith('boss.')){"),'boss activity log missing')
  assert.ok(webApi.includes("text='🎮 *ATIVIDADE ALPHA*"),'generic fallback activity log missing')
})

test('bank and business WhatsApp activity logs include real monetary values',()=>{
  assert.ok(webApi.includes("const amount=Number(result?.amount||0)"),'deposit must use the actual deposited amount returned by the server')
  assert.ok(webApi.includes("Saldo no banco:"),'bank activity must show resulting bank balance')
  assert.ok(webApi.includes("const gross=Number(result?.gross||0)"),'business collection must show gross revenue')
  assert.ok(webApi.includes("const tax=Number(result?.tax||0)"),'business collection must show tax')
  assert.ok(webApi.includes("Líquido recebido:"),'business collection must show net amount received')
  assert.ok(webApi.includes("📊 *Produção*"),'business collection should show per-business production when available')
})

test('important web activity logs never expose raw action codes and include outcomes',()=>{
  assert.ok(!webApi.includes("executou *'+String(actionName"),'raw internal action names must never be sent to WhatsApp')
  assert.ok(webApi.includes("Dano causado:"),'Boss attack log must include damage')
  assert.ok(webApi.includes("Inimigo:"),'Dungeon log must identify the enemy')
  assert.ok(webApi.includes("Recompensas resgatadas:"),'mission claim log must include claimed count')
  assert.ok(webApi.includes("RECOMPENSAS DE NÍVEL"),'level claim log must list milestone rewards')
  assert.ok(webApi.includes("Reembolso de upgrades:"),'item sale log must include upgrade refund when present')
  assert.ok(webApi.includes("HP: *'+Number(result.hp"),'pet/heal activity must include resulting HP')
  assert.ok(webApi.includes("MERCADO — NOVO ANÚNCIO"),'market log must identify listing details')
  assert.ok(webApi.includes("TIME PET —"),'pet team log must list the actual team')
  assert.ok(webApi.includes("ROTINA COMPLETA —"),'!all log must include totals instead of a generic action message')
})


test('endgame special pets use the approved premium artwork without stacked fallback',()=>{
  assert.ok(app.includes("PREMIUM_PET_ART_SHEET='/assets/alpha-special-pets.webp"),'approved premium pet spritesheet missing')
  assert.ok(app.includes("SPECIAL_PET_ART_SHEETS=["),'Raid pet spritesheets missing')
  for(const species of ['oraculo_pedra','pantera_vulcanica','espectro_abissal','kraken_aco','esfinge_titanica','quimera_abissal','paladino_astral','lince_celestial','arcanjo_eclipse','colosso_alpha','oraculo_alpha']){
    assert.ok(app.includes("'pet-special-"+species+"'"),'exclusive special-pet art missing for '+species)
  }
  assert.ok(app.includes('const premium=PREMIUM_PET_SPRITES[key]'),'premium art must take priority inside the pet crop resolver')
  assert.ok(app.includes("return petCroppedSprite(exclusive,className+' pet-primary-art',label)"),'special pet card must render only its own art layer')
})


test('all Raid/endgame pets have unique exclusive art slots',()=>{
  assert.ok(app.includes("SPECIAL_PET_ART_SHEETS=["),'two-sheet Raid pet art bundle missing')
  const raidSpecies=["golem_ancestral","urso_runico","colosso_cristal","oraculo_pedra","salamandra_infernal","dragao_vulcanico","fenix_fogo","pantera_vulcanica","corvo_abissal","lobo_abismo","fenix_gelo","espectro_abissal","rinoceronte_titanico","guardiao_obsidiana","leviata_gelo","kraken_aco","esfinge_titanica","cerbero_carmesim","tigre_lunar","imperador_abissal","quimera_abissal","paladino_astral","leao_solar","grifo_celestial","fenix_celestial","lince_celestial","arcanjo_eclipse","serpente_cosmica","dragao_corrompido","fenix_alpha","colosso_alpha","oraculo_alpha"]
  const seen=new Set()
  for(const species of raidSpecies){
    const token="'pet-special-"+species+"':["
    const at=app.indexOf(token)
    assert.ok(at>=0,'missing exclusive art for '+species)
    const close=app.indexOf(']',at)
    const slot=app.slice(at+token.length,close)
    assert.ok(!seen.has(slot),'duplicate visual slot for '+species)
    seen.add(slot)
  }
  assert.equal(seen.size,raidSpecies.length,'every Raid/endgame pet must have its own art slot')
})

test('PWA precaches every pet-art source and never ships visible English status jargon',()=>{
  for(const asset of [
    '/assets/official-art-sheet.jpg','/assets/alpha-fixed-art.webp','/assets/alpha-special-pets.webp',
    '/assets/alpha-raid-pets-1.webp','/assets/alpha-raid-pets-2.webp',
    '/assets/pets/aguia.webp','/assets/pets/baleia-colossal.webp','/assets/pets/corvo-abissal.webp',
    '/assets/pets/dragao.webp','/assets/pets/fenix-celestial.webp','/assets/pets/fenix-de-gelo.webp',
    '/assets/pets/gato.webp','/assets/pets/grifo-celestial.webp','/assets/pets/kitsune.webp',
    '/assets/pets/leao.webp','/assets/pets/lobo.webp','/assets/pets/polvo-arcano.webp',
    '/assets/pets/raposa.webp','/assets/pets/serpente-cosmica.webp','/assets/pets/tigre.webp','/assets/pets/tubarao-abissal.webp'
  ]){
    assert.ok(serviceWorker.includes(asset),'pet art must be precached: '+asset)
  }
  assert.ok(app.includes("function raidStatusLabel(value)"),'Raid status translation helper missing')
  assert.ok(app.includes("function bossModeLabel(value)"),'Boss mode translation helper missing')
  assert.ok(app.includes("function petSpeciesName(species)"),'pet species must use catalog Portuguese names')
  assert.ok(!app.includes("return '⏳ Cooldown:"),'visible Cooldown text must be translated')
  assert.ok(!app.includes('Nenhum cooldown ativo.'),'visible cooldown empty-state must be translated')
  assert.ok(!app.includes("daily:'Daily'"),'Daily label must be translated')
  assert.ok(!app.includes("dungeon:'Dungeon'"),'Dungeon label must be translated')
  assert.ok(!gameCatalog.includes("role:'Tank'"),'Tank class role must be translated')
  assert.ok(!gameCatalog.includes("role:'Bruiser'"),'Bruiser class role must be translated')
  assert.ok(!gameCatalog.includes("role:'DPS "),'DPS role labels must be translated')
  assert.ok(!webIndex.includes('RPG • INSTALÁVEL • SYNC'),'visible SYNC label must be translated')
  assert.ok(!app.includes("label='Cooldown ativo'"),'class screen must not expose Cooldown in English')
  assert.ok(!app.includes('<h3>Dungeon</h3>'),'Masmorra must not be shown as Dungeon')
  assert.ok(!app.includes('<span>🎁 Daily:'),'daily status must be Portuguese')
  assert.ok(!app.includes('mesmo backend do WhatsApp'),'backend jargon must not be visible')
  assert.ok(!app.includes("esc(raid.status)"),'raw Raid status must be translated')
  assert.ok(!app.includes("esc(b.mode||'common')"),'raw Boss mode must be translated')
  assert.ok(!app.includes("esc(x.status)"),'raw loan status must be translated')
})


test('web raids run server-side and survive browser timer suspension',()=>{
  assert.ok(index.includes('globalThis.__alphaStartRaidRun'),'server raid runner bridge missing')
  assert.ok(webApi.includes("case 'raid.auto': return startRaidServerRun"),'raid auto resume endpoint missing')
  assert.ok(webApi.includes('await startRaidServerRun(session,started.level)'),'raid.start must launch the server runner')
  assert.ok(app.includes('⚡ AUTO SERVIDOR'),'web raid control must show server-side automation')
  assert.ok(!app.includes('ui.raidTimer=setInterval(tick,8000)'),'web raid must not depend on a client interval')
  assert.ok(index.includes('async function ensureActiveRaidRuns()'),'active Raid recovery watchdog missing')
  assert.ok(index.includes("state->>'status'='active'"),'watchdog must discover persisted active Raids')
  assert.ok(index.includes('raidAutoWatchdog=setInterval'),'Raid auto must be monitored server-side')
  assert.ok(index.includes('void safeRaidNotify(reply,text)'),'Raid notices must never block combat progress')
  assert.ok(index.includes('const RAID_RUN_STALE_MS=25000'),'stalled Raid runners need a watchdog timeout')
  assert.ok(index.includes("runner travado detectado; substituindo"),'watchdog must replace stalled Raid runners')
  assert.ok(index.includes('if(raidRunCurrent(runKey,token)) raidRuns.delete(runKey)'),'stale runner must not delete its replacement')
  assert.ok(index.includes('raidAutoRetryAt.set(runKey,Date.now()+5000)'),'temporary Raid errors must schedule automatic recovery')
})
