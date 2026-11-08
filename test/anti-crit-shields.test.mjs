import test from 'node:test';
import assert from 'node:assert/strict';
import {ANTI_CRIT_SHIELDS,antiCritShieldStats,effectiveShieldedCritChance,shieldedCriticalMultiplier} from '../src/neon/anti-crit-shields.js';

test('cinco escudos com progressão exclusiva, sem ATK ou DEF',()=>{
 assert.equal(ANTI_CRIT_SHIELDS.length,5);
 assert.deepEqual(ANTI_CRIT_SHIELDS.map(x=>x.critResist),[.02,.04,.06,.09,.12]);
 for (const x of ANTI_CRIT_SHIELDS) {
  assert.equal(x.category,'shield');
  assert.equal(x.atk,undefined);
  assert.equal(x.def,undefined);
  const lv1=antiCritShieldStats(x.id,1),lv10=antiCritShieldStats(x.id,10);
  assert.equal(lv1.critResist,x.critResist);
  assert.ok(lv10.critResist>lv1.critResist);
  assert.ok(lv10.critGuard>lv1.critGuard);
  assert.ok(lv10.critResist<=.20);
  assert.ok(lv10.critGuard<=.30);
 }
});

test('anti-crítico reduz chance em pontos percentuais preservando mínimo residual',()=>{
 assert.equal(effectiveShieldedCritChance(.40,.12),.28);
 assert.equal(effectiveShieldedCritChance(.10,.18),.05);
 assert.equal(effectiveShieldedCritChance(.03,.18),.03);
 assert.equal(effectiveShieldedCritChance(.40,0),.40);
 assert.equal(effectiveShieldedCritChance(.40,2),.20);
});

test('guarda reduz somente o bônus de dano crítico, não o ataque comum',()=>{
 assert.equal(shieldedCriticalMultiplier(1.6,0),1.6);
 assert.ok(Math.abs(shieldedCriticalMultiplier(1.6,.25)-1.45)<1e-10);
 assert.equal(shieldedCriticalMultiplier(1,.30),1);
});

test('níveis inválidos e escudos desconhecidos não geram poder',()=>{
 assert.equal(antiCritShieldStats('qualquer',10),null);
 assert.deepEqual(antiCritShieldStats('escudo_madeira',0),antiCritShieldStats('escudo_madeira',1));
 assert.deepEqual(antiCritShieldStats('escudo_madeira',500),antiCritShieldStats('escudo_madeira',10));
});
