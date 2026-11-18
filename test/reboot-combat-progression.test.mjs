import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {v2XpCredit,reserveV2DailyXp,brazilProgressionDay,V2_CLASS_GROWTH,V2_PVP_ROLES,effectiveAwakeningTier,V2_RAID_DIFFICULTY} from '../src/neon/reboot-combat-progression.js'
import {candidateRaidConfig} from '../src/neon/reboot-economy-policy.js'
test('ganho inicial integral, extra a 25%, teto diário e bônus contabilizado no mesmo limite',()=>{
 assert.equal(v2XpCredit(0,8000).awarded,8000)
 assert.equal(v2XpCredit(8000,4000).awarded,1000)
 assert.equal(v2XpCredit(7900,1100).awarded,350)
 assert.equal(v2XpCredit(11900,4000,1200).awarded,100)
 assert.equal(v2XpCredit(12000,999999,999).awarded,0)
 assert.deepEqual(v2XpCredit(7990,10,100),{base:10,bonus:25,awarded:35,used:8025,cap:12000})
 assert.throws(()=>v2XpCredit(-1,5),/inválido/)
})
test('mesma chave por jogador em WA/Web, meia-noite Brasil e nenhuma nova linha para cada dia',async()=>{
 const state=new Map(),calls=[]
 const client={query:async(sql,params)=>{calls.push(sql);if(sql.startsWith('SELECT'))return {rows:state.has(params[0])?[{value:state.get(params[0])}]:[]};state.set(params[0],JSON.parse(params[1]));return {rows:[]}}}
 assert.equal(brazilProgressionDay(new Date('2026-11-18T02:59:00Z')),'2026-11-17')
 assert.equal(brazilProgressionDay(new Date('2026-11-18T03:00:00Z')),'2026-11-18')
 assert.equal((await reserveV2DailyXp(client,'a',8000,0,{day:'2026-11-18'})).awarded,8000)
 assert.equal((await reserveV2DailyXp(client,'a',16000,0,{day:'2026-11-18'})).awarded,4000)
 const writes=calls.filter(s=>s.startsWith('INSERT')).length
 assert.equal((await reserveV2DailyXp(client,'a',8000,0,{day:'2026-11-18'})).awarded,0)
 assert.equal(calls.filter(s=>s.startsWith('INSERT')).length,writes)
 assert.equal((await reserveV2DailyXp(client,'b',8000,0,{day:'2026-11-18'})).awarded,8000)
 assert.equal((await reserveV2DailyXp(client,'a',8000,0,{day:'2026-11-19'})).awarded,8000)
 assert.equal(state.size,2)
})
test('quatro papéis distintos sem bônus de collab e Despertar acessível até Nv100',()=>{
 assert.equal(Object.keys(V2_CLASS_GROWTH).length,4)
 assert.ok(V2_CLASS_GROWTH.paladin.hp>V2_CLASS_GROWTH.necromancer.hp)
 assert.ok(V2_CLASS_GROWTH.paladin.def>V2_CLASS_GROWTH.samurai.def)
 assert.ok(V2_CLASS_GROWTH.berserker.atk>V2_CLASS_GROWTH.samurai.atk)
 assert.ok(V2_CLASS_GROWTH.samurai.spd>V2_CLASS_GROWTH.berserker.spd)
 assert.ok(V2_PVP_ROLES.necromancer.defense>V2_PVP_ROLES.berserker.defense)
 const tier={stage:5,level:300,cost:5000000,hp:80}
 assert.equal(effectiveAwakeningTier(tier,{enabled:false}),tier)
 assert.deepEqual(effectiveAwakeningTier(tier,{enabled:true}),{stage:5,level:100,cost:120000,hp:80,mult:5,raidMin:60})
})
test('Raids de entrada mais acessíveis, dificuldade crescente e Raid70 preservada',()=>{
 const rows=Object.entries(V2_RAID_DIFFICULTY)
 for(let i=1;i<rows.length;i++){assert.ok(rows[i][1].hp>rows[i-1][1].hp);assert.ok(rows[i][1].atk>rows[i-1][1].atk)}
 const original={level:10,hp:13000,atk:15}
 assert.equal(candidateRaidConfig(original,{enabled:false}),original)
 assert.equal(candidateRaidConfig(original,{enabled:true}).hp,9500)
 const end=candidateRaidConfig({level:70},{enabled:true})
 assert.equal(end.hp,1600000);assert.equal(end.minPlayers,3);assert.equal(end.minLevel,90)
})
test('XP/boost e Despertar usam regras comuns sem exceções pessoais; dungeon usa classe real',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 assert.match(db,/dailyXp=await reserveV2DailyXp\(client,jid,eventGain,bonusXp\)/)
 assert.match(db,/eventGain=dailyXp.base\s+bonusXp=dailyXp.bonus/)
 assert.ok(db.indexOf('dailyXp=await reserveV2DailyXp')<db.indexOf("UPDATE alpha_xp_boosts SET bonus_remaining=bonus_remaining-$1"))
 assert.match(db,/classLevelAdvance\(cr.level,cr.xp,eventGain\+bonusXp\)/)
 assert.match(db,/classesOnlyRebootEnabled\(\)\?row.class_level:row.level/)
 const aw=readFileSync(new URL('../src/neon/awakening.js',import.meta.url),'utf8')
 assert.match(aw,/tier=effectiveAwakeningTier/)
 assert.match(aw,/personalProtection=!classesOnlyRebootEnabled\(\)/)
 assert.match(aw,/recoveredQuests=!classesOnlyRebootEnabled\(\)/)
})
