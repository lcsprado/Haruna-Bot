import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isWeeklySiegeXpMatch,weeklySiegeXpFor,SIEGE_WEEKLY_XP} from '../src/neon/clan-siege-weekly-xp.js';

const date=Date.parse('2026-11-07T21:30:00-03:00');
const base={
  rules_version:5,status:'completed',
  created_by:'system:siege-daily-20h',created_at:date,
  blue_clan_id:100,red_clan_id:200,winner_clan_id:100
};
test('Cerco V5 semanal credita 150k aos campeões e 70k aos vices',()=>{
  assert.equal(isWeeklySiegeXpMatch(base),true);
  assert.equal(weeklySiegeXpFor(base,100,2),150000);
  assert.equal(weeklySiegeXpFor(base,200,2),70000);
  assert.equal(weeklySiegeXpFor({...base,winner_clan_id:null},100,2),100000);
  assert.deepEqual(SIEGE_WEEKLY_XP,{winner:150000,loser:70000,draw:100000});
});
test('Nao credita sem participacao suficiente, em evento antigo ou sem fechar',()=>{
  assert.equal(weeklySiegeXpFor(base,100,1),0);
  assert.equal(weeklySiegeXpFor({...base,created_at:Date.parse('2026-11-04T21:30:00-03:00')},100,6),0);
  assert.equal(weeklySiegeXpFor({...base,status:'active'},100,6),0);
  assert.equal(weeklySiegeXpFor({...base,rules_version:4},100,6),0);
  assert.equal(weeklySiegeXpFor({...base,created_by:'player'},100,6),0);
});
test('Integracao: credito atomico e idempotente no encerramento',()=>{
  const weekly=readFileSync(new URL('../src/neon/clan-siege-weekly-xp.js',import.meta.url),'utf8');
  const siege=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
  assert.match(weekly,/ON CONFLICT\(match_id,jid\) DO NOTHING RETURNING jid/);
  assert.match(weekly,/ignoreXpBoost:true,ignoreGroupProgressionEvent:true/);
  assert.match(weekly,/COUNT\(DISTINCT round\)/);
  assert.match(siege,/await ensureSiegeWeeklyXpSchema\(db\)/);
  assert.match(siege,/r.finished\?await grantSiegeWeeklyXp\(conn,updated\):null/);
});
