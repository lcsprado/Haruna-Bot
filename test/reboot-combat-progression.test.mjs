import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {v2DailyXpStatus,v2XpCredit,reserveV2DailyXp,brazilProgressionDay,v2HourlyXpRate,V2_CLASS_GROWTH,V2_PVP_ROLES,effectiveAwakeningTier,V2_RAID_DIFFICULTY} from '../src/neon/reboot-combat-progression.js'
import {candidateRaidConfig} from '../src/neon/reboot-economy-policy.js'
import {raidLoteReward} from '../src/neon/raid-lote-policy.js'
test('V2: 100% dia, 70% madrugada e XP ilimitado inclusive acima de 12 mil',()=>{
 const day=new Date('2026-11-21T09:00:00Z') // 06h00 Brasilia
 const night=new Date('2026-11-21T03:00:00Z') // 00h00 Brasilia
 assert.equal(v2HourlyXpRate(new Date('2026-11-21T02:59:59Z')),1) // 23h59
 assert.equal(v2HourlyXpRate(night),.7)
 assert.equal(v2HourlyXpRate(new Date('2026-11-21T08:59:59Z')),.7) // 05h59
 assert.equal(v2HourlyXpRate(day),1)
 assert.equal(v2XpCredit(0,1000,100,{now:day}).awarded,1100)
 assert.deepEqual(v2XpCredit(0,1000,100,{now:night}),{base:700,bonus:70,awarded:770,used:770,cap:null,rate:.7})
 assert.equal(v2XpCredit(8000,4000,0,{now:day}).awarded,4000)
 assert.equal(v2XpCredit(12000,4000,1200,{now:day}).awarded,5200)
 assert.equal(v2XpCredit(12000,1000,100,{now:night}).awarded,770)
 assert.equal(v2XpCredit(60000,1000,0,{now:day}).used,61000)
 assert.throws(()=>v2XpCredit(-1,5),/invalido/)
})
test('V2: RaidLote mantém 60% durante toda a madrugada, nunca 70% de 60%',()=>{
 const now=new Date('2026-11-21T05:15:00Z') // 02h15 Brasilia
 const manualXp=600
 const loteXp=raidLoteReward(manualXp,'playerXp')
 assert.equal(loteXp,360)
 assert.equal(v2XpCredit(12000,manualXp,0,{now}).awarded,420)
 assert.equal(v2XpCredit(12000,loteXp,0,{now,skipNightRate:true}).awarded,360)
 assert.equal(v2XpCredit(12000,loteXp,72,{now,skipNightRate:true}).awarded,432)
 assert.equal(v2XpCredit(12000,loteXp,0,{now}).awarded,252) // resultado incorreto se somar duas reducoes
 const game=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 assert.match(game,/ignoreXpBoost:!RAID_LOTE_V1\.applyActivatedXpItems,skipNightRate:true/)
})
test('mesma chave por jogador em WA/Web e contador estatístico sem teto',async()=>{
 const state=new Map(),calls=[]
 const client={query:async(sql,params)=>{
  calls.push(sql)
  if(sql.startsWith('SELECT'))return {rows:state.has(params[0])?[{value:state.get(params[0])}]:[]}
  state.set(params[0],JSON.parse(params[1]));return {rows:[]}
 }}
 const day=new Date('2026-11-21T10:00:00Z')
 assert.equal(brazilProgressionDay(new Date('2026-11-18T02:59:00Z')),'2026-11-17')
 assert.equal(brazilProgressionDay(new Date('2026-11-18T03:00:00Z')),'2026-11-18')
 assert.equal((await reserveV2DailyXp(client,'a',8000,0,{day:'2026-11-21',now:day})).awarded,8000)
 assert.equal((await reserveV2DailyXp(client,'a',16000,0,{day:'2026-11-21',now:day})).awarded,16000)
 assert.equal((await reserveV2DailyXp(client,'a',8000,0,{day:'2026-11-21',now:day})).awarded,8000)
 assert.equal(state.get('reboot_xp_daily:a').used,32000)
 assert.equal(calls.filter(s=>s.startsWith('INSERT')).length,3)
 assert.equal((await reserveV2DailyXp(client,'b',8000,0,{day:'2026-11-21',now:day})).awarded,8000)
 assert.equal((await reserveV2DailyXp(client,'a',900,0,{day:'2026-11-22',now:new Date('2026-11-22T10:00:00Z')})).awarded,900)
 assert.equal(state.get('reboot_xp_daily:a').used,900)
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
 assert.match(db,/dailyXp=await reserveV2DailyXp\\(client,jid,eventGain,bonusXp,\\{skipNightRate:Boolean\\(options.skipNightRate\\)\\}\\)/)
 assert.match(db,/eventGain=dailyXp.base\s+bonusXp=dailyXp.bonus/)
 assert.ok(db.indexOf('dailyXp=await reserveV2DailyXp')<db.indexOf("UPDATE alpha_xp_boosts SET bonus_remaining=bonus_remaining-$1"))
 assert.match(db,/classLevelAdvance\(cr.level,cr.xp,eventGain\+bonusXp\)/)
 assert.match(db,/classesOnlyRebootEnabled\(\)\?row.class_level:row.level/)
 const aw=readFileSync(new URL('../src/neon/awakening.js',import.meta.url),'utf8')
 assert.match(aw,/tier=effectiveAwakeningTier/)
 assert.match(aw,/personalProtection=!classesOnlyRebootEnabled\(\)/)
 assert.match(aw,/recoveredQuests=!classesOnlyRebootEnabled\(\)/)
})

test('perfil V2: sem teto, faixa horaria ao vivo, estatistica reinicia sem bloquear',()=>{
 const day='2026-11-21',now=new Date('2026-11-21T12:00:00Z')
 assert.deepEqual(v2DailyXpStatus(null,{day,now}),{
  day,used:0,cap:null,fullRemaining:null,remaining:null,rate:1,unlimited:true
 })
 assert.equal(v2DailyXpStatus({day,used:12000},{day,now}).rate,1)
 assert.equal(v2DailyXpStatus({day,used:12000},{day,now}).remaining,null)
 assert.equal(v2DailyXpStatus({day,used:12000},{day,now:new Date('2026-11-21T04:00:00Z')}).rate,.7)
 assert.equal(v2DailyXpStatus({day:'2026-11-20',used:12000},{day,now}).used,0)
 assert.throws(()=>v2DailyXpStatus({day,used:-1},{day,now}),/invalido/)
})
test('perfil WA/Web sem quota e pergaminhos usam a mesma regra da madrugada',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 const web=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
 assert.match(db,/daily_xp:v2DailyXpStatus\\(daily_xp_state\\)/)
 assert.match(db,/reserveV2DailyXp\\(client,jid,eventGain,bonusXp,\\{skipNightRate:Boolean\\(options.skipNightRate\\)\\}\\)/)
 assert.match(wa,/XP hoje:/)
 assert.match(wa,/p\\.daily_xp\\.rate/)
 assert.match(web,/XP hoje • sem teto/)
 assert.match(web,/raw\\.daily_xp\\.rate/)
 assert.doesNotMatch(wa,/XP diário:/)
 assert.doesNotMatch(web,/XP diário/)
 const scroll=db.slice(db.indexOf('export async function useXpConsumable'),db.indexOf('export async function grantExp(jid'))
 assert.doesNotMatch(scroll,/Limite diário de XP atingido/)
 assert.match(scroll,/Number\\(user.level\\)>=MAX_LEVEL/)
 assert.ok(scroll.indexOf('await applyExp(client,jid,effect.xp')<scroll.indexOf('UPDATE inventories SET quantity=quantity-1'))
})
