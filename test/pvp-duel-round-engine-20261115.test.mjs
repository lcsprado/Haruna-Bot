import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFairFighter} from '../src/neon/pvp-balance-simulator.js';
import {
 newDuelCombatSnapshot,executeDuelRound,runDuelToNextDecision
} from '../src/neon/pvp-duel-round-engine.js';
import {advanceStoredDuelCombat} from '../src/neon/pvp-duel-combat-adapter.js';
import {
 inviteStrategicDuel,acceptStrategicDuel,chooseDuelAction,completeDuelDecision,
 publicStrategicDuel
} from '../src/neon/pvp-duel-session-prototype.js';

function fighter(id,jid,{hp=110000,gear=true}={}){
 const f=buildFairFighter(id,{gear,level:100,awakening:5,mastery:5});
 return {
   jid,name:id,heroId:f.hero?id:null,classId:f.hero?null:id,
   classApplied:!f.hero,awakeningStage:f.awakening,
   heroMasteryStage:f.mastery||1,heroGear:f.heroGear||{},
   hp,maxHp:hp,atk:f.atk,def:f.def,spd:f.spd,crit:f.crit,
   petBonus:{crit:.06,dodge:.03,damage:.04,defense:.03,healPct:.02,healCooldown:5},
   vitalPulseRate:.025,shieldCritResist:.11,shieldCritGuard:.14,
   strategyPosture:jid==='a'?'tatica':'agressiva'
 };
}
const scenario=(a='pecado_ban',b='samurai',seed=771)=>newDuelCombatSnapshot({
 fighterA:fighter(a,'a'),fighterB:fighter(b,'b'),seed
});
const choices={
  3:{a:'tecnica',b:'proteger'},
  7:{a:'proteger',b:'atacar'},
  11:{a:'atacar',b:'tecnica'}
};
const revealed=Object.entries(choices).map(([round,actions])=>({round:Number(round),choices:actions,timedOut:[]}));
test('all decision gates 3, 7, 11 happen BEFORE executing their respective attacks',()=>{
 let s=scenario();
 const first=runDuelToNextDecision(s);
 assert.equal(first.awaitingRound,3);
 assert.equal(first.combat.round,3);
 assert.deepEqual(first.combat.fighters.map(f=>f.attackIndex),[2,2]);
 const second=runDuelToNextDecision(first.combat,{revealed:revealed.slice(0,1)});
 assert.equal(second.awaitingRound,7);
 assert.equal(second.combat.round,7);
 assert.deepEqual(second.combat.fighters.map(f=>f.attackIndex),[6,6]);
 const third=runDuelToNextDecision(second.combat,{revealed:revealed.slice(0,2)});
 assert.equal(third.awaitingRound,11);
 assert.equal(third.combat.round,11);
 assert.deepEqual(third.combat.fighters.map(f=>f.attackIndex),[10,10]);
 const fourth=runDuelToNextDecision(third.combat,{revealed});
 assert.equal(fourth.finished,true);
 assert.equal(fourth.combat.outcome.rounds,20);
 assert.equal(fourth.combat.round,21);
 assert.equal(fourth.combat.fighters[0].attackIndex,20);
 assert.equal(fourth.combat.fighters[1].attackIndex,20);
});
test('interrupted JSONB resume is byte-exact with uninterrupted battle, including pets and skill state',()=>{
 for(const [a,b] of [
   ['pecado_ban','samurai'],['pecado_diane','berserker'],
   ['pecado_meliodas','paladin'],['pecado_king','pecado_escanor'],
   ['pecado_merlin','mage'],['pecado_gowther','necromancer']
 ])for(const seed of [1,75,20261115]){
   let continuous=scenario(a,b,seed);
   for(let r=1;!continuous.outcome&&r<=20;r++)
     continuous=executeDuelRound(continuous,{choices:choices[r]||{}});
   let paused=scenario(a,b,seed),reveal=[];
   for(const row of revealed){
     const segment=runDuelToNextDecision(paused,{revealed:reveal});
     if(segment.finished){paused=segment.combat;break}
     assert.equal(segment.awaitingRound,row.round);
     paused=JSON.parse(JSON.stringify(segment.combat));
     reveal=[...reveal,row];
   }
   paused=runDuelToNextDecision(paused,{revealed:reveal}).combat;
   assert.deepEqual(paused,continuous,a+' vs '+b+' seed='+seed);
   assert.ok(paused.fighters.every(x=>x.hp>=0&&x.hp<=x.maxHp));
   assert.ok(paused.log.some(x=>x.shieldAbsorbed!==undefined||x.vitalPulse||x.petHeal));
 }
});
test('the same paused state always produces the same outcome; inputs remain immutable',()=>{
 const original=scenario();
 const snapshot=JSON.stringify(original);
 const one=runDuelToNextDecision(original);
 const two=runDuelToNextDecision(JSON.parse(snapshot));
 assert.deepEqual(one,two);
 assert.equal(JSON.stringify(original),snapshot);
 assert.throws(()=>runDuelToNextDecision(one.combat,{
   revealed:[revealed[0],revealed[0]]
 }),/duplicate/);
 assert.throws(()=>runDuelToNextDecision(one.combat,{
   revealed:[{round:3,choices:{a:'tecnica',wrong:'proteger'}}]
 }),/participants/);
});
test('actions cannot be spoofed or executed on normal rounds',()=>{
 const start=scenario();
 assert.throws(()=>executeDuelRound(start,{choices:{third:'tecnica'}}),/unknown action owner/);
 assert.throws(()=>executeDuelRound(start,{choices:{a:'tecnica'}}),/outside decision window/);
 assert.throws(()=>executeDuelRound(start,{choices:{a:'root'}}),/invalid duel action/);
 assert.throws(()=>newDuelCombatSnapshot({
   fighterA:fighter('pecado_ban','a'),fighterB:fighter('samurai','a'),seed:2
 }),/two players/);
});
test('combat adapter advances session through three secret windows without exposing snapshot',()=>{
 let s=inviteStrategicDuel({id:'unit-duel',challenger:'a',opponent:'b',nowMs:1000});
 s={...s,combat:scenario()};
 s=acceptStrategicDuel(s,{playerId:'b',nowMs:1100});
 let time=1200;
 for(const [idx,round] of [3,7,11].entries()){
   s=advanceStoredDuelCombat(s,{nowMs:time});
   assert.equal(s.phase,'decision');
   assert.equal(s.round,round);
   assert.equal(s.combat.round,round);
   const publicView=publicStrategicDuel(s);
   assert.equal(JSON.stringify(publicView).includes('rngState'),false);
   assert.equal(JSON.stringify(publicView).includes('hiddenChoices'),false);
   assert.equal(JSON.stringify(publicView).includes('petBonus'),false);
   time+=1000;
   s=chooseDuelAction(s,{playerId:'a',choice:choices[round].a,nowMs:time});
   s=chooseDuelAction(s,{playerId:'b',choice:choices[round].b,nowMs:time+1});
   s=completeDuelDecision(s,{nowMs:time+2});
   assert.equal(s.phase,'combat');
   assert.equal(s.revealed.length,idx+1);
 }
 s=advanceStoredDuelCombat(s,{nowMs:time+3000});
 assert.equal(s.phase,'finished');
 assert.equal(s.combat.outcome.rounds,20);
 assert.equal(s.result.winnerId,s.combat.outcome.winnerId);
 assert.deepEqual(s.combat.fighters.map(f=>f.attackIndex),[20,20]);
});
test('a knockout before round 3 ends the duel without opening any decision',()=>{
 const a=fighter('pecado_escanor','a',{hp:1000}),b=fighter('warrior','b',{hp:1000});
 a.atk=50000;b.def=0;
 const combat=newDuelCombatSnapshot({fighterA:a,fighterB:b,seed:99});
 const r=runDuelToNextDecision(combat);
 assert.equal(r.finished,true);
 assert.equal(r.awaitingRound,null);
 assert.ok(r.combat.outcome.rounds<=2);
 assert.equal(r.combat.outcome.winnerId,'a');
});
test('tampered snapshots and premature replays are rejected',()=>{
 const invalid=fighter('pecado_ban','a');
 invalid.maxHp=4; invalid.hp=9000;
 assert.throws(()=>newDuelCombatSnapshot({
  fighterA:invalid,fighterB:fighter('samurai','b'),seed:1
 }),/HP/);
 assert.throws(()=>newDuelCombatSnapshot({
  fighterA:fighter('pecado_ban','a'),fighterB:fighter('samurai','b'),seed:-1
 }),/RNG seed/);
 let state=inviteStrategicDuel({id:'bad',challenger:'a',opponent:'b',nowMs:100});
 state=acceptStrategicDuel({...state,combat:scenario()}, {playerId:'b',nowMs:200});
 state.combat.fighters[1].jid='injected';
 assert.throws(()=>advanceStoredDuelCombat(state,{nowMs:500}),/identity mismatch/);
});
