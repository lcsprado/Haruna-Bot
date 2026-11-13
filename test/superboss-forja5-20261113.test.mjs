import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 WEEKLY_GOLEM_V2_KEY,WEEKLY_GOLEM_V2_MIN_DAMAGE,WEEKLY_GOLEM_V2_GEAR,
 WEEKLY_GOLEM_V2_GEAR_IDS,WEEKLY_GOLEM_V2_VOUCHER,
 weeklyGolemV2Cash,weeklyGolemV2Choice,weeklyGolemV2GearSelection,
 weeklyGolemV2Ranking
} from '../src/neon/weekly-golem-v2-20261113.js'
import {weeklyBossResultMessages} from '../src/neon/boss-final-results.js'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const money=(rank,damage=100_000,key=WEEKLY_GOLEM_V2_KEY)=>
 weeklyGolemV2Cash({weekendKey:key,position:rank,damage})

test('três prêmios exclusivos, uma arma, armadura e elmo, com IDs únicos e não confundidos com os antigos',()=>{
 assert.equal(WEEKLY_GOLEM_V2_GEAR.length,3)
 assert.deepEqual(WEEKLY_GOLEM_V2_GEAR.map(x=>x.category),['weapon','armor','helmet'])
 assert.equal(new Set(WEEKLY_GOLEM_V2_GEAR_IDS).size,3)
 assert.ok(WEEKLY_GOLEM_V2_GEAR.every(x=>x.description.includes('★★★★★')&&x.description.includes('Lv.10')))
 assert.notEqual(WEEKLY_GOLEM_V2_VOUCHER,WEEKLY_GOLEM_V2_GEAR[0].id)
 assert.deepEqual(WEEKLY_GOLEM_V2_GEAR.map(x=>[x.atk,x.def,x.hp]),[[220,80,0],[0,190,550],[0,135,420]])
})
test('dinheiro grande para todos com 10 mil de dano, inclusive quem fica fora do Top 5',()=>{
 assert.equal(WEEKLY_GOLEM_V2_MIN_DAMAGE,10_000)
 assert.deepEqual([1,2,3,4,5,6,11].map(i=>money(i)),[12_000_000,10_000_000,8_000_000,6_000_000,5_000_000,3_000_000,3_000_000])
 assert.equal(money(1,9999),0)
 assert.equal(money(6,10000),3_000_000)
 assert.equal(money(0),0)
 assert.equal(money(1,100000,'2026-11-06'),0)
 assert.equal(money(1,-2),0)
})
test('somente primeiro e segundo podem escolher um equipamento, sem sorteio',()=>{
 assert.equal(weeklyGolemV2Choice({weekendKey:WEEKLY_GOLEM_V2_KEY,position:1,damage:10000}),true)
 assert.equal(weeklyGolemV2Choice({weekendKey:WEEKLY_GOLEM_V2_KEY,position:2,damage:10000}),true)
 assert.equal(weeklyGolemV2Choice({weekendKey:WEEKLY_GOLEM_V2_KEY,position:3,damage:1e8}),false)
 assert.equal(weeklyGolemV2Choice({weekendKey:WEEKLY_GOLEM_V2_KEY,position:1,damage:9999}),false)
 for(let i=1;i<=3;i++)assert.equal(weeklyGolemV2GearSelection(i),WEEKLY_GOLEM_V2_GEAR[i-1])
 assert.equal(weeklyGolemV2GearSelection(4),null)
 assert.equal(weeklyGolemV2GearSelection('1.2'),null)
})
test('ranking usa dano total persistido e desempate determinístico',()=>{
 const r=weeklyGolemV2Ranking({z:{name:'Z',damage:70000},a:{name:'A',damage:70000},b:{name:'B',damage:20000}})
 assert.deepEqual(r.map(x=>x.jid),['a','z','b'])
})
test('entrega atômica de vale -> equipamento Forja 5 Lv10 sem doadores',()=>{
 assert.match(games,/export async function claimWeeklyGolemChoice/)
 assert.match(games,/SELECT quantity FROM inventories WHERE jid=\$1 AND item_id=\$2 FOR UPDATE/)
 assert.match(games,/DELETE FROM inventories WHERE jid=\$1 AND item_id=\$2 AND quantity=1 RETURNING 1/)
 assert.match(games,/INSERT INTO equipment_star_forges\(jid,item_id,stars,level,updated_at\)/)
 assert.match(games,/VALUES\(\$1,\$2,5,10,EXTRACT/)
 assert.match(games,/await syncEffectiveGear\(c,jid,gear\.id\)/)
 assert.match(db,/WEEKLY_GOLEM_V2_GEAR_IDS\.includes\(itemId\)/)
 assert.match(db,/starterItems\.push\(\.\.\.WEEKLY_GOLEM_V2_GEAR/)
 assert.match(db,/helmet_stars:Number\(h\.stars\|\|1\)/)
})
test('morreu ou venceu: bônus extra e vale inseridos na transação normal; não invade Boss comum',()=>{
 assert.match(games,/weekly\?weeklyGolemV2Cash\(\{weekendKey:s\.weekendKey,position,damage:p\.damage\}\):0/)
 assert.match(games,/weeklyGolemV2Choice\(\{weekendKey:s\.weekendKey,position,damage:p\.damage\}\)/)
 assert.match(games,/await grantWeeklyGolemChoice\(c,p\.jid\)/)
 assert.match(games,/if\(s\.hp<=0\)\{\s*const entries=Object\.entries\(s\.participants\)/)
})
test('se o Golem sobreviver, a liquidação não reinicia Boss nem duplica pagamentos',()=>{
 const code=games.split('export async function settleExpiredWeeklyBoss(')[1]?.split('export async function getWeeklyGolemChoiceStatus(')[0]||''
 assert.match(code,/loadGame\(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss'\)/)
 assert.match(code,/s\.mode!=='weekly'/)
 assert.match(code,/nowMs<=Number\(s\.endsAt\|\|0\)/)
 assert.match(code,/const entries=weeklyGolemV2Ranking\(s\.participants\)/)
 assert.match(code,/await credit\(c,p\.jid,cash,'boss_weekend_timeout_20261113'\)/)
 assert.match(code,/weeklyGolemV2Choice/)
 assert.match(code,/mode:'completed'/)
 assert.match(code,/defeated:false/)
 assert.match(code,/await saveGame\(c,GLOBAL_WEEKLY_BOSS_CHAT,'boss',marker\)/)
 assert.match(index,/settleExpiredWeeklyBoss\(\)\.then/)
})
test('mensagem de fim por prazo não diz que Boss foi derrotado',()=>{
 const msg=weeklyBossResultMessages({mode:'completed',weeklyCompleted:true,name:'Golem Ancestral',
  hp:100,maxHp:1000,result:{defeated:false,remainingHp:100,rewards:[
   {position:1,name:'Alpha',damage:900,cash:12_000_000,exp:0,drops:[{name:'Direito de Escolha'}]}
  ]}}).join('\n')
 assert.match(msg,/ENCERRADO POR PRAZO/)
 assert.doesNotMatch(msg,/DERROTADO!/)
 assert.match(msg,/12\.000\.000/)
 assert.match(msg,/Direito de Escolha/)
})
test('comandos para escolha e anúncio acessíveis no WhatsApp',()=>{
 assert.match(index,/golempremio','premiogolem/)
 assert.match(index,/await claimWeeklyGolemChoice\(sender,choice\)/)
 assert.match(index,/golem-v2-forja5-20261113/)
 assert.match(index,/golemRewards/)
})
