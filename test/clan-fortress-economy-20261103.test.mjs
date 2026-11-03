import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const f=read('../src/neon/clan-fortress.js').replace(/^import .*;\s*$/gm,'');
const s=read('../src/neon/clan-siege.js').replace(/^import .*;\s*$/gm,'');
const {clanFortressStats,clanFortressOffer}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(f));
const {resolveSiegeRound}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(s));
const match=(over={})=>({blue_clan_id:'5',red_clan_id:'7',
  blue_hp:2250,red_hp:2000,blue_repairs:0,red_repairs:0,blue_spy:0,red_spy:0,
  round:1,rules_version:3,blue_fortress:clanFortressStats({hp:5,attack:5,defense:5}),
  red_fortress:clanFortressStats(),...over});
const action=(clan_id,action)=>({clan_id,action});

test('o nivel antigo do cla nao amplifica automaticamente ataque, hp ou defesa',()=>{
  assert.deepEqual(clanFortressStats(),{maxHp:2000,attackPct:0,defensePct:0});
  assert.deepEqual(clanFortressStats({hp:5,attack:5,defense:5}),
    {maxHp:2250,attackPct:.1,defensePct:.075});
  assert.deepEqual(clanFortressStats({hp:999,attack:999,defense:999}),
    {maxHp:2250,attackPct:.1,defensePct:.075});
});

test('obra tem custo milionário progressivo, duração, nível máximo e sem gratuidade',()=>{
  const offers=[0,1,2,3,4].map(level=>clanFortressOffer('hp',level));
  assert.deepEqual(offers.map(o=>o.cost),[5000000,10000000,18000000,28000000,42000000]);
  assert.deepEqual(offers.map(o=>o.durationMs/3600000),[4,8,12,18,24]);
  assert.equal(clanFortressOffer('attack',5),null);
  assert.throws(()=>clanFortressOffer('damage',0),/inválida/);
});

test('versão 3 aplica bônus pequenos aos ataques e defesa sem afetar táticas de dupla',()=>{
  const result=resolveSiegeRound(match(),[action('5','attack'),action('7','attack')]);
  assert.equal(result.result.blueDamage,198);
  assert.equal(result.result.redDamage,167);
  assert.equal(result.hp.blue,2083);
  assert.equal(result.hp.red,1802);
  assert.equal(result.result.rulesVersion,3);
});

test('cura não ultrapassa teto individual da fortaleza',()=>{
  const r=resolveSiegeRound(match({blue_hp:2200}),[action('5','repair')]);
  assert.equal(r.hp.blue,2250);
  assert.equal(r.repairs.blue,1);
});

test('v1 e v2 preservam matemática histórica mesmo com snapshots presentes',()=>{
  const older=resolveSiegeRound(match({rules_version:1,blue_hp:2000,red_hp:2000}),[
    action('5','attack'),action('7','attack')]);
  assert.equal(older.result.blueDamage,180);
  assert.equal(older.result.redDamage,180);
  const v2=resolveSiegeRound(match({rules_version:2,blue_hp:2000,red_hp:2000}),[
    action('5','attack'),action('7','attack')]);
  assert.equal(v2.result.blueDamage,180);
  assert.equal(v2.result.redDamage,180);
});

test('o Cerco congela snapshot no inicio e so utiliza tesouro em nova obra',()=>{
  const siege=read('../src/neon/clan-siege.js');
  const module=read('../src/neon/clan-fortress.js');
  assert.match(siege,/clanFortressCombatSnapshot\(conn,teams\[0\]\.id,created\)/);
  assert.match(siege,/rules_version,blue_hp,red_hp,blue_fortress,red_fortress/);
  assert.match(module,/FOR UPDATE OF c/);
  assert.match(module,/UPDATE clans SET treasury=treasury-\$1 WHERE id=\$2 AND treasury>=\$1/);
  assert.match(module,/if\(row\.upgrading_stat\)/);
  assert.doesNotMatch(module,/UPDATE users SET/);
});
