import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {classCombatStats,classCombatHp,classCombatGrowth} from '../src/neon/class-combat-balance.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
function region(name) {
  const start=games.indexOf('export async function '+name+'(')
  assert.ok(start>=0,'Missing '+name)
  const end=games.indexOf('\nexport ',start+20)
  return games.slice(start,end<0?undefined:end)
}
function classQuery(name,marker){
  const lines=region(name).split('\n')
  const line=lines.find(s=>s.includes(marker)&&s.includes("LEFT JOIN player_class_levels cl"))
  assert.ok(line,'Missing class level lookup for '+name)
  const match=line.match(/'((?:SELECT s\.[^']+))'/)
  assert.ok(match,'Malformed class level query '+name)
  return match[1]
}
const joinQuery=classQuery('joinRaid','WHERE s.jid=$1')
const startQuery=classQuery('startRaid','WHERE s.jid=ANY($1::text[])')
const bossQuery=classQuery('attackBoss','WHERE s.jid=$1')
const expectedJoin=/LEFT JOIN player_class_levels cl ON cl\.jid=s\.jid AND cl\.class_id=s\.class_id/

test('AB-01 Boss/Raid: three paths load individual class level under stats-only row lock',()=>{
 for(const q of [joinQuery,startQuery,bossQuery]){
  assert.match(q,expectedJoin)
  assert.match(q,/COALESCE\(cl\.level,1\)::int AS class_level/)
  assert.match(q,/FOR UPDATE OF s$/)
 }
 assert.match(startQuery,/WHERE s\.jid=ANY\(\$1::text\[\]\)/)
 for(const name of ['joinRaid','startRaid','attackBoss']){
  assert.match(region(name),/classCombatStats\(st,st\.class_id,st\.class_level,Boolean\(st\.class_applied\)\)/)
 }
})

test('AB-01: classes Lv100 receive their proper role bonus; Lv1 does not receive a fictitious Lv100 bonus',()=>{
 const basic={hp:6000,max_hp:6000,atk:1000,def:900,spd:500}
 const roles=[
  ['paladin','hp',400],['berserker','atk',35],['samurai','spd',18],['necromancer','def',15]
 ]
 for(const [classId,stat,expected] of roles){
  const lv100=classCombatStats(basic,classId,100,true)
  const lv1=classCombatStats(basic,classId,1,true)
  assert.equal(lv100.bonus[stat],expected)
  assert.ok(lv1.bonus[stat]<lv100.bonus[stat])
  assert.ok(lv100.maxHp>=lv1.maxHp)
  assert.ok(lv100.atk>=lv1.atk)
  assert.ok(lv100.def>=lv1.def)
  assert.deepEqual(classCombatStats(basic,classId,100,false).bonus,{hp:0,atk:0,def:0,spd:0})
 }
 const maximum=classCombatStats(basic,'paladin',100)
 assert.equal(classCombatHp(3000,basic.max_hp,maximum.maxHp),3200)
 assert.deepEqual(classCombatGrowth('samurai',100),{hp:220,atk:30,def:12,spd:18})
})
test('AB-01: live data level join returns class level rather than general player level',async t=>{
 if(!process.env.DATABASE_URL){t.skip('Runs with disposable PostgreSQL service');return}
 const {Client}=await import('pg')
 const client=new Client({connectionString:process.env.DATABASE_URL})
 await client.connect()
 try{
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout='2s'")
  await client.query("CREATE TEMP TABLE stats (jid text PRIMARY KEY,hp integer,max_hp integer,atk integer,def integer,spd integer,weapon_id text,armor_id text,boot_id text,helmet_id text,class_id text,class_applied boolean,class_hp_bonus integer,class_atk_bonus integer,class_def_bonus integer,class_spd_bonus integer) ON COMMIT DROP")
  await client.query("CREATE TEMP TABLE player_class_levels (jid text,class_id text,level integer,PRIMARY KEY(jid,class_id)) ON COMMIT DROP")
  await client.query("INSERT INTO stats(jid,hp,max_hp,atk,def,spd,class_id,class_applied,class_hp_bonus,class_atk_bonus,class_def_bonus,class_spd_bonus) VALUES ('a',3000,6000,1000,900,500,'samurai',true,0,0,0,0),('b',3000,6000,1000,900,500,'paladin',true,0,0,0,0),('c',3000,6000,1000,900,500,'berserker',true,0,0,0,0)")
  await client.query("INSERT INTO player_class_levels(jid,class_id,level) VALUES('a','samurai',100),('b','paladin',15)")
  for(const [key,q,args] of [['join',joinQuery,['a']],['start',startQuery,[['a','b','c']]],['boss',bossQuery,['b']]]){
    const r=await client.query(q,args)
    assert.equal(r.rowCount,key==='start'?3:1,key)
    assert.ok(r.rows.every(p=>Number.isInteger(p.class_level)),key)
    const levels=Object.fromEntries(r.rows.map(p=>[p.jid,p.class_level]))
    if(key==='start')assert.deepEqual(levels,{a:100,b:15,c:1})
    if(key==='join')assert.equal(levels.a,100)
    if(key==='boss')assert.equal(r.rows[0].class_level,15,'Boss selects stats columns and the joined level, without jid')
  }
  const fromBoss=(await client.query(bossQuery,['a'])).rows[0]
  const s=classCombatStats(fromBoss,fromBoss.class_id,fromBoss.class_level,fromBoss.class_applied)
  assert.equal(s.bonus.atk,30)
  assert.equal(s.bonus.hp,220)
  await client.query('ROLLBACK')
 }finally{await client.end()}
})
