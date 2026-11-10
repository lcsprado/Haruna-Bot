import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {classCombatStats,classCombatHp} from '../src/neon/class-combat-balance.js'
import {DAMAGE_SAMPLE_LIMIT,damageHeroKey,summarizeDamageSamples} from '../src/neon/damage-hero-stats.js'

const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const beginning=source.indexOf('async function recordPlayerDamage(')
const ending=source.indexOf('\nexport async function raidRound(',beginning)
assert.ok(beginning>=0&&ending>beginning)
const recorder=source.slice(beginning,ending).replace('export async function getPlayerDamageStats','async function getPlayerDamageStats')

const stats={hp:4300,max_hp:5200,atk:1150,def:760,spd:430,class_id:'samurai',class_applied:true,class_level:100}
const cases=['paladin','berserker','samurai','necromancer']
test('AB-01: quatro classes usam a mesma progressao (sem somar gear) e HP convertido em Boss e Raid',()=>{
 for(const classId of cases){
  const {bonus,maxHp,atk,def}=classCombatStats(stats,classId,100,true)
  assert.ok(maxHp>=stats.max_hp&&atk>=stats.atk&&def>=stats.def)
  assert.equal(maxHp,stats.max_hp+bonus.hp)
  const hp=classCombatHp(stats.hp,stats.max_hp+180,maxHp+180)
  assert.ok(hp>=stats.hp)
 }
 assert.match(source,/const classStats=raidHero\?null:classCombatStats\(st,st\.class_id,st\.class_level,Boolean\(st\.class_applied\)\)/)
 assert.equal((source.match(/const classStats=raidHero\?null:classCombatStats\(/g)||[]).length,2)
 assert.match(source,/const classStats=heroId\?null:classCombatStats\(/)
 assert.match(source,/const heroCombatHp=hero\?\.hp\?\?classCombatHp\(/)
 assert.match(source,/:classCombatHp\(php,effectiveMaxHp,Number\(st\.max_hp\)\+gearHp\)/)
})
test('AB-01: equipar bota com HP entra na projeção do HP (classe/heroi) em ambas entradas Raid',()=>{
 assert.equal((source.match(/const gearHp=Number\(w\?\.hp\|\|0\)\+Number\(a\?\.hp\|\|0\)\+Number\(b\?\.hp\|\|0\)\+Number\(h\?\.hp\|\|0\)/g)||[]).length,2)
 assert.equal((source.match(/const heroGearHp=gearHp/g)||[]).length,2)
 assert.equal((source.match(/crit:Math\.max\(0,/g)||[]).length>=2,true)
 assert.doesNotMatch(source,/crit:Math\.min\(\.45/)
 assert.equal((source.match(/classApplied:Boolean\(st\.class_applied\)&&!raidHero/g)||[]).length,2)
})
test('AB-01: Web identifica no histórico append-only o herói real de Boss e Raid',async()=>{
 const records=[]
 const client={async query(sql,params){records.push({sql:String(sql),params});return {rowCount:1}}}
 const db={async query(){throw Error('nao usa db no registro de hit')}}
 const {recordPlayerDamage}=vm.runInNewContext(recorder+'\n({recordPlayerDamage,getPlayerDamageStats})',{
  db,damageHeroKey,DAMAGE_SAMPLE_LIMIT,summarizeDamageSamples,Number,Boolean
 })
 await recordPlayerDamage(client,'player-a','boss',1722.8,true,'pecado_ban')
 await recordPlayerDamage(client,'player-a','raid',1800,false,null)
 await recordPlayerDamage(client,'player-a','raid',0,true,'pecado_ban')
 assert.equal(records.length,2)
 assert.ok(records.every(x=>x.sql.includes('INSERT INTO player_damage_hits')))
 assert.ok(records.every(x=>!x.sql.includes('player_damage_stats')))
 assert.deepEqual([...records[0].params],['player-a','boss','pecado_ban',1723,true])
 assert.deepEqual([...records[1].params],['player-a','raid','__classe__',1800,false])
 assert.match(source,/recordPlayerDamage\(c,p\.jid,'raid',actualDamage,crit,p\.heroId\)/)
 assert.match(source,/recordPlayerDamage\(c,jid,'boss',damage,crit,heroId\)/)
})
test('AB-01: !dano usa 30 golpes por herói e modalidade, histórico legado separado',async()=>{
 const logged=[]
 const rows=[{category:'boss',damage:1200,critical:true},{category:'boss',damage:800,critical:false},{category:'raid',damage:1600,critical:true}]
 const db={async query(sql,params){
  logged.push({sql:String(sql),params})
  if(String(sql).includes('player_damage_hits'))return {rows}
  return {rows:[{category:'boss',samples:[[100,true],[80,false]]}]}
 }}
 const {getPlayerDamageStats}=vm.runInNewContext(recorder+'\n({recordPlayerDamage,getPlayerDamageStats})',{
  db,damageHeroKey,DAMAGE_SAMPLE_LIMIT,summarizeDamageSamples
 })
 const recent=await getPlayerDamageStats('player-a','pecado_ban')
 assert.equal(recent.boss.count,2)
 assert.equal(recent.boss.critAverage,1200)
 assert.equal(recent.raid.count,1)
 assert.equal(logged[0].params[1],'pecado_ban')
 assert.equal(logged[0].params[2],30)
 assert.match(logged[0].sql,/category='boss'/)
 assert.match(logged[0].sql,/category='raid'/)
 const old=await getPlayerDamageStats('player-a',null,{historical:true})
 assert.equal(old.boss.count,2)
 assert.equal(old.boss.average,90)
 assert.match(logged[1].sql,/FROM player_damage_stats/)
})
test('AB-01: ambas as tabelas existem sem apagar as amostras legadas',()=>{
 assert.match(source,/CREATE TABLE IF NOT EXISTS player_damage_hits/)
 assert.match(source,/CREATE INDEX IF NOT EXISTS player_damage_hits_recent_idx/)
 assert.match(source,/CREATE TABLE IF NOT EXISTS player_damage_stats/)
 assert.doesNotMatch(source,/TRUNCATE TABLE player_damage/)
 assert.doesNotMatch(source,/DELETE FROM player_damage/)
})
