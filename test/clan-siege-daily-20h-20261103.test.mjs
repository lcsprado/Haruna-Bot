import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../src/neon/render.js',import.meta.url),'utf8');
const pure=source.replace(/^import .*;\s*$/gm,'');
const {siegeDailySchedule,resolveSiegeRound}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(pure));
const ms=iso=>Date.parse(iso);

test('cerco diario: hora exata de Brasilia, tolerancia de wakeup e exclusao antes/apos janela',()=>{
  const before=siegeDailySchedule(ms('2026-11-03T19:59:59-03:00'));
  const onTime=siegeDailySchedule(ms('2026-11-03T20:00:00-03:00'));
  const grace=siegeDailySchedule(ms('2026-11-03T20:14:59-03:00'));
  const tooLate=siegeDailySchedule(ms('2026-11-03T20:15:00-03:00'));
  assert.equal(before.opening,false);
  assert.equal(onTime.opening,true);
  assert.equal(grace.opening,true);
  assert.equal(tooLate.opening,false);
  assert.equal(onTime.day,'2026-11-03');
  assert.equal(onTime.startsAt,ms('2026-11-03T20:00:00-03:00'));
  assert.equal(siegeDailySchedule(ms('2026-11-04T20:00:00-03:00')).opening,true);
});

test('cerco diario: 6 rodadas de 5 min, sem acelerar se todos agirem e sem mudar premio',()=>{
  assert.match(source,/const LIMIT_HP=2000, MAX_ROUNDS=6, ROUND_MS=5\*60\*1000, MAX_REPAIR=2/);
  assert.match(source,/match\.created_by===DAILY_CREATED_BY\|\|moves\.length<4/);
  assert.match(source,/match\.created_by===DAILY_CREATED_BY\?Number\(match\.round_ends_at\)\+ROUND_MS/);
  assert.match(source,/grantFirstSiegeInsignias\(conn,updated\)/);
  const round=resolveSiegeRound({blue_clan_id:'5',red_clan_id:'7',
    blue_hp:2000,red_hp:2000,blue_repairs:0,red_repairs:0,blue_spy:0,red_spy:0,round:1},[]);
  assert.equal(round.finished,false);
  assert.deepEqual(round.hp,{blue:2000,red:2000});
});

test('cerco diario: inicia mesmo sem navegador aberto, mas so com 4 autorizados e sem guerras em duplicidade',()=>{
  const block=source.split('export async function startDailyClanSiege(nowMs=now())')[1]?.split('async function openMatch(conn,chat,locked=false)')[0]||'';
  assert.match(block,/dailySiegeTeams\(conn\)/);
  assert.match(block,/siegeBetaAuthorizedSet\(conn\)/);
  assert.match(block,/t\.jids\.some\(jid=>!approved\.has\(String\(jid\)\)\)/);
  assert.match(block,/pg_advisory_xact_lock/);
  assert.match(block,/created_by=\$2 AND created_at>=\$3 AND created_at<\$4/);
  assert.match(block,/if\(existing\)return \{started:false,reason:'match_open'\}/);
  assert.doesNotMatch(block,/web_sessions/);
  assert.match(block,/alpha_siege_roster/);
  assert.match(block,/alpha_web_action_outbox|notice\(conn,chat/);
});

test('cerco diario: processo agenda sweep independente de web aberto',()=>{
  assert.match(runtime,/setInterval\(\(\)=>/);
  assert.match(runtime,/void settleClanSiege\(\)/);
  assert.match(runtime,/\.then\(\(\)=>startDailyClanSiege\(\)\)/);
});
