import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {setAutoStrategyPreference,getAutoStrategyPreference,readAutoBattlePostures} from '../src/neon/pvp-auto-preferences.js';

const uri=process.env.ALPHA_PVP_AUTO_TEST_DATABASE_URL||'';
let safe=false;
try{const u=new URL(uri);safe=['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname==='/alpha_pvp_auto_test';}catch{}
if(!safe){
 test('integration only runs with explicitly isolated localhost database',{skip:true},()=>{});
}else{
 const pool=new pg.Pool({connectionString:uri,max:4});
 before(async()=>{
  await pool.query(`CREATE TABLE stats(jid TEXT PRIMARY KEY,class_id TEXT NOT NULL);
    CREATE TABLE player_hero_mode(jid TEXT PRIMARY KEY,hero_species TEXT);
    CREATE TABLE pet_collection(jid TEXT NOT NULL,species TEXT NOT NULL);`);
  await pool.query(readFileSync(new URL('../migrations/20261115_pvp_auto_strategy_NOT_APPLY.sql',import.meta.url),'utf8'));
  await pool.query("INSERT INTO stats VALUES ('a','samurai'),('b','paladin')");
  await pool.query("INSERT INTO player_hero_mode VALUES ('a',NULL),('b',NULL)");
  await pool.query("INSERT INTO pet_collection VALUES ('a','pecado_ban'),('a','pecado_diane')");
 });
 after(async()=>pool.end());
 test('independent preference per active class and hero survives switching',async()=>{
   const first=await setAutoStrategyPreference(pool,{jid:'a',posture:'agressiva'});
   assert.deepEqual(first,{combatant_id:'samurai',posture:'agressiva'});
   await pool.query("UPDATE player_hero_mode SET hero_species='pecado_ban' WHERE jid='a'");
   const ban=await setAutoStrategyPreference(pool,{jid:'a',posture:'adaptativa'});
   assert.deepEqual(ban,{combatant_id:'pecado_ban',posture:'adaptativa'});
   assert.deepEqual(await getAutoStrategyPreference(pool,'a'),{combatantId:'pecado_ban',posture:'adaptativa'});
   await pool.query("UPDATE player_hero_mode SET hero_species='pecado_diane' WHERE jid='a'");
   assert.deepEqual(await getAutoStrategyPreference(pool,'a'),{combatantId:'pecado_diane',posture:'equilibrada'});
   await setAutoStrategyPreference(pool,{jid:'a',posture:'defensiva'});
   await pool.query("UPDATE player_hero_mode SET hero_species=NULL WHERE jid='a'");
   assert.deepEqual(await getAutoStrategyPreference(pool,'a'),{combatantId:'samurai',posture:'agressiva'});
   const count=(await pool.query("SELECT COUNT(*)::int AS n FROM pvp_auto_strategy_preferences WHERE jid='a'")).rows[0].n;
   assert.equal(count,3);
 });
 test('each user can configure own active character only',async()=>{
   await assert.rejects(()=>setAutoStrategyPreference(pool,{jid:'b',posture:'invasiva'}),/válida/);
   await pool.query("UPDATE player_hero_mode SET hero_species='pecado_ban' WHERE jid='b'");
   // Hero is not owned. It must be ignored and class used.
   const b=await setAutoStrategyPreference(pool,{jid:'b',posture:'tatica'});
   assert.equal(b.combatant_id,'paladin');
   assert.deepEqual(await getAutoStrategyPreference(pool,'b'),{combatantId:'paladin',posture:'tatica'});
   const profiles=await readAutoBattlePostures(pool,[
     {jid:'a',combatantId:'samurai'},{jid:'b',combatantId:'paladin'}
   ],{enabled:true});
   assert.deepEqual(profiles,{a:'agressiva',b:'tatica'});
   assert.deepEqual(await readAutoBattlePostures(pool,[
     {jid:'a',combatantId:'pecado_ban'},{jid:'b',combatantId:'pecado_ban'}
   ],{enabled:true}),{a:'adaptativa',b:'equilibrada'});
 });
 test('default flag OFF does not touch new preference table',async()=>{
   const never={query(){throw new Error('unexpected query')}};
   assert.deepEqual(await readAutoBattlePostures(never,[
     {jid:'a',combatantId:'samurai'}
   ],{enabled:false}),{a:'equilibrada'});
 });
 test('migration neither changes stats nor makes new heroes active',async()=>{
   const rows=(await pool.query("SELECT jid,class_id FROM stats ORDER BY jid")).rows;
   assert.deepEqual(rows,[{jid:'a',class_id:'samurai'},{jid:'b',class_id:'paladin'}]);
   const active=(await pool.query("SELECT hero_species FROM player_hero_mode WHERE jid='a'")).rows[0].hero_species;
   assert.equal(active,null);
 });
}
