import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {bossSettlementSnapshot,weeklyBossResultMessages} from '../src/neon/boss-final-results.js'

const code=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const state={name:'Boss Sintético',maxHp:1000000}
const rewards=[
 {jid:'synthetic_A',name:'Jogador A',position:1,damage:720000,cash:650000,exp:2250,petXp:480,petXpTeam:[{name:'Pet A',xp:480}],drops:[{id:'item_a',name:'Item A',rarity:'Lendário'}]},
 {jid:'synthetic_B',name:'Jogador B',position:2,damage:280000,cash:350000,exp:1600,petXp:220,petXpTeam:[],drops:[]}
]
test('persisted receipt preserves exactly the awarded amounts and all ranking entries',()=>{
 const result=bossSettlementSnapshot(state,rewards)
 assert.equal(result.bossName,'Boss Sintético')
 assert.equal(result.maxHp,1000000)
 assert.deepEqual(result.rewards.map(p=>[p.position,p.damage,p.cash,p.exp]),[[1,720000,650000,2250],[2,280000,350000,1600]])
 assert.deepEqual(result.rewards[0].drops,rewards[0].drops)
 assert.deepEqual(result.rewards[0].petXpTeam,rewards[0].petXpTeam)
})
test('reformatting results is pure, without a duplicate reward',()=>{
 const copy=structuredClone(rewards)
 const a=bossSettlementSnapshot(state,rewards),b=bossSettlementSnapshot(state,rewards)
 assert.deepEqual(a,b)
 assert.deepEqual(rewards,copy)
 const marker={mode:'completed',weeklyCompleted:true,name:state.name,maxHp:state.maxHp,result:a}
 assert.deepEqual(weeklyBossResultMessages(marker,3500),weeklyBossResultMessages(marker,3500))
 assert.match(weeklyBossResultMessages(marker,3500).join('\n'),/Prêmios já creditados/)
})
test('final boss marker is written in the settlement transaction and contains a receipt',()=>{
 assert.match(code,/import \{bossSettlementSnapshot\} from '.\/boss-final-results\.js'/)
 assert.match(code,/completedAt:Date\.now\(\),result:bossSettlementSnapshot\(s,rewards\)/)
 const idx=code.indexOf('result:bossSettlementSnapshot(s,rewards)')
 const save=code.indexOf("await saveGame(c,s.mode==='weekly'?GLOBAL_WEEKLY_BOSS_CHAT:chat,'boss',marker)",idx)
 assert.ok(idx>=0&&save>idx)
 assert.equal((code.match(/result:bossSettlementSnapshot\(s,rewards\)/g)||[]).length,1)
})
