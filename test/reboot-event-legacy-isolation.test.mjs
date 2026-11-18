import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
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
