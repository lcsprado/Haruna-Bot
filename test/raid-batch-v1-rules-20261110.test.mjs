import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 RAID_BATCH_POLICY,raidBatchEnabled,validateRaidBatchCount,batchFee,batchReducedAmount,
 batchDropChance,batchChatJid,batchPlan
} from '../src/neon/raid-batch-rules.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const runner=readFileSync(new URL('../src/neon/raid-batch.js',import.meta.url),'utf8')
const ledger=readFileSync(new URL('../src/neon/raid-batch-ledger.js',import.meta.url),'utf8')
const rewardRegion=games.slice(games.indexOf('async function finishRaidRewards('),games.indexOf('\nasync function recordPlayerDamage(',games.indexOf('async function finishRaidRewards(')))

test('V1: limites e taxas nunca aumentam as recompensas da Raid manual',()=>{
 assert.equal(RAID_BATCH_POLICY.maxPer24h,10)
 assert.equal(RAID_BATCH_POLICY.minimumManualWins,3)
 assert.equal(RAID_BATCH_POLICY.feeRate,.10)
 assert.equal(batchReducedAmount(633600,'money'),506880)
 assert.equal(batchReducedAmount(29000,'playerXp'),17400)
 assert.equal(batchReducedAmount(125,'heroXp'),75)
 assert.equal(batchReducedAmount(2800,'petXp'),1680)
 assert.equal(batchReducedAmount(90,'masteryXp'),45)
 assert.equal(batchReducedAmount(10,'fragments'),4)
 assert.equal(batchReducedAmount(7,'fragments'),2)
 assert.equal(batchReducedAmount(1,'fragments'),0)
 assert.equal(batchReducedAmount(-50,'money'),0)
 assert.equal(batchDropChance(.08,'gear'),.02)
 assert.equal(batchDropChance(.55,'box'),.1375)
 assert.throws(()=>batchReducedAmount(10,'xpLivre'))
 assert.throws(()=>batchDropChance(.7,'coins'))
})

test('V1: 10 chaves da Raid 75 e taxas: R$ 5.280.000 sem chaves próprias',()=>{
 assert.deepEqual(batchPlan(480000,10),{
  count:10,keyPrice:480000,feeEach:48000,usedExistingKeys:0,buyKeys:10,
  keySpend:4800000,automationSpend:480000,maximumSpend:5280000
 })
 assert.equal(batchPlan(480000,10,3).maximumSpend,3840000)
 assert.equal(batchPlan(480000,10,10).maximumSpend,480000)
 assert.equal(batchFee(10000),1000)
 assert.equal(batchFee(480000),48000)
 for(const invalid of [-1,0,11,1.5,'abc',NaN]) assert.throws(()=>validateRaidBatchCount(invalid))
 assert.equal(validateRaidBatchCount(1),1)
 assert.equal(validateRaidBatchCount(10),10)
})

test('V1: isolamento entre jogadores e ativação desligada na ausência de env',()=>{
 const a=batchChatJid('test-one@s.whatsapp.net')
 const b=batchChatJid('test-two@s.whatsapp.net')
 assert.notEqual(a,b)
 assert.ok(!a.endsWith('@g.us') && !b.endsWith('@g.us'))
 assert.throws(()=>batchChatJid('no-at'))
 const previous=process.env.ALPHA_RAID_BATCH_ENABLED
 try{
  delete process.env.ALPHA_RAID_BATCH_ENABLED
  assert.equal(raidBatchEnabled(),false)
  process.env.ALPHA_RAID_BATCH_ENABLED='0'
  assert.equal(raidBatchEnabled(),false)
  process.env.ALPHA_RAID_BATCH_ENABLED='1'
  assert.equal(raidBatchEnabled(),true)
 }finally{
  if(previous===undefined)delete process.env.ALPHA_RAID_BATCH_ENABLED
  else process.env.ALPHA_RAID_BATCH_ENABLED=previous
 }
})

test('V1: segurança — a mesma rodada e os mesmos equipamentos do motor manual',()=>{
 assert.match(runner,/await raidRound\(chat,Number\(job.level\)\)/)
 assert.match(runner,/await createRaid\(chat,job.jid,[^\n]*\{batch:\{jobId:Number\(job.id\)\}\}/)
 assert.match(runner,/await startRaid\(chat,job.jid,Number\(job.level\)\)/)
 assert.match(runner,/getRaidStatus\(chat,job.level\)/)
 assert.match(games,/if\(s\.raidBatch\)await startRaidBatchAttempt\(c,s,cfg\)/)
 assert.match(games,/await settleRaidBatchAttempt\(c,s,true,'victory',rewards\)/)
 assert.equal((games.match(/settleRaidBatchAttempt\(c,s,false,'party_wipe'\)/g)||[]).length,2)
 assert.match(games,/settleRaidBatchAttempt\(c,s,false,'timeout'\)/)
 assert.match(games,/if\(batchJob\)\{/)
 assert.match(games,/SELECT \* FROM raid_batch_jobs WHERE id=\$1 AND jid=\$2/)
})

test('V1: XP, prêmio, fragmentos, baús, equipamento e maestria só são reduzidos no lote',()=>{
 assert.match(rewardRegion,/const isBatch=Boolean\(s\.raidBatch\?\.jobId\)/)
 assert.match(rewardRegion,/cash=isBatch\?batchReducedAmount\(/)
 assert.match(rewardRegion,/exp=await halloweenPveXp\(c,p\.jid,isBatch\?batchReducedAmount\(/)
 assert.match(rewardRegion,/xp:isBatch\?batchReducedAmount\(125,'heroXp'\)/)
 assert.match(rewardRegion,/xp:isBatch\?batchReducedAmount\(raid75MasteryAwardXp\(/)
 assert.match(rewardRegion,/ignoreGroupProgressionEvent:isBatch,ignoreXpBoost:isBatch/)
 assert.match(rewardRegion,/skipTemporaryEvents:isBatch/)
 assert.match(rewardRegion,/collabRaidPayout\(creditedToday,p.damage,share\)/)
 assert.match(rewardRegion,/isBatch\?batchReducedAmount\(baseQty,'fragments'\)/)
 assert.match(rewardRegion,/isBatch\)boxChance=batchDropChance\(boxChance,'box'\)/)
 assert.match(rewardRegion,/chance=isBatch\?batchDropChance\(baseGearChance,'gear'\)/)
 assert.match(rewardRegion,/!isBatch&&cfg.level===60/)
 assert.match(rewardRegion,/raid_batch_\$\{cfg.level\}/)
 assert.match(rewardRegion,/moneyMultiplier=isBatch\?1/)
 assert.match(rewardRegion,/xpMultiplier=isBatch\?1/)
})

test('V1: limite móvel de 24h, cobrança única e transferência para a Prefeitura',()=>{
 assert.match(runner,/RAID_BATCH_POLICY\.rollingWindowMs/)
 assert.match(ledger,/raid_batch_attempts a/)
 assert.match(ledger,/ON CONFLICT\(job_id,ordinal\) DO NOTHING RETURNING ordinal/)
 assert.match(ledger,/if\(inserted.rowCount!==1\)throw/)
 assert.match(ledger,/SELECT cash,bank FROM wallets WHERE jid=\$1 FOR UPDATE/)
 assert.match(ledger,/UPDATE wallets SET cash=cash-\$1,bank=bank-\$2/)
 assert.match(ledger,/raid_batch_treasury/)
 assert.match(ledger,/raid_batch_fee/)
 assert.match(ledger,/UPDATE raid_batch_attempts SET status=\$3/)
 assert.match(ledger,/AND status='running'/)
 assert.match(ledger,/throw new Error\('Tentativa de Raid já liquidada/)
})

test('V1: fila persistente, recuperação e comandos habilitados exclusivamente por flag',()=>{
 assert.match(runner,/CREATE TABLE IF NOT EXISTS raid_batch_jobs/)
 assert.match(runner,/raid_batch_one_active_per_player/)
 assert.match(runner,/FOR UPDATE SKIP LOCKED/)
 assert.match(runner,/claim_token/)
 assert.match(runner,/getRaidStatus\(chat,job.level\)/)
 assert.match(runner,/notification_attempted/)
 assert.match(bot,/await initRaidBatch\(\)/)
 assert.match(bot,/startRaidBatchScheduler\(/)
 assert.match(bot,/raidBatchStatus\(sender\)/)
 assert.match(bot,/cancelRaidBatch\(sender\)/)
 assert.match(bot,/raidBatchHistory\(sender\)/)
 assert.match(bot,/queueRaidBatch\(sender,level,amount\)/)
 assert.doesNotMatch(runner,/process\.env\.ALPHA_RAID_BATCH_ENABLED\s*=\s*['"]1/)
})
