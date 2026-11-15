import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {
  createPersistentDuel,mutatePersistentDuel,sweepPersistentDuelDeadlines,
  getPublicPersistentDuel,getPendingDuelEvents,resumePersistentDuelOnce
} from '../src/neon/pvp-duel-persistence.js';
import {claimDuelEvents,confirmDuelEvent,releaseDuelEvent,runDuelWorkerCycle} from '../src/neon/pvp-duel-outbox-worker.js';
import {saveStrategyPreference,readBattleStrategies} from '../src/neon/pvp-strategy-preferences.js';
import {beginDuelDecision} from '../src/neon/pvp-duel-session-prototype.js';

// Hard guard: tests run ONLY on the disposable local Postgres service.
const uri=process.env.ALPHA_PVP_TEST_DATABASE_URL||'';
let safe=false;
try{
  const parsed=new URL(uri);
  safe=['localhost','127.0.0.1'].includes(parsed.hostname)&&parsed.pathname==='/alpha_pvp_test';
}catch{}
if(!safe){
  test('integration test requires disposable localhost/alpha_pvp_test', {skip:true},()=>{});
}else{
  const pool=new pg.Pool({connectionString:uri,max:8});
  before(async()=>{
    const sql=readFileSync(new URL('../migrations/20261115_pvp_duel_sessions_NOT_APPLY.sql',import.meta.url),'utf8');
    await pool.query(sql);
    await pool.query('TRUNCATE pvp_duel_sessions CASCADE');
  });
  after(async()=>{await pool.end()});
  let serial=0;
  const duel=(prefix,challenger,opponent)=>({
    id:prefix+'-'+(++serial),challenger,opponent
  });
  test('concurrent invitations reserve participants atomically, with no partial session',async()=>{
    const x=duel('reserve','player-a','player-b');
    const first=await createPersistentDuel(pool,x);
    assert.equal(first.phase,'invited');
    const again=await createPersistentDuel(pool,x);
    assert.deepEqual(again,first);
    await assert.rejects(()=>createPersistentDuel(pool,duel('reserve','player-b','player-c')),/duplicate key/);
    const result=await pool.query('SELECT COUNT(*)::int AS n FROM pvp_duel_sessions');
    assert.equal(result.rows[0].n,1);
    const count=await pool.query('SELECT COUNT(*)::int AS n FROM pvp_duel_participants');
    assert.equal(count.rows[0].n,2);
  });
  test('accept only by invited opponent; secret choice isolated from public state and outbox',async()=>{
    const x=duel('private','player-q','player-r');
    await createPersistentDuel(pool,x);
    await assert.rejects(()=>mutatePersistentDuel(pool,{id:x.id,command:'accept',playerId:'outsider'}),/not a participant/);
    await mutatePersistentDuel(pool,{id:x.id,command:'accept',playerId:x.opponent});
    let r=await mutatePersistentDuel(pool,{id:x.id,command:'open',args:{round:3}});
    assert.equal(r.phase,'decision');
    assert.equal(r.decision.submittedCount,0);
    r=await mutatePersistentDuel(pool,{id:x.id,command:'choose',playerId:x.challenger,args:{choice:'tecnica'}});
    assert.equal(r.decision.submittedCount,1);
    assert.doesNotMatch(JSON.stringify(r),/tecnica|player-q|player-r/);
    const before=await pool.query('SELECT payload FROM pvp_duel_outbox WHERE duel_id=$1 AND kind=$2',[x.id,'choice_recorded']);
    assert.equal(before.rowCount,1);
    assert.doesNotMatch(JSON.stringify(before.rows[0].payload),/tecnica|player-q|player-r/);
    const duplicate=await mutatePersistentDuel(pool,{id:x.id,command:'choose',playerId:x.challenger,args:{choice:'tecnica'}});
    assert.equal(duplicate.revision,r.revision);
    await assert.rejects(()=>mutatePersistentDuel(pool,{id:x.id,command:'choose',playerId:x.challenger,args:{choice:'atacar'}}),/conflicting/);
    r=await mutatePersistentDuel(pool,{id:x.id,command:'choose',playerId:x.opponent,args:{choice:'proteger'}});
    assert.equal(r.phase,'combat','second vote immediately resolves decision');
    assert.equal(r.revealed[0].choices[x.challenger],'tecnica');
    assert.equal(r.revealed[0].choices[x.opponent],'proteger');
    const events=await getPendingDuelEvents(pool,{limit:100});
    assert.equal(events.filter(e=>e.duel_id===x.id&&e.kind==='round_resolved').length,1);
    assert.equal(events.filter(e=>e.duel_id===x.id&&e.kind==='choice_recorded').length,1);
  });
  test('30 second timeout survives storage and resolves non-response as normal',async()=>{
    const x=duel('timeout','slow-a','slow-b');
    await createPersistentDuel(pool,x);
    await mutatePersistentDuel(pool,{id:x.id,command:'accept',playerId:x.opponent});
    await mutatePersistentDuel(pool,{id:x.id,command:'open',args:{round:3}});
    await mutatePersistentDuel(pool,{id:x.id,command:'choose',playerId:x.challenger,args:{choice:'proteger'}});
    await pool.query(`UPDATE pvp_duel_sessions
      SET state=jsonb_set(state,'{currentDecision,deadlineAt}',to_jsonb((extract(epoch from clock_timestamp())*1000)::bigint-1)),
      next_deadline_at=clock_timestamp()-interval '1 second'
      WHERE id=$1`,[x.id]);
    const advanced=await sweepPersistentDuelDeadlines(pool);
    const just=advanced.find(e=>e.id===x.id);
    assert.equal(just?.kind,'round_resolved');
    assert.equal(just?.state.phase,'combat');
    assert.equal(just.state.revealed[0].choices[x.challenger],'proteger');
    assert.equal(just.state.revealed[0].choices[x.opponent],'normal');
    const twice=await sweepPersistentDuelDeadlines(pool);
    assert.equal(twice.some(e=>e.id===x.id),false);
    const publicState=await getPublicPersistentDuel(pool,x.id);
    assert.equal(publicState.phase,'combat');
    assert.equal(publicState.revealed.length,1);
  });
  test('stale revision cannot overwrite a committed action',async()=>{
    const x=duel('cas','cas-a','cas-b');
    await createPersistentDuel(pool,x);
    const accepted=await mutatePersistentDuel(pool,{id:x.id,command:'accept',playerId:x.opponent,expectedRevision:0});
    assert.equal(accepted.revision,1);
    await assert.rejects(()=>mutatePersistentDuel(pool,{id:x.id,command:'open',args:{round:3},expectedRevision:0}),/stale duel revision/);
    const opened=await mutatePersistentDuel(pool,{id:x.id,command:'open',args:{round:3},expectedRevision:1});
    assert.equal(opened.revision,2);
  });
  test('invitation expiry returns both players to pool without money or HP writes',async()=>{
    const x=duel('invite-expire','reusable-a','reusable-b');
    await createPersistentDuel(pool,x);
    await pool.query(`UPDATE pvp_duel_sessions SET
      state=jsonb_set(state,'{inviteExpiresAt}',to_jsonb((extract(epoch from clock_timestamp())*1000)::bigint-1)),
      next_deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1`,[x.id]);
    const results=await sweepPersistentDuelDeadlines(pool);
    assert.equal(results.find(z=>z.id===x.id)?.kind,'expired');
    assert.equal((await getPublicPersistentDuel(pool,x.id)).phase,'cancelled');
    const people=await pool.query('SELECT COUNT(*)::int AS n FROM pvp_duel_participants WHERE duel_id=$1',[x.id]);
    assert.equal(people.rows[0].n,0);
    const second=await createPersistentDuel(pool,duel('invite-reuse','reusable-a','reusable-b'));
    assert.equal(second.phase,'invited');
  });
  test('hard expiry protects against orphaned duel after bot restarts',async()=>{
    const x=duel('hard-expire','hard-a','hard-b');
    await createPersistentDuel(pool,x);
    await mutatePersistentDuel(pool,{id:x.id,command:'accept',playerId:x.opponent});
    await pool.query(`UPDATE pvp_duel_sessions SET hard_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,[x.id]);
    const results=await sweepPersistentDuelDeadlines(pool);
    assert.equal(results.find(z=>z.id===x.id)?.kind,'expired');
    assert.equal((await getPublicPersistentDuel(pool,x.id)).phase,'cancelled');
    const res=await pool.query('SELECT COUNT(*)::int AS n FROM pvp_duel_participants WHERE jid=ANY($1::text[])',[['hard-a','hard-b']]);
    assert.equal(res.rows[0].n,0);
  });
  test('two workers never claim the same event; lease token prevents stale acknowledgements',async()=>{
    await pool.query("UPDATE pvp_duel_outbox SET delivered_at=clock_timestamp() WHERE delivered_at IS NULL");
    const x=duel('lease','lease-a','lease-b');
    await createPersistentDuel(pool,x);
    const [w1,w2]=await Promise.all([
      claimDuelEvents(pool,{limit:20,leaseMs:10000}),
      claimDuelEvents(pool,{limit:20,leaseMs:10000})
    ]);
    const combined=[...w1,...w2];
    assert.equal(combined.length,1);
    const item=combined[0];
    assert.equal(item.duel_id,x.id);
    assert.equal(item.kind,'invited');
    assert.equal(await confirmDuelEvent(pool,{eventId:item.event_id,leaseToken:'wrong'}),false);
    assert.deepEqual(await claimDuelEvents(pool,{limit:5}),[]);
    await pool.query("UPDATE pvp_duel_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE event_id=$1",[item.event_id]);
    const retry=await claimDuelEvents(pool,{limit:5});
    assert.equal(retry.length,1);
    assert.equal(retry[0].event_id,item.event_id);
    assert.notEqual(retry[0].lease_token,item.lease_token);
    assert.equal(await confirmDuelEvent(pool,{eventId:item.event_id,leaseToken:item.lease_token}),false);
    assert.equal(await confirmDuelEvent(pool,{eventId:item.event_id,leaseToken:retry[0].lease_token}),true);
    assert.deepEqual(await claimDuelEvents(pool,{limit:5}),[]);
  });
  test('failed notification is retried and acknowledged only after handler success',async()=>{
    await pool.query("UPDATE pvp_duel_outbox SET delivered_at=clock_timestamp() WHERE delivered_at IS NULL");
    const x=duel('notify','notify-a','notify-b');
    await createPersistentDuel(pool,x);
    const fail=await runDuelWorkerCycle(pool,{publish:async()=>{throw new Error('simulated WhatsApp outage')},resumeCombat:async()=>{}});
    assert.equal(fail.failed.length,1);
    assert.match(fail.failed[0].error,/simulated WhatsApp outage/);
    assert.equal(fail.completed.length,0);
    const recv=[];
    const pass=await runDuelWorkerCycle(pool,{publish:async event=>recv.push(event),resumeCombat:async()=>{}});
    assert.equal(pass.failed.length,0);
    assert.equal(pass.completed.length,1);
    assert.equal(recv[0].kind,'invited');
    assert.match(recv[0].idempotencyKey,/^pvp-duel:/);
    const third=await runDuelWorkerCycle(pool,{publish:async()=>{throw new Error('duplicate')},resumeCombat:async()=>{}});
    assert.equal(third.completed.length,0);
  });
  test('resolved decision triggers resumeCombat with revealed action, never premature disclosure',async()=>{
    await pool.query("UPDATE pvp_duel_outbox SET delivered_at=clock_timestamp() WHERE delivered_at IS NULL");
    const x=duel('resume','resume-a','resume-b');
    await createPersistentDuel(pool,x);
    await mutatePersistentDuel(pool,{id:x.id,command:'accept',playerId:x.opponent});
    await mutatePersistentDuel(pool,{id:x.id,command:'open',args:{round:3}});
    await mutatePersistentDuel(pool,{id:x.id,command:'choose',playerId:x.challenger,args:{choice:'tecnica'}});
    const publicEvents=[],resolved=[];
    const first=await runDuelWorkerCycle(pool,{
      publish:async e=>publicEvents.push(e),
      resumeCombat:async e=>resolved.push(e)
    });
    assert.equal(first.failed.length,0);
    assert.equal(resolved.filter(e=>e.kind==='round_resolved').length,0);
    assert.equal(resolved.filter(e=>e.kind==='accepted').length,1);
    assert.ok(publicEvents.every(e=>!JSON.stringify(e.state).includes('tecnica')));
    await mutatePersistentDuel(pool,{id:x.id,command:'choose',playerId:x.opponent,args:{choice:'proteger'}});
    const next=await runDuelWorkerCycle(pool,{
      publish:async e=>publicEvents.push(e),
      resumeCombat:async e=>resolved.push(e)
    });
    assert.equal(next.failed.length,0);
    const finalRound=resolved.filter(e=>e.kind==='round_resolved');
    assert.equal(finalRound.length,1);
    assert.equal(finalRound[0].state.revealed[0].choices[x.challenger],'tecnica');
    assert.equal(finalRound[0].state.revealed[0].choices[x.opponent],'proteger');
    assert.equal((await runDuelWorkerCycle(pool,{
      publish:async()=>{},resumeCombat:async()=>{throw new Error('unexpected replay')}
    })).completed.length,0);
  });


  test('posture migration works in disposable PostgreSQL and never mixes players or characters',async()=>{
    const prefs=readFileSync(new URL('../migrations/20261115_pvp_strategy_preferences_NOT_APPLY.sql',import.meta.url),'utf8');
    await pool.query(prefs);
    await pool.query('CREATE TABLE IF NOT EXISTS stats (jid TEXT PRIMARY KEY,class_id TEXT)');
    await pool.query('CREATE TABLE IF NOT EXISTS player_class_levels (jid TEXT,class_id TEXT)');
    await pool.query('CREATE TABLE IF NOT EXISTS pet_collection (jid TEXT,species TEXT)');
    await pool.query("INSERT INTO stats(jid,class_id) VALUES('pref-a','samurai'),('pref-b','paladin') ON CONFLICT(jid) DO NOTHING");
    await pool.query("INSERT INTO pet_collection(jid,species) VALUES('pref-a','pecado_ban'),('pref-a','pecado_diane')");
    const set=await saveStrategyPreference(pool,{jid:'pref-a',combatantId:'pecado_ban',posture:'tatica'});
    assert.equal(set.posture,'tatica');
    await saveStrategyPreference(pool,{jid:'pref-a',combatantId:'pecado_diane',posture:'defensiva'});
    await saveStrategyPreference(pool,{jid:'pref-a',combatantId:'samurai',posture:'agressiva'});
    await saveStrategyPreference(pool,{jid:'pref-b',combatantId:'paladin',posture:'defensiva'});
    const result=await readBattleStrategies(pool,[
      {jid:'pref-a',combatantId:'pecado_ban'},
      {jid:'pref-b',combatantId:'paladin'}
    ],{enabled:true});
    assert.deepEqual(result,{'pref-a':'tatica','pref-b':'defensiva'});
    const a=await readBattleStrategies(pool,[{jid:'pref-a',combatantId:'samurai'}],{enabled:true});
    assert.deepEqual(a,{'pref-a':'agressiva'});
    await assert.rejects(()=>saveStrategyPreference(pool,{
      jid:'pref-b',combatantId:'pecado_ban',posture:'tatica'
    }),/nao pertence/);
    const noDb=await readBattleStrategies({
      query(){throw new Error('flag OFF should not query database')}
    },[{jid:'pref-a',combatantId:'pecado_ban'}],{enabled:false});
    assert.deepEqual(noDb,{'pref-a':'equilibrada'});
  });

  test('a retried accepted event cannot advance the persisted duel twice',async()=>{
    const x=duel('advance-once','advance-a','advance-b');
    await createPersistentDuel(pool,x);
    const accepted=await mutatePersistentDuel(pool,{id:x.id,command:'accept',playerId:x.opponent});
    const advance=(state,{nowMs})=>beginDuelDecision(state,{round:3,nowMs,timeoutMs:30000});
    const [a,b]=await Promise.all([
      resumePersistentDuelOnce(pool,{id:x.id,sourceRevision:accepted.revision,advance}),
      resumePersistentDuelOnce(pool,{id:x.id,sourceRevision:accepted.revision,advance})
    ]);
    assert.equal([a,b].filter(r=>r.applied).length,1);
    assert.equal([a,b].filter(r=>!r.applied).length,1);
    const current=await getPublicPersistentDuel(pool,x.id);
    assert.equal(current.phase,'decision');
    assert.equal(current.revision,accepted.revision+1);
    const events=await pool.query("SELECT COUNT(*)::int AS n FROM pvp_duel_outbox WHERE duel_id=$1 AND kind='decision_opened'",[x.id]);
    assert.equal(events.rows[0].n,1);
    const replay=await resumePersistentDuelOnce(pool,{id:x.id,sourceRevision:accepted.revision,advance});
    assert.equal(replay.applied,false);
    await assert.rejects(()=>resumePersistentDuelOnce(pool,{
      id:x.id,sourceRevision:current.revision,
      advance:state=>({...state,revision:state.revision+1,phase:'combat'})
    }),/duel not ready|invalid combat transition/);
    assert.deepEqual((await getPublicPersistentDuel(pool,x.id)).revision,current.revision);
  });
}
