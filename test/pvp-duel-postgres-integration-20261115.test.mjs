import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {
  createPersistentDuel,mutatePersistentDuel,sweepPersistentDuelDeadlines,
  getPublicPersistentDuel,getPendingDuelEvents
} from '../src/neon/pvp-duel-persistence.js';

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
}
