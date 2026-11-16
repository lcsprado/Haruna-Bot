import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {COLLAB_FRAGMENT_ITEM,COLLAB_RAID_FRAGMENTS_PER_WIN} from '../src/neon/collab-fragment-rules.js'
import {BLEACH_RAID_ID,BLEACH_FRAGMENT_ITEM,BLEACH_KEY_ITEM,
 NAMED_COLLAB_RAIDS,BLEACH_FRAGMENTS_DAILY_CAP,BLEACH_FRAGMENTS_PER_WIN,
 namedCollabRaid,raidSelection,raidPublicName,raidPublicArg,raidPhase,
 bleachRaidFragmentCredit,bleachRaidDailyKey} from '../src/neon/named-collab-raids.js'
const code=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const g=code('../src/neon/games.js'),d=code('../src/neon/db.js'),i=code('../src/neon/index.js')
test('existing Raid 75 and numeric selectors stay unchanged; named Bleach is exclusive',()=>{
 const regular=[10,15,20,25,30,40,50,60,65,70,75]
  .map(level=>({level,name:'Raid '+level}))
 const catalog=[...regular,...NAMED_COLLAB_RAIDS]
 for(const level of regular.map(x=>x.level))assert.equal(raidSelection(String(level),catalog),level)
 for(const [alias,level] of [['1',10],['2',15],['11',75],['pecados',75],
  ['7pecados',75],['setepecados',75],['collab',75],['bleach',76],['BLEACH',76]]){
  assert.equal(raidSelection(alias,catalog),level,alias)
 }
 for(const invalid of ['12','76','raidcollab','naruto','bleach 75','0','abc','99'])
  assert.equal(raidSelection(invalid,catalog),0,invalid)
 assert.equal(raidSelection('',catalog),0)
 assert.equal(raidPublicArg(NAMED_COLLAB_RAIDS[0]),'bleach')
 assert.equal(raidPublicName(NAMED_COLLAB_RAIDS[0]),'Raid Bleach')
 assert.equal(raidPublicName({level:75}),'Raid Lv.75')
 assert.equal(namedCollabRaid('bleach')?.slug,'bleach')
 assert.equal(namedCollabRaid('naruto'),null)
});
test('Aizen has exactly 3 automatic phases; no phase HP reset or class bonus',()=>{
 const c=NAMED_COLLAB_RAIDS[0];
 assert.equal(c.level,BLEACH_RAID_ID)
 assert.equal(c.slug,'bleach')
 assert.equal(c.minLevel,70)
 assert.equal(c.phases.length,3)
 const hp=1350000
 const checks=[[hp,1],[hp*.66+.1,1],[hp*.66,2],[hp*.5,2],[hp*.33+.1,2],[hp*.33,3],[1,3],[0,3]]
 for(const [remaining,expected] of checks)assert.equal(raidPhase(c,remaining,hp).index,expected)
 assert.equal(raidPhase({level:75},100,100),null)
 assert.deepEqual(c.phases.map(p=>p.index),[1,2,3])
 assert.ok(c.phases.every(p=>p.attackMultiplier>=1&&p.attackMultiplier<=1.2))
 assert.ok(c.phases.every(p=>p.specialChance>=.2&&p.specialChance<=.35))
 assert.deepEqual(NAMED_COLLAB_RAIDS.map(x=>x.slug),['bleach'])
});
test('Bleach fragment economy is separate, bounded, and refuses zero participation',()=>{
 assert.notEqual(BLEACH_FRAGMENT_ITEM,COLLAB_FRAGMENT_ITEM)
 assert.equal(BLEACH_FRAGMENTS_PER_WIN,8)
 assert.equal(COLLAB_RAID_FRAGMENTS_PER_WIN,10)
 assert.equal(BLEACH_FRAGMENTS_DAILY_CAP,48)
 const qualified={damage:100000,share:.08}
 for(const [earned,qty] of [[0,8],[8,8],[40,8],[41,7],[47,1],[48,0],[99,0]]){
  assert.equal(bleachRaidFragmentCredit({dayEarned:earned,...qualified}),qty)
 }
 assert.equal(bleachRaidFragmentCredit({dayEarned:0,damage:24999,share:.50}),0)
 assert.equal(bleachRaidFragmentCredit({dayEarned:0,damage:30000,share:.024}),0)
 assert.throws(()=>bleachRaidFragmentCredit({dayEarned:-1,...qualified}))
 assert.equal(bleachRaidDailyKey('user',Date.parse('2026-11-17T02:59:59Z')),
  'bleach_raid_fragments_daily:2026-11-16:user')
 assert.equal(bleachRaidDailyKey('user',Date.parse('2026-11-17T03:00:00Z')),
  'bleach_raid_fragments_daily:2026-11-17:user')
});
test('real raid engine uses unique key, isolated JSONB room and payout path',()=>{
 assert.match(g,/level:75,name:'Raid dos Sete Pecados — Abismo Sagrado',collab:true,minLevel:70,hp:1150000,atk:285/)
 assert.match(g,/const RAID_CONFIGS=\[/)
 assert.match(g,/\.\.\.NAMED_COLLAB_RAIDS/)
 assert.match(g,/const raidGameType=level=>\x60raid:\$\{Number\(level\)\}\x60/)
 assert.match(g,/if\(cfg.slug==='bleach'\)/)
 assert.match(g,/bleachRaidDailyKey\(p.jid,now\)/)
 assert.match(g,/bleachRaidFragmentCredit\(\{dayEarned:current,damage:p.damage,share\}\)/)
 assert.match(g,/else if\(cfg.collab\)/)
 assert.match(g,/const dailyKey='collab_raid_fragments_daily:'\+day\+':'\+p.jid/)
 assert.match(g,/const nextPhase=raidPhase\(cfg,s.hp,s.maxHp\)/)
 assert.match(g,/s.phaseIndex=nextPhase.index/)
 assert.match(g,/bossEffectiveAtk=Math.round\(cfg.atk\*\(nextPhase\?\.attackMultiplier\|\|1\)\)/)
 assert.match(g,/phaseTransition,events/)
 assert.match(d,/chave_raid_bleach/)
 assert.match(d,/fragmento_reiatsu_bleach/)
 assert.match(d,/sellable=FALSE,stackable=TRUE,price=0 WHERE id='fragmento_reiatsu_bleach'/)
});
test('command routes use literal named raid and preserve automation, existing Raid 75 remains',()=>{
 assert.match(i,/import \{raidSelection,raidPublicName,raidPublicArg\} from '\.\/named-collab-raids\.js'/)
 assert.match(i,/raidSelection\(value,raidCatalog\)/)
 assert.match(i,/raidSelection\(args\[0\],catalog\)/)
 assert.match(i,/!raid bleach/)
 assert.match(i,/!entrar bleach/)
 assert.match(i,/!go bleach/)
 assert.match(i,/r\.phaseTransition/)
 assert.match(i,/safeRaidNotify\(reply,/)
 assert.match(i,/runRaidCombat\(chat,Number\(r.level\),reply\)/)
 assert.doesNotMatch(i,/cmd==='raidcollab'/)
 assert.match(i,/if\(cfg\?\.slug\)return await reply\('⚔️ O !raidlote/)
 assert.match(g,/if\(loteAttemptId&&raidConfig\(level\)\?\.slug\)throw new Error/)
 assert.match(i,/!raid pecados/)
 // Per-player Raid membership and one-time keys cannot be bypassed by custom raids.
 assert.match(g,/resolveGlobalPlayerRaid\(c,host\)/)
 assert.match(g,/resolveGlobalPlayerRaid\(c,jid\)/)
 assert.match(g,/item_id=\$2 FOR UPDATE/)
 assert.match(g,/UPDATE inventories SET quantity=quantity-1 WHERE jid=ANY/)
});


test('named lobby diagnostics never suggest numeric internal id to a player',async()=>{
 const {raidGoUnavailableMessage,raidJoinUnavailableMessage}=await import('../src/neon/raid-go-diagnostics.js')
 const room={
  level:BLEACH_RAID_ID,slug:'bleach',gameType:'raid:'+BLEACH_RAID_ID,
  status:'lobby',host:'augusto',hostName:'Augusto',
  players:{augusto:{jid:'augusto'}},createdAt:Date.now(),
  expiresAt:Date.now()+15*60000
 }
 const go=raidGoUnavailableMessage({rooms:[room],sender:'lp',level:BLEACH_RAID_ID})
 assert.match(go,/Raid Bleach/)
 assert.match(go,/!entrar bleach/)
 assert.match(go,/!go bleach/)
 assert.doesNotMatch(go,/!entrar 76|!go 76|Raid Lv\.76/)
 const j=raidJoinUnavailableMessage({rooms:[room],level:BLEACH_RAID_ID})
 assert.match(j,/!entrar bleach/)
 const existing=raidGoUnavailableMessage({rooms:[{...room,level:75,slug:null}],sender:'lp',level:75})
 assert.match(existing,/!go 75/)
 assert.match(existing,/!entrar 75/)
 const expired=raidJoinUnavailableMessage({rooms:[{...room,expiresAt:Date.now()-1}],level:BLEACH_RAID_ID})
 assert.match(expired,/!raid bleach/)
 assert.match(expired,/!entrar bleach/)
});
