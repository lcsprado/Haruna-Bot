import test from 'node:test';
import assert from 'node:assert/strict';
import {
 assertStrategyPreference,playerOwnsStrategicCombatant,
 saveStrategyPreference,readBattleStrategies
} from '../src/neon/pvp-strategy-preferences.js';

test('no preference database read when feature flag is off',async()=>{
 let calls=0;
 const db={query(){calls++;throw new Error('should not touch DB')}};
 const s=await readBattleStrategies(db,[
   {jid:'alice',combatantId:'pecado_ban'},{jid:'bob',combatantId:'samurai'}
 ],{enabled:false});
 assert.deepEqual(s,{alice:'equilibrada',bob:'equilibrada'});
 assert.equal(calls,0);
});
test('reading preferences matches both exact JID and character, defaults invalid entries',async()=>{
 const db={async query(sql,params){
   assert.match(sql,/pvp_strategy_preferences/);
   assert.deepEqual(params,[['alice','bob'],['pecado_ban','samurai']]);
   return {rows:[
     {jid:'alice',combatant_id:'pecado_diane',posture:'agressiva'},
     {jid:'alice',combatant_id:'pecado_ban',posture:'tatica'},
     {jid:'bob',combatant_id:'samurai',posture:'roubar'}
   ]};
 }};
 const a=await readBattleStrategies(db,[
   {jid:'alice',combatantId:'pecado_ban'},{jid:'bob',combatantId:'samurai'}
 ],{enabled:true});
 assert.deepEqual(a,{alice:'tatica',bob:'equilibrada'});
});
test('preference writes require a known character, valid posture, ownership',async()=>{
 assert.throws(()=>assertStrategyPreference('pecado_inventado','tatica'),/nao reconhecido/);
 assert.throws(()=>assertStrategyPreference('pecado_ban','suprema'),/postura invalida/);
 let calls=0;
 const db={async query(sql,params){
   calls++;
   if(sql.includes('pet_collection')){
     assert.deepEqual(params,['alice','pecado_ban']);
     return {rows:[{owned:true}]};
   }
   if(sql.includes('INSERT')){
     assert.match(sql,/ON CONFLICT/);
     return {rows:[{combatant_id:'pecado_ban',posture:'defensiva'}]};
   }
   throw new Error('unexpected query');
 }};
 const r=await saveStrategyPreference(db,{jid:'alice',combatantId:'pecado_ban',posture:'defensiva'});
 assert.deepEqual(r,{combatant_id:'pecado_ban',posture:'defensiva'});
 assert.equal(calls,2);
});
test('player cannot configure heroes not owned or unrelated classes',async()=>{
 const db={async query(sql){return {rows:[{owned:false}]}}};
 assert.equal(await playerOwnsStrategicCombatant(db,'alice','pecado_ban'),false);
 await assert.rejects(()=>saveStrategyPreference(db,{jid:'alice',combatantId:'pecado_ban',posture:'agressiva'}),/nao pertence/);
});
test('classes may be unlocked by progress or active stats, without hero modes',async()=>{
 const db={async query(sql,p){
   assert.match(sql,/player_class_levels/);
   assert.match(sql,/stats/);
   assert.deepEqual(p,['alice','paladin']);
   return {rows:[{owned:true}]};
 }};
 assert.equal(await playerOwnsStrategicCombatant(db,'alice','paladin'),true);
});
