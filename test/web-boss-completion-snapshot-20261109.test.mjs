import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {bossSettlementSnapshot,weeklyBossResultMessages} from '../src/neon/boss-final-results.js'

const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const start=source.indexOf('export async function attackBoss(')
const end=source.indexOf('\nexport ',start+20)
const boss=source.slice(start,end<0?undefined:end)

const state=()=>({name:'Titã do Caos',maxHp:13500000,mode:'weekly',weekendKey:'2026-W46'})
const players=()=>[
 {jid:'unit-a',name:'Jogador A',position:1,damage:261192,cash:293067,exp:8954,petXp:1500,petXpTeam:[{species:'fenix_alpha',xp:500}],drops:[{id:'chave',name:'Chave de Raid',quantity:1}]},
 {jid:'unit-b',name:'Jogador B',position:2,damage:109000,cash:80000,exp:1000,petXp:0,petXpTeam:[],drops:[]}
]

test('snapshot persistente de Boss conserva colocação, dano, XP, dinheiro e drops, sem criar pagamento',()=>{
 const sourcePlayers=players()
 const snapshot=bossSettlementSnapshot(state(),sourcePlayers)
 assert.equal(snapshot.bossName,'Titã do Caos')
 assert.equal(snapshot.maxHp,13500000)
 assert.equal(snapshot.rewards.length,2)
 assert.deepEqual(snapshot.rewards[0],sourcePlayers[0])
 assert.deepEqual(snapshot.rewards[1],sourcePlayers[1])
 assert.deepEqual(bossSettlementSnapshot(state(),sourcePlayers),snapshot,'resultado deve ser determinístico')
 assert.equal(sourcePlayers[0].cash,293067)
 assert.equal(sourcePlayers[0].exp,8954)
})

test('snapshot não altera os objetos de prêmio recebidos',()=>{
 const sourcePlayers=players()
 const before=structuredClone(sourcePlayers)
 const s=state()
 const existing=structuredClone(s)
 bossSettlementSnapshot(s,sourcePlayers)
 assert.deepEqual(sourcePlayers,before)
 assert.deepEqual(s,existing)
})

test('Boss comum e semanal salvam resultado na mesma transação que liquida recompensas',()=>{
 assert.ok(start>=0)
 const marker="const marker={mode:'completed'"
 const a=boss.indexOf(marker)
 assert.ok(a>=0)
 const block=boss.slice(a,a+700)
 assert.match(block,/completedAt:Date\.now\(\)/)
 assert.match(block,/result:bossSettlementSnapshot\(s,rewards\)/)
 assert.match(block,/await saveGame\(c,s\.mode==='weekly'\?GLOBAL_WEEKLY_BOSS_CHAT:chat,'boss',marker\)/)
 assert.match(source,/import \{bossSettlementSnapshot\} from '\.\/boss-final-results\.js'/)
 assert.equal((boss.match(/bossSettlementSnapshot\(s,rewards\)/g)||[]).length,1)
 assert.match(boss,/return retryBossDeadlock\(\(\)=>tx\(async c=>\{/)
})

test('Boss de evento mantém a lógica antiga de resultado sem pagamento adicional',()=>{
 const a=boss.indexOf("if(s.mode==='event'){",boss.indexOf('if(s.hp<=0)'))
 assert.ok(a>=0)
 const eventBranch=boss.slice(a,boss.indexOf('}else{',a))
 assert.match(eventBranch,/result:\{bossName:s\.name,maxHp:Number\(s\.maxHp\|\|0\)/)
 assert.match(eventBranch,/rewards:rewards\.map\(p=>\(/)
 assert.match(eventBranch,/await saveGame\(c,GLOBAL_BOSS_EVENT_CHAT,'boss_event',marker\)/)
})

test('mensagem reapresentada a partir do snapshot não credita recompensas',()=>{
 const s={...state(),mode:'completed',weeklyCompleted:true,result:bossSettlementSnapshot(state(),players())}
 const first=weeklyBossResultMessages(s)
 const second=weeklyBossResultMessages(s)
 assert.ok(first.length>0)
 assert.deepEqual(first,second)
 assert.ok(first.join('').includes('Prêmios já creditados'))
 assert.equal(weeklyBossResultMessages({...s,weeklyCompleted:false}).length,0)
})
