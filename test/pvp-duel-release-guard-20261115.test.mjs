import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('production routing has not accidentally enabled interactive !duelo',()=>{
  const index=code('../src/neon/index.js');
  const db=code('../src/neon/db.js');
  assert.match(index,/\['batalhar','batalha','battle','duelo'\]\.includes\(cmd\)/);
  assert.doesNotMatch(index,/from '\.\/pvp-duel-persistence\.js'/);
  assert.doesNotMatch(index,/from '\.\/pvp-duel-round-engine\.js'/);
  assert.doesNotMatch(db,/from '\.\/pvp-duel-persistence\.js'/);
  assert.doesNotMatch(db,/from '\.\/pvp-duel-round-engine\.js'/);
  assert.match(db,/process\.env\.ALPHA_PVP_STRATEGY_ENABLED==='1'/);
  assert.match(db,/readBattleStrategies\(client,/);
});
test('new duel engine and persistence never write rewards or user HP directly',()=>{
  for(const file of [
    '../src/neon/pvp-duel-round-engine.js',
    '../src/neon/pvp-duel-combat-adapter.js',
    '../src/neon/pvp-duel-persistence.js',
    '../src/neon/pvp-duel-outbox-worker.js'
  ]){
    const src=code(file);
    assert.doesNotMatch(src,/\bUPDATE\s+stats\b|\bUPDATE\s+wallets\b|\bUPDATE\s+player_hero_mastery\b/i,file);
    assert.doesNotMatch(src,/\bINSERT\s+INTO\s+transactions\b/i,file);
  }
});
test('duel migrations cannot touch player progression or finances',()=>{
  const sql=code('../migrations/20261115_pvp_duel_sessions_NOT_APPLY.sql');
  assert.match(sql,/pvp_duel_sessions/);
  assert.match(sql,/pvp_duel_participants/);
  assert.match(sql,/pvp_duel_outbox/);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE|DROP|ALTER\s+TABLE)\s+(?:stats|wallets|player_hero_mastery|pet_collection|inventories)\b/i);
});
