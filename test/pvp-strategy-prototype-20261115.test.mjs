import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_PLAYBOOK,POSTURES,ACTIONS,DECISION_ROUNDS,MAX_INTERVENTIONS,
  normalizePosture,strategicAdvantage,strategyModifiers,makeDuelRound,
  duelRoundPublic,submitDuelChoice,resolveDuelRound
} from '../src/neon/pvp-strategy-prototype.js';
import {auditSeventeen} from '../src/neon/pvp-balance-simulator.js';

test('all 7 classic heroes and 10 classes have bounded tactical identities',()=>{
  const ids=['warrior','paladin','berserker','necromancer','samurai','assassin','mage','archer','monk','druid',
    'pecado_meliodas','pecado_ban','pecado_diane','pecado_escanor','pecado_king','pecado_gowther','pecado_merlin'];
  assert.deepEqual(Object.keys(ROLE_PLAYBOOK).sort(),ids.sort());
  for(const id of ids){
    assert.ok(ROLE_PLAYBOOK[id].technique);
    for(const posture of POSTURES)for(const opponentPosture of POSTURES)for(const action of ACTIONS){
      const m=strategyModifiers({fighterId:id,posture,opponentPosture,action,round:11,hpRatio:.2});
      assert.ok(m.attackMultiplier>=.92&&m.attackMultiplier<=1.15,id+' attack bounds');
      assert.ok(m.damageReduction>=0&&m.damageReduction<=.14,id+' guard bounds');
      assert.ok(m.receivedMultiplier>=1&&m.receivedMultiplier<=1.075,id+' exposure bounds');
      assert.ok(m.healMaxHpPct>=0&&m.healMaxHpPct<=.025,id+' heal bounds');
    }
  }
});
test('default strategy is strictly neutral; existing PvP gets no implicit bonus',()=>{
  for(const id of Object.keys(ROLE_PLAYBOOK)){
    assert.deepEqual(strategyModifiers({fighterId:id}),{
      attackMultiplier:1,damageReduction:0,receivedMultiplier:1,healMaxHpPct:0,technique:null
    });
  }
  assert.equal(normalizePosture('invalid'),'equilibrada');
});
test('posture counter cycle is deterministic and does not guarantee a win',()=>{
  assert.equal(strategicAdvantage('agressiva','defensiva'),true);
  assert.equal(strategicAdvantage('defensiva','tatica'),true);
  assert.equal(strategicAdvantage('tatica','agressiva'),true);
  assert.equal(strategicAdvantage('agressiva','tatica'),false);
  const a=strategyModifiers({fighterId:'samurai',posture:'tatica',opponentPosture:'agressiva'});
  const b=strategyModifiers({fighterId:'samurai',posture:'tatica',opponentPosture:'defensiva'});
  assert.ok(a.attackMultiplier>b.attackMultiplier);
  assert.ok(a.attackMultiplier<1.1);
});
test('individual roles have meaningful tactical tradeoffs',()=>{
  const paladin=strategyModifiers({fighterId:'paladin',action:'tecnica'});
  const berserker=strategyModifiers({fighterId:'berserker',action:'tecnica',hpRatio:.25});
  const samurai=strategyModifiers({fighterId:'samurai',action:'tecnica',opponentPosture:'agressiva'});
  const ban=strategyModifiers({fighterId:'pecado_ban',action:'tecnica'});
  const diane=strategyModifiers({fighterId:'pecado_diane',action:'tecnica'});
  const escanor=strategyModifiers({fighterId:'pecado_escanor',action:'tecnica',round:11});
  assert.ok(paladin.damageReduction>berserker.damageReduction);
  assert.ok(berserker.attackMultiplier>1.05&&berserker.receivedMultiplier>1);
  assert.ok(samurai.attackMultiplier>1.05);
  assert.ok(ban.healMaxHpPct>0);
  assert.ok(diane.damageReduction>.08);
  assert.ok(escanor.attackMultiplier>1.06);
});
test('choices remain private until both participants submit',()=>{
  let s=makeDuelRound({players:['player-a','player-b'],round:3,nowMs:1000,timeoutMs:30000});
  s=submitDuelChoice(s,{playerId:'player-a',choice:'tecnica',nowMs:2000});
  const publicState=duelRoundPublic(s);
  assert.equal(publicState.submittedCount,1);
  assert.equal(publicState.ready,false);
  assert.doesNotMatch(JSON.stringify(publicState),/tecnica|player-a|player-b/);
  assert.throws(()=>resolveDuelRound(s,3000),/waiting/);
  assert.throws(()=>submitDuelChoice(s,{playerId:'player-a',choice:'atacar',nowMs:3000}),/locked/);
  s=submitDuelChoice(s,{playerId:'player-b',choice:'proteger',nowMs:3500});
  assert.equal(duelRoundPublic(s).ready,true);
  assert.deepEqual(resolveDuelRound(s,3500).choices,{'player-a':'tecnica','player-b':'proteger'});
});
test('timeout defaults absent player to neutral instead of rewarding inactivity',()=>{
  const s=makeDuelRound({players:['a','b'],round:7,nowMs:100,timeoutMs:2000});
  assert.throws(()=>resolveDuelRound(s,2099));
  const result=resolveDuelRound(s,2100);
  assert.deepEqual(result.choices,{a:'normal',b:'normal'});
  assert.deepEqual(result.timedOut,['a','b']);
  assert.throws(()=>submitDuelChoice(s,{playerId:'b',choice:'proteger',nowMs:2200}),/expired/);
});
test('interventions are restricted to three separated windows per duel',()=>{
  assert.deepEqual(DECISION_ROUNDS,[3,7,11]);
  assert.equal(MAX_INTERVENTIONS,3);
  assert.throws(()=>makeDuelRound({players:['a','b'],round:4,nowMs:100}));
  assert.throws(()=>makeDuelRound({players:['a','a'],round:3,nowMs:100}));
  assert.throws(()=>submitDuelChoice(makeDuelRound({players:['a','b'],round:3,nowMs:100}),{
    playerId:'outsider',choice:'tecnica',nowMs:100}),/unknown/);
});
test('canonical 17-combatant PvP baseline still executes without importing prototype',()=>{
  const a=auditSeventeen({duelsPerOrder:4,gear:false,awakening:5,mastery:5});
  const b=auditSeventeen({duelsPerOrder:4,gear:false,awakening:5,mastery:5});
  assert.equal(a.combatants,17);
  assert.equal(a.pairs.length,136);
  assert.equal(a.battles,1088);
  assert.deepEqual(a.pairs,b.pairs);
});