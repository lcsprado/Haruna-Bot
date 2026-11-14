import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DAILY_V3_START,DAILY_MAIN_TYPES,dailyV3MainMissions,dailyV3SpecialMission,dailySpecialActivity}
  from '../src/neon/daily-mission-rotation.js';

const source=readFileSync(new URL('../src/neon/daily-v2.js',import.meta.url),'utf8');
const progression=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');

const addDays=(day,count)=>{
 const d=new Date(day+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+count);
 return d.toISOString().slice(0,10);
};

test('five distinct main quest activities rotate significantly each day',()=>{
 assert.equal(DAILY_V3_START,'2026-11-14');
 assert.equal(DAILY_MAIN_TYPES.length,8);
 let previous=null,distinctDays=0;
 for(let n=0;n<90;n++){
  const day=addDays(DAILY_V3_START,n);
  const quests=dailyV3MainMissions(day);
  assert.equal(quests.length,5,day);
  assert.equal(new Set(quests.map(x=>x.type)).size,5,day);
  for(const q of quests){
   assert.ok(DAILY_MAIN_TYPES.includes(q.type),day+' '+q.type);
   assert.ok(q.title.length>6&&Number.isInteger(q.target)&&q.target>0);
   assert.ok(q.cash>0&&(q.xp>0||q.petXp>0));
  }
  if(previous){
   const common=quests.filter(q=>previous.some(old=>old.type===q.type));
   assert.ok(common.length<=3,'Too many identical activity categories: '+day);
   assert.ok(common.some(q=>previous.find(old=>old.type===q.type)?.title!==q.title)
     ||common.length<3,'Goals remain cosmetically unchanged: '+day);
   distinctDays++;
  }
  previous=quests;
 }
 assert.equal(distinctDays,89);
});

test('special challenge alternates Raids and Boss, and low levels keep a Boss alternative',()=>{
 const kinds=new Set();
 for(let n=0;n<30;n++){
  const day=addDays(DAILY_V3_START,n);
  const mission=dailyV3SpecialMission(day,520);
  kinds.add(dailySpecialActivity(mission.title));
  assert.equal(mission.type,'legend_raid');
  assert.ok(mission.target>=10000&&mission.target<=50000);
  assert.equal(mission.cash,25000);
  assert.equal(mission.xp,1500);
  assert.equal(mission.petXp,500);
  const rookie=dailyV3SpecialMission(day,1);
  assert.equal(rookie.target,2500);
  assert.equal(dailySpecialActivity(rookie.title),'boss_damage');
 }
 assert.deepEqual([...kinds].sort(),['boss_damage','raid_damage']);
 assert.equal(dailySpecialActivity('🌟 Caçador de Lendas (Raids)'),'raid_damage');
});

test('already generated day remains immutable and all 8 new categories can gain verified progress',()=>{
 assert.match(source,/if\(Number\(ur\.rows\[0\]\.mission_count\|\|0\)===6\)return/);
 assert.match(source,/today>=DAILY_V3_START\?dailyV3MainMissions\(today\):dailyRotatedDefinitions\(today\)/);
 for(const kind of ['game','shop','raid_damage','boss_damage','battle','dungeon','work','pet_train']){
  assert.ok(source.includes("'"+kind+"'"),'Missing valid mission type: '+kind);
 }
 for(const [type,hook] of [['game',"'game'"],['shop',"'shop'"],['battle',"'battle'"],['dungeon',"'dungeon'"],['pet_train',"'pet_train'"]]){
  assert.ok(bot.includes('progressDailyMission(sender,'+hook)||bot.includes('creditDailyActivity(sender,'+hook),
   'No real gameplay progress hook: '+type);
 }
 for(const type of ['raid_damage','boss_damage']){
  assert.ok(bot.includes("'"+type+"'"),'No combat activity hook: '+type);
 }
 assert.match(source,/specialActivity==='raid_damage'/);
 assert.match(source,/specialActivity==='boss_damage'/);
 assert.match(source,/ctx\.today<DAILY_V3_START\?\['boss_damage'\]/);
 assert.match(source,/reward_type='all_five'/);
 assert.match(source,/level_snapshot/);
 assert.match(source,/ON CONFLICT\(jid,day_key,mission_type\) DO NOTHING/);
 assert.match(progression,/CREATE TABLE IF NOT EXISTS daily_missions/);
});
