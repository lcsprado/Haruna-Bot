import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {rebootWeeklyBossReward} from '../src/neon/weekly-golem-payouts.js'
import {weeklyBossCashPoolShares} from '../src/neon/weekly-boss-prize-pool.js'
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('V2 não inicia Bingo e leilões históricos nem recria bônus do grupo após reset',()=>{
 const s=source('src/neon/index.js')
 assert.match(s,/if\(!classesOnlyRebootEnabled\(\)\)\{\nstartAuctionAlphaScheduler\(sock\)\nstartAuctionAlphaScheduler1500\(sock\)\nstartAuctionNotificationPilot\(sock\)\n\}/)
 assert.match(s,/if\(!classesOnlyRebootEnabled\(\)\)\{\nstartBingoRebootScheduler\(sock\)[\s\S]*?startBingoNov16Scheduler\(sock\)\n\}/)
 assert.equal(s.split('if(classesOnlyRebootEnabled()||temporaryRecoveryMode)return // evento antigo').length,3)
 assert.match(s,/if\(!classesOnlyRebootEnabled\(\)\)\{\nif\(await handleBingoNov16Command/)
 assert.match(s,/if\(!classesOnlyRebootEnabled\(\)\)\{\nif\(await handleAuctionNotificationPilotCommand/)
 assert.match(s,/if\(!classesOnlyRebootEnabled\(\)&&\['leilao','lance','leilaoteste','lanceteste'\]/)
})
test('comandos tradicionais convergem para V2, sem passar pela compra legada',()=>{
 const s=source('src/neon/reboot-events-whatsapp.js')
 assert.match(s,/bingo:'bingov2',cartela:'cartelav2',leilao:'leilaov2',lance:'lancev2'/)
 assert.ok(s.indexOf('cmd=rebootEventCommand(cmd)')<s.indexOf('await getGroupLicense(chat)'))
 assert.ok(s.indexOf('await getGroupLicense(chat)')<s.indexOf('await buyBingoV2Ticket(db,sender)'))
})
test('Superboss V2 distribui no máximo R$40 mil inclusive em data anterior ao corte legado',()=>{
 const old=process.env.ALPHA_REBOOT_MODE,players=[{jid:'a',damage:60},{jid:'b',damage:40}]
 try{
  delete process.env.ALPHA_REBOOT_MODE
  assert.equal(weeklyBossCashPoolShares('2026-11-13',players),null)
  assert.equal([...weeklyBossCashPoolShares('2026-11-20',players).values()].reduce((a,b)=>a+b,0),50000000)
  process.env.ALPHA_REBOOT_MODE='classes_only'
  assert.deepEqual([...weeklyBossCashPoolShares('2026-11-13',players).values()],[24000,16000])
  assert.deepEqual([...weeklyBossCashPoolShares('2026-11-20',players).values()],[24000,16000])
  assert.equal(weeklyBossCashPoolShares('invalid',players),null)
 }finally{if(old===undefined)delete process.env.ALPHA_REBOOT_MODE;else process.env.ALPHA_REBOOT_MODE=old}
})
test('prêmios especiais legados do Golem não são concedidos na V2',()=>{
 const s=source('src/neon/games.js')
 assert.match(s,/specialNov13=!rebootEconomyEnabled\(\)&&/)
 assert.equal(s.split('if(!rebootEconomyEnabled()&&weeklyGolemV2Choice').length,3)
 assert.match(s,/legendaryBoxes=weekly&&!rebootEconomyEnabled\(\)\?weeklyGolemLegendaryBoxCount/)
})

test('Superboss V2: XP proporcional, caixas limitadas e chance exclusiva sem bônus de pet',()=>{
 const reward=(position,damage,totalDamage)=>rebootWeeklyBossReward({position,damage,totalDamage,weekendKey:'2026-11-20'})
 assert.deepEqual(reward(1,1_000_000,1_000_000),{xp:4000,box:'caixa_epica',exclusiveChance:.05})
 const rows=[reward(1,400_000,1_000_000),reward(2,300_000,1_000_000),reward(3,200_000,1_000_000),reward(4,100_000,1_000_000)]
 assert.equal(rows.reduce((sum,r)=>sum+r.xp,0),6000-500)
 assert.deepEqual(rows.map(r=>r.box),['caixa_epica','caixa_rara','caixa_rara','caixa_sorte'])
 assert.deepEqual(reward(2,49_999,1_000_000),{xp:149,box:null,exclusiveChance:0})
 assert.equal(reward(6,100_000,1_000_000).box,null)
 assert.equal(reward(1,9999,9999).box,null)
 for(const [d,total] of [[0,100],[-1,100],[101,100],[Infinity,100],[1,0]])assert.equal(reward(1,d,total).xp,0)
 assert.equal(rebootWeeklyBossReward({position:1,damage:100,totalDamage:100,weekendKey:'invalid'}).xp,0)
})
test('Superboss V2 usa prêmio novo na liquidação e não multiplica XP pelo evento antigo',()=>{
 const s=source('src/neon/games.js')
 assert.match(s,/cash=v2Reward\?\(weeklyCashShares\?\.get\(p\.jid\)\|\|0\):weeklyCashShares===null/)
 assert.match(s,/exp=v2Reward\?v2Reward\.xp:Math\.floor/)
 assert.match(s,/v2Reward\?exp:await halloweenPveXp/)
 assert.match(s,/if\(v2Reward\)\{[\s\S]*?\}else drops=weekly\?await giveBossDrops/)
 assert.match(source('src/neon/index.js'),/classesOnlyRebootEnabled\(\)\?'🏆 Superboss 2\.0/)
})
