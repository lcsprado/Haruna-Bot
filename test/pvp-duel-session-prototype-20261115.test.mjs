import test from 'node:test';
import assert from 'node:assert/strict';
import {
 inviteStrategicDuel,acceptStrategicDuel,declineStrategicDuel,
 beginDuelDecision,chooseDuelAction,completeDuelDecision,
 finishStrategicDuel,publicStrategicDuel
} from '../src/neon/pvp-duel-session-prototype.js';

const invite=()=>inviteStrategicDuel({
 id:'battle-x-1',challenger:'playerA',opponent:'playerB',nowMs:1000
});

test('invitation must be accepted by target, expires and does not alter combat',()=>{
 const s=invite();
 assert.equal(s.phase,'invited');
 assert.throws(()=>acceptStrategicDuel(s,{playerId:'playerA',nowMs:2000}),/only invited/);
 assert.throws(()=>acceptStrategicDuel(s,{playerId:'playerB',nowMs:65001}),/expired/);
 const a=acceptStrategicDuel(s,{playerId:'playerB',nowMs:2000});
 assert.equal(a.phase,'ready');
 assert.equal(a.revision,1);
 assert.equal(s.phase,'invited');
 assert.throws(()=>acceptStrategicDuel(a,{playerId:'playerB',nowMs:3000}),/no pending/);
});
test('decline prevents combat and cannot be made by outside participant',()=>{
 const s=invite();
 assert.throws(()=>declineStrategicDuel(s,{playerId:'intruder',nowMs:1000}),/not a participant/);
 const d=declineStrategicDuel(s,{playerId:'playerB',nowMs:1000});
 assert.equal(d.phase,'cancelled');
 assert.throws(()=>beginDuelDecision(d,{round:3,nowMs:1500}),/not ready/);
});
test('secret decisions remain invisible until both participants submit, with idempotent retries',()=>{
 let s=acceptStrategicDuel(invite(),{playerId:'playerB',nowMs:2000});
 assert.throws(()=>beginDuelDecision(s,{round:7,nowMs:3000}),/invalid or replayed/);
 s=beginDuelDecision(s,{round:3,nowMs:3000});
 assert.equal(s.phase,'decision');
 s=chooseDuelAction(s,{playerId:'playerA',choice:'tecnica',nowMs:4000});
 assert.equal(s.interventions.playerA,1);
 assert.strictEqual(chooseDuelAction(s,{playerId:'playerA',choice:'tecnica',nowMs:4100}),s);
 assert.throws(()=>chooseDuelAction(s,{playerId:'playerA',choice:'proteger',nowMs:4100}),/conflicting/);
 assert.throws(()=>chooseDuelAction(s,{playerId:'intruder',choice:'proteger',nowMs:4100}),/not a participant/);
 assert.throws(()=>completeDuelDecision(s,{nowMs:7000}),/waiting/);
 const publicView=publicStrategicDuel(s);
 assert.equal(publicView.decision.submittedCount,1);
 assert.doesNotMatch(JSON.stringify(publicView),/playerA|playerB|tecnica/);
 // Persistence round-trip leaves identities and private actions intact, public summary still hides them.
 s=JSON.parse(JSON.stringify(s));
 s=chooseDuelAction(s,{playerId:'playerB',choice:'proteger',nowMs:5000});
 assert.equal(publicStrategicDuel(s).decision.ready,true);
 s=completeDuelDecision(s,{nowMs:5001});
 assert.deepEqual(s.revealed[0].choices,{playerA:'tecnica',playerB:'proteger'});
 assert.equal(s.currentDecision,null);
 assert.throws(()=>completeDuelDecision(s,{nowMs:6000}),/no active/);
});
test('three fixed decision windows, 30-second timeout, no defensive free action',()=>{
 let s=acceptStrategicDuel(invite(),{playerId:'playerB',nowMs:2000});
 for(const round of [3,7,11]){
   s=beginDuelDecision(s,{round,nowMs:10000*round});
   const deadline=s.currentDecision.deadlineAt;
   s=chooseDuelAction(s,{playerId:'playerA',choice:'atacar',nowMs:deadline-100});
   assert.throws(()=>completeDuelDecision(s,{nowMs:deadline-1}),/waiting/);
   s=completeDuelDecision(s,{nowMs:deadline});
   const out=s.revealed.at(-1);
   assert.equal(out.choices.playerA,'atacar');
   assert.equal(out.choices.playerB,'normal');
   assert.deepEqual(out.timedOut,['playerB']);
 }
 assert.equal(s.interventions.playerA,3);
 assert.equal(s.interventions.playerB,0);
 assert.throws(()=>beginDuelDecision(s,{round:11,nowMs:120000}),/invalid or replayed/);
 const f=finishStrategicDuel(s,{winnerId:'playerB',nowMs:121000});
 assert.equal(f.phase,'finished');
 assert.equal(f.result.winnerId,'playerB');
 assert.throws(()=>beginDuelDecision(f,{round:3,nowMs:130000}),/not ready/);
});
test('choosing after deadline is not accepted, invalid action not accepted',()=>{
 let s=acceptStrategicDuel(invite(),{playerId:'playerB',nowMs:2000});
 s=beginDuelDecision(s,{round:3,nowMs:3000,timeoutMs:2000});
 assert.throws(()=>chooseDuelAction(s,{playerId:'playerA',choice:'fugir',nowMs:4000}),/invalid intervention/);
 assert.throws(()=>chooseDuelAction(s,{playerId:'playerA',choice:'tecnica',nowMs:5001}),/expired/);
 assert.throws(()=>finishStrategicDuel(s,{winnerId:'playerA',nowMs:6000}),/cannot finish/);
});
