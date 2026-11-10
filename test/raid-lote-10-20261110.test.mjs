import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {RAID_LOTE_RULES,raidLoteRoom,isRaidLoteState,raidLoteAmount,raidLoteChance,raidLoteFee} from '../src/neon/raid-lote-policy.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const runner=readFileSync(new URL('../src/neon/raid-lote.js',import.meta.url),'utf8')
const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const ledger=readFileSync(new URL('../src/neon/raid-lote-ledger.js',import.meta.url),'utf8')
const region=(src,a,b)=>{const i=src.indexOf(a);assert.ok(i>=0,'Missing '+a);const e=b?src.indexOf(b,i+a.length):-1;return src.slice(i,e>=0?e:undefined)}
const rewards=region(games,'async function finishRaidRewards(', '\nasync function recordPlayerDamage(')
const gameStart=region(games,'export async function startRaid(', '\nasync function finishRaidRewards(')
const create=region(games,'export async function createRaid(', '\nexport async function joinRaid(')
const round=region(games,'export async function raidRound(', '\nasync function ')

test('limit 10 per 24h, 3 manual wins and 10% service fee are fixed and deterministic',()=>{
 assert.equal(RAID_LOTE_RULES.maxAttempts24h,10)
 assert.equal(RAID_LOTE_RULES.maxBatch,10)
 assert.equal(RAID_LOTE_RULES.manualWinsRequired,3)
 assert.equal(raidLoteFee(480000),48000)
 assert.equal(raidLoteFee(390000),39000)
 assert.equal(10*(480000+raidLoteFee(480000)),5280000)
 assert.throws(()=>raidLoteFee(0))
 assert.throws(()=>raidLoteFee(-100))
})

test('rewards are strictly lower for automatic mode and never raise normal ones',()=>{
 const expected={cash:.8,xp:.6,petXp:.6,heroXp:.6,masteryXp:.5,fragments:.4,boxChance:.25,gearChance:.25}
 for(const [key,value] of Object.entries(expected))assert.equal(RAID_LOTE_RULES[key],value,key)
 assert.equal(raidLoteAmount(633600,RAID_LOTE_RULES.cash),506880)
 assert.equal(raidLoteAmount(29000,RAID_LOTE_RULES.xp),17400)
 assert.equal(raidLoteAmount(10,RAID_LOTE_RULES.fragments),4)
 assert.equal(raidLoteAmount(125,RAID_LOTE_RULES.heroXp),75)
 assert.equal(raidLoteAmount(90,RAID_LOTE_RULES.masteryXp),45)
 assert.equal(raidLoteChance(.04,RAID_LOTE_RULES.gearChance),.01)
 assert.equal(raidLoteChance(.55,RAID_LOTE_RULES.boxChance),.1375)
 assert.equal(raidLoteAmount(-100,.8),0)
 assert.throws(()=>raidLoteAmount(100,1.4))
})

test('private room key and storage markers segregate groups and avoid active-manual rewards',()=>{
 const jid='player@example.net',chat=raidLoteRoom(jid)
 assert.equal(chat,'raidlote:player@example.net')
 assert.ok(!chat.endsWith('@g.us'))
 assert.throws(()=>raidLoteRoom('not_a_jid'))
 assert.equal(isRaidLoteState({loteMode:true,loteBatchId:'1234567890'}),true)
 assert.equal(isRaidLoteState({loteMode:false,loteBatchId:'1234567890'}),false)
 assert.match(create,/loteMode:true,loteBatchId:String\(options\.loteBatchId\),loteChat:chat/)
 assert.match(runner,/raidLoteRoom\(s\.jid\)/)
 assert.match(runner,/state\.status==='active'/)
 assert.match(wa,/!isRaidLoteChat\(chat\)/)
 assert.match(wa,/raidLoteEnabled\(\)/)
})

test('startRaid charges only after all preflight validations and in same DB transaction as consuming the key',()=>{
 const before=gameStart.indexOf('const missing=ids.filter(')
 const billing=gameStart.indexOf('await chargeRaidLoteStart(c,s,host,cfg.keyPrice,raidStartedAt)')
 const key=gameStart.indexOf("await c.query('UPDATE inventories SET quantity=quantity-1")
 const active=gameStart.indexOf("s.status='active';s.round=0")
 assert.ok(before>=0&&billing>before&&key>billing&&active>key)
 assert.match(gameStart,/const raidStartedAt=Date\.now\(\)/)
 assert.match(gameStart,/s\.startedAt=raidStartedAt/)
 assert.match(ledger,/SELECT \* FROM raid_lote_sessions WHERE jid=\$1 FOR UPDATE/)
 assert.match(ledger,/SELECT cash,bank FROM wallets WHERE jid=\$1 FOR UPDATE/)
 assert.match(ledger,/pg_try_advisory_lock|raid_lote_attempts\(/)
 assert.match(ledger,/alpha_prefeitura_receipts/)
 assert.match(ledger,/raid_lote_fee/)
})

test('full battle engine is reused, reductions apply to all reward channels only inside loteMode',()=>{
 assert.match(rewards,/const lote=isRaidLoteState\(s\)/)
 for(const key of ['cash','xp','petXp','heroXp','masteryXp','fragments','boxChance','gearChance']){
  assert.ok(rewards.includes('RAID_LOTE_RULES.'+key),'Missing '+key)
 }
 assert.match(rewards,/ownerRaid=lote\?1:/)
 assert.match(rewards,/ownerFragments=lote\?1:/)
 assert.match(rewards,/moneyMultiplier=lote\?1:/)
 assert.match(rewards,/xpMultiplier=lote\?1:/)
 assert.match(rewards,/petXpMultiplier=lote\?1:/)
 assert.match(rewards,/ignoreEventBonuses:lote/)
 assert.match(rewards,/if\(!lote && cfg\.level===60/)
 assert.match(rewards,/if\(!lote && !singleUseGear && cfg\.level===50/)
 assert.match(rewards,/if\(!lote && !singleUseGear && cfg\.level===65/)
 assert.match(games,/s\.loteRewards=/)
 assert.match(round,/s\.status='completed'/)
 assert.match(round,/s\.status='failed'/)
 assert.match(wa,/runRaidCombat\(virtualChat,level,\(\)=>false\)/)
 assert.doesNotMatch(wa,/__alphaStartRaidRun\(virtualChat/)
})

test('worker does not advance a completed run until its attempt is recorded',async()=>{
 const source=runner
  .replace(/^import[^\n]*\n/gm,'')
  .replace(/^export \{[^\n]*\}\s*$/gm,'')
  .replace(/\bexport\s+(?=(?:async |function |const ))/g,'')
 const calls=[]
 const jid='u@example.net',batch='test-batch-1234567890'
 const finished={status:'completed',startedAt:1234,loteBatchId:batch}
 const db={query:async(q)=>{calls.push(['sql',q.slice(0,40)]);return {rows:[{state:finished}]}}}
 const sourceAsScript=source+'\n;globalThis.testHooks={tickOne,raidLoteStatusText}'
 const context={
  db,crypto:{randomUUID:()=>'uuid'},RAID_LOTE_RULES,raidLoteRoom,raidLoteFee,
  getRaidCatalog:()=>[{level:75,keyPrice:480000}],initRaidLoteTables:async()=>{},
  createRaid:async()=>calls.push(['create']),startRaid:async()=>calls.push(['start']),
  cancelRaid:async()=>calls.push(['cancel']),console,Date,
  setInterval:()=>1,clearInterval:()=>{},Object,Number,Math,String,Array,Boolean,
  process:{env:{ALPHA_RAID_LOTE_ENABLED:'1'}},
  setTimeout,Promise
 }
 context.globalThis=context
 vm.runInNewContext(sourceAsScript,context)
 const s={jid,batch_id:batch,name:'Jogador',level:75,requested:2,attempts_started:1,
  victories:1,current_started_at_ms:0,stop_requested:false,status:'running'}
 await context.testHooks.tickOne(s)
 assert.ok(calls.some(x=>x[0]==='create'),'Must create next attempt after previous result persisted')
 assert.ok(calls.some(x=>x[0]==='start'),'Must start next attempt')
})

test('private command, stop flow and final notice are present, no group chat spam',()=>{
 assert.match(wa,/\['raidlote','raidlotes'\]/)
 assert.match(wa,/if\(isGroup\)return await reply\('📩/)
 assert.match(wa,/startRaidLote\(sender,/)
 assert.match(wa,/stopRaidLote\(sender\)/)
 assert.match(wa,/getRaidLoteStatus\(sender\)/)
 assert.match(wa,/if\(!isRaidLoteChat\(chat\)\)void persistRaidFinalNotice/g)
 assert.match(runner,/notifyClosedSessions\(\)/)
 assert.match(runner,/status IN \('completed','failed','stopped'\)/)
 assert.match(runner,/stop_requested/)
})
