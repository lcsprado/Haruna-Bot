import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PLAYER_CLASSES} from '../src/neon/game-catalog.js';
import {HERO_COMBAT_PROFILES} from '../src/neon/playable-heroes-core.js';
import {
 AUTO_POSTURES,AUTO_ROLE_IDS,normalizedAutoPosture,chooseAutoPosture,
 autoPostureAdvantages,autoCombatModifiers
} from '../src/neon/pvp-auto-strategy.js';
import {readAutoBattlePostures,validateAutoPreference} from '../src/neon/pvp-auto-preferences.js';

const modifiers=(id,posture='equilibrada',more={})=>autoCombatModifiers({
 combatantId:id,posture,opponentCombatantId:'warrior',
 opponentPosture:'equilibrada',...more
});
test('the exactly 17 existing classes and sins are supported',()=>{
 const real=[...Object.keys(PLAYER_CLASSES),...Object.keys(HERO_COMBAT_PROFILES)].sort();
 assert.deepEqual([...AUTO_ROLE_IDS].sort(),real);
 assert.deepEqual(AUTO_POSTURES,['equilibrada','agressiva','defensiva','tatica','adaptativa']);
});
test('old mode is mathematically neutral and requires zero extra SQL',async()=>{
 for(const id of AUTO_ROLE_IDS)assert.deepEqual(modifiers(id),{
   posture:'equilibrada',attackMultiplier:1,damageReduction:0,receivedMultiplier:1
 });
 let calls=0;
 const client={query(){calls++;throw new Error('DB query forbidden with flag OFF')}};
 assert.deepEqual(await readAutoBattlePostures(client,[
  {jid:'alpha',combatantId:'pecado_ban'},{jid:'bravo',combatantId:'samurai'}
 ],{enabled:false}),{alpha:'equilibrada',bravo:'equilibrada'});
 assert.equal(calls,0);
});
test('each fixed posture has a tradeoff, not a guaranteed winner',()=>{
 const aggressive=modifiers('samurai','agressiva');
 const defensive=modifiers('samurai','defensiva');
 const tactical=modifiers('samurai','tatica',{attackTechnique:true});
 assert.ok(aggressive.attackMultiplier>1);
 assert.ok(aggressive.receivedMultiplier>1);
 assert.ok(defensive.attackMultiplier<1);
 assert.ok(defensive.damageReduction>0);
 assert.ok(tactical.attackMultiplier>1);
 assert.ok(tactical.damageReduction>0);
 for(const id of AUTO_ROLE_IDS)for(const posture of AUTO_POSTURES)
   for(const opponentPosture of AUTO_POSTURES)for(const ratio of [0,.1,.3,.5,.9,1]){
     const m=modifiers(id,posture,{opponentPosture,ownHpRatio:ratio,enemyHpRatio:.12,attackTechnique:true});
     assert.ok(m.attackMultiplier>=.94&&m.attackMultiplier<=1.08,id+' attack capped');
     assert.ok(m.damageReduction>=0&&m.damageReduction<=.08,id+' guard capped');
     assert.ok(m.receivedMultiplier>=1&&m.receivedMultiplier<=1.05,id+' exposed capped');
   }
});
test('posture triangle has no privileged mode',()=>{
 assert.equal(autoPostureAdvantages('agressiva','defensiva'),true);
 assert.equal(autoPostureAdvantages('defensiva','tatica'),true);
 assert.equal(autoPostureAdvantages('tatica','agressiva'),true);
 assert.equal(autoPostureAdvantages('agressiva','tatica'),false);
 assert.equal(autoPostureAdvantages('defensiva','agressiva'),false);
 assert.equal(autoPostureAdvantages('tatica','defensiva'),false);
});
test('adaptive automatically picks role and HP context, with diminished effects',()=>{
 assert.equal(chooseAutoPosture({selected:'adaptativa',combatantId:'pecado_diane',ownHpRatio:.9}),'defensiva');
 assert.equal(chooseAutoPosture({selected:'adaptativa',combatantId:'samurai',ownHpRatio:.9}),'agressiva');
 assert.equal(chooseAutoPosture({selected:'adaptativa',combatantId:'pecado_ban',ownHpRatio:.9}),'tatica');
 assert.equal(chooseAutoPosture({selected:'adaptativa',combatantId:'samurai',ownHpRatio:.30}),'defensiva');
 assert.equal(chooseAutoPosture({selected:'adaptativa',combatantId:'pecado_diane',ownHpRatio:.9,enemyHpRatio:.2}),'agressiva');
 const fixed=modifiers('pecado_diane','defensiva');
 const flexible=modifiers('pecado_diane','adaptativa');
 assert.equal(flexible.posture,'defensiva');
 assert.ok(flexible.damageReduction<fixed.damageReduction);
 assert.ok(flexible.attackMultiplier>fixed.attackMultiplier); // less defensive penalty in exchange for less protection
 assert.equal(normalizedAutoPosture('TÁTICA'),'tatica');
 assert.equal(normalizedAutoPosture('???'),'equilibrada');
});
test('unknown future collabs are neutral instead of breaking PvP',async()=>{
 assert.deepEqual(modifiers('bleach_ichigo','agressiva'),{
   posture:'agressiva',attackMultiplier:1,damageReduction:0,receivedMultiplier:1
 });
 const calls=[];
 const prefs={async query(sql,p){calls.push(p);return {rows:[{jid:'a',combatant_id:'pecado_ban',posture:'tatica'}]}}};
 assert.deepEqual(await readAutoBattlePostures(prefs,[
   {jid:'a',combatantId:'pecado_ban'},{jid:'b',combatantId:'bleach_ichigo'}
 ],{enabled:true}),{a:'tatica',b:'equilibrada'});
 assert.deepEqual(calls[0],[['a'],['pecado_ban']]);
 assert.throws(()=>validateAutoPreference('bleach_ichigo','agressiva'),/não reconhecido/);
});
test('production WhatsApp retains 100% automatic !batalhar and no manual duel components',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
 assert.match(index,/\['batalhar','batalha','battle','duelo'\]\.includes\(cmd\)/);
 assert.match(index,/cmd==='estrategia'/);
 assert.match(db,/ALPHA_PVP_AUTO_STRATEGY_ENABLED==='1'/);
 assert.match(db,/readAutoBattlePostures\(client,/);
 assert.doesNotMatch(db,/from '\.\/pvp-duel-/);
 assert.doesNotMatch(index,/from '\.\/pvp-duel-/);
});
