import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const relic=readFileSync(new URL('../src/neon/relics.js',import.meta.url),'utf8');
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
const id='insignia_primeiros_conquistadores_20261102';
test('Primeiros Conquistadores: aparece no catalogo de reliquias equipaveis',()=>{
  assert.match(relic,/insignia_primeiros_conquistadores_20261102:/);
  const entry=relic.split(id+':')[1]?.split('\n')[0]||'';
  assert.match(entry,/boss:0\.07/);
  assert.match(entry,/raidAttack:0\.07/);
  assert.match(entry,/bossCrit:0\.03/);
  assert.match(entry,/raidCrit:0\.03/);
  assert.match(entry,/raid:0\.02/);
  assert.doesNotMatch(entry,/pvp:/i);
});
test('Primeiros Conquistadores: item nao comercializavel e nao empilhavel',()=>{
  assert.match(db,/starterItems\.push\(\['insignia_primeiros_conquistadores_20261102'/);
  assert.match(db,/sellable=FALSE,stackable=FALSE,price=0 WHERE id='insignia_primeiros_conquistadores_20261102'/);
});
