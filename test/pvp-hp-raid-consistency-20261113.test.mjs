import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rebaseRaidHeroHp} from '../src/neon/raid-hero-hp-sync.js';
import {pvpWinnerByHealth} from '../src/neon/pvp-outcome-policy.js';
const raid=fs.readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
const db=fs.readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');

test('raid keeps an external potion heal while applying the current round damage',()=>{
  const x=rebaseRaidHeroHp({trackedStoredHp:6500,liveStoredHp:6577,projectedStoredHp:6480,storedMaxHp:6577,combatMaxHp:7314});
  assert.equal(x.externalDelta,77);
  assert.equal(x.storedHp,6557);
  assert.equal(x.combatHp,Math.round(6557/6577*7314));
});
test('raid preserves damage from a PvP fight that changed HP in parallel',()=>{
  const x=rebaseRaidHeroHp({trackedStoredHp:6500,liveStoredHp:2100,projectedStoredHp:6480,storedMaxHp:6577,combatMaxHp:7314});
  assert.equal(x.storedHp,2080);
  assert.ok(x.combatHp<2400);
});
test('no external update maintains the previous result and full HP is not inflated',()=>{
  const same=rebaseRaidHeroHp({trackedStoredHp:6500,liveStoredHp:6500,projectedStoredHp:6498,storedMaxHp:6577,combatMaxHp:7314});
  assert.equal(same.storedHp,6498);
  const full=rebaseRaidHeroHp({trackedStoredHp:6575,liveStoredHp:6577,projectedStoredHp:6577,storedMaxHp:6577,combatMaxHp:7314});
  assert.equal(full.storedHp,6577);
  assert.equal(full.combatHp,7314);
});
test('legacy raid room without tracked HP does not invent external changes',()=>{
  const x=rebaseRaidHeroHp({liveStoredHp:5200,projectedStoredHp:5100,storedMaxHp:6577,combatMaxHp:7314});
  assert.equal(x.externalDelta,0);
  assert.equal(x.storedHp,5100);
});
test('HP sync must be used for normal Raid rounds and victory finalization before writing stats',()=>{
  assert.match(raid,/rebaseRaidHeroHp\(\{trackedStoredHp:/);
  assert.match(raid,/SELECT hp FROM stats WHERE jid=\$1 FOR UPDATE/);
  assert.ok((raid.match(/rebaseRaidHeroHp\(\{trackedStoredHp:/g)||[]).length>=2);
});
test('at 20-round limit larger MAX HP alone does not determine winner',()=>{
  const ban={hp:3700,maxHp:7314},samurai={hp:3900,maxHp:8015};
  assert.equal(pvpWinnerByHealth(ban,samurai),ban);
  assert.equal(pvpWinnerByHealth({hp:0,maxHp:7314},samurai),samurai);
  assert.equal(pvpWinnerByHealth({hp:4000,maxHp:8000},{hp:2000,maxHp:4000},0.1).hp,4000);
  assert.equal(pvpWinnerByHealth({hp:4000,maxHp:8000},{hp:2000,maxHp:4000},0.9).hp,2000);
});
test('live PvP uses proportional comparison instead of old absolute HP tiebreak',()=>{
  assert.match(db,/pvpWinnerByHealth\(A,B\)/);
  assert.doesNotMatch(db,/A\.hp>B\.hp\?A:B/);
});
