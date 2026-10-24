import test from 'node:test'
import assert from 'node:assert/strict'
import {SATURDAY_HUNT,saturdayRaidXpMultiplier} from '../src/neon/raid-saturday-hunt.js'
import {readFileSync} from 'node:fs'
test('sábado 24/10 19h–21h Brasília, duração exata',()=>{
  assert.equal(new Date(SATURDAY_HUNT.startsAt).toISOString(),'2026-10-24T22:00:00.000Z')
  assert.equal(new Date(SATURDAY_HUNT.endsAt).toISOString(),'2026-10-25T00:00:00.000Z')
  assert.equal(SATURDAY_HUNT.endsAt-SATURDAY_HUNT.startsAt,7200000)
})
test('somente Raids 50/60/65/70 e somente vitórias na janela',()=>{
  for(const lv of [50,60,65,70]){
    assert.equal(saturdayRaidXpMultiplier(lv,SATURDAY_HUNT.startsAt-1),1)
    assert.equal(saturdayRaidXpMultiplier(lv,SATURDAY_HUNT.startsAt),1.5)
    assert.equal(saturdayRaidXpMultiplier(lv,SATURDAY_HUNT.endsAt-1),1.5)
    assert.equal(saturdayRaidXpMultiplier(lv,SATURDAY_HUNT.endsAt),1)
  }
  for(const lv of [10,15,20,25,30,40,55,75,100])assert.equal(saturdayRaidXpMultiplier(lv,SATURDAY_HUNT.startsAt),1)
})
test('dinheiro, pets e drops intactos, sem acumular o XP',()=>{
  const game=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(game,/const saturdayXp=saturdayRaidXpMultiplier\(cfg.level,now\)/)
  assert.match(game,/const xpMultiplier=Math.max\(/)
  assert.match(game,/const moneyMultiplier=raidGoldHour\?2:\(cacadaActive\?1\.25:1\)/)
  assert.match(game,/const petXpMultiplier=raidEventActive\?1\.5:\(cacadaActive\?1\.25:1\)/)
  assert.match(game,/saturdayHuntActive:saturdayXp>1/)
})
test('notificações sem polling e marcação persistente após sucesso',()=>{
  const script=readFileSync(new URL('../src/neon/raid-saturday-hunt.js',import.meta.url),'utf8')
  assert.doesNotMatch(script,/setInterval/)
  assert.match(script,/await sock\.sendMessage\(/)
  assert.match(script,/ON CONFLICT\(key\) DO NOTHING/)
})