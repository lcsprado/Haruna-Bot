import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pvpFatigueDamage,pvpLevelUpHp,raidLiveCombatHp} from '../src/neon/v2-pvp-hp-policy.js'
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const battle=db.slice(db.indexOf('export async function battle('),db.indexOf('export async function combatLeaderboard('))
test('V2 duel never decides by a round limit; no potion consumption',()=>{
 assert.match(battle,/\(unlimited\|\|round<=20\) && A\.hp>0 && B\.hp>0/)
 assert.match(battle,/const unlimited=classesOnlyRebootEnabled\(\)/)
 assert.doesNotMatch(battle,/pocao_|elixir_supremo|UPDATE inventories|usePotion/)
 assert.match(battle,/preserveHp:unlimited/)
 assert.match(battle,/SELECT jid,hp,max_hp FROM stats/)
})
test('fatigue is absent for 40 attacks and guarantees a KO even with extreme healing',()=>{
 for(let i=1;i<=40;i++)assert.equal(pvpFatigueDamage(i,1000),0)
 assert.equal(pvpFatigueDamage(41,1000),10)
 assert.equal(pvpFatigueDamage(140,1000),1000)
 for(const max of [100,1000,1000000]){
 let hp=max,turn=0
 do{turn++;hp=Math.max(0,hp-pvpFatigueDamage(turn,max));if(hp>0)hp=max}while(hp>0&&turn<150)
 assert.equal(hp,0);assert.equal(turn,140)
 }
})
test('PvP XP level-up keeps current HP; normal XP retains original healing',()=>{
 assert.equal(pvpLevelUpHp(200,1008,true),200)
 assert.equal(pvpLevelUpHp(250,1008,true),250)
 assert.equal(pvpLevelUpHp(200,1008,false),1008)
 assert.equal(pvpLevelUpHp(0,1008,true),0)
})
test('Raid round re-reads live HP and cannot restore pre-duel HP',()=>{
 assert.equal(raidLiveCombatHp(1000,1000,1000,200),200)
 assert.equal(raidLiveCombatHp(1200,1200,1000,200),240)
 assert.equal(raidLiveCombatHp(240,1200,1000,500),600)
 assert.equal(raidLiveCombatHp(1000,1000,1000,0),0)
 assert.equal(raidLiveCombatHp(241,1200,1000,201),241)
 assert.match(games,/p\.hp=raidLiveCombatHp\(p\.hp,p\.maxHp,p\.heroPersistentMaxHp\|\|p\.maxHp,row\.hp\)/)
 assert.match(games,/SELECT jid,hp FROM stats WHERE jid=ANY\(\$1::text\[\]\) ORDER BY jid FOR UPDATE/)
})
