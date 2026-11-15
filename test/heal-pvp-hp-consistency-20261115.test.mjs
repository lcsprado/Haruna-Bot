import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {potionHpReceipt,potionPvpProjection} from '../src/neon/potion-hp-receipt.js';
import {profilePvpHp} from '../src/neon/profile-pvp-hp.js';

test('João Pedro full elixir: 7.987 normal and 8.207 in profile/PvP',()=>{
  const potion={name:'Elixir Supremo',before:765,hp:7987,maxHp:7987,healed:7222};
  // 5,509% de sinergia, com metade efetiva no PvP: +220 HP.
  const bonus={petHpRate:0,teamHpRate:2*220/7987};
  const view=potionPvpProjection(potion,null,bonus);
  assert.equal(view.normal.after,7987);
  assert.equal(view.normal.healed,7222);
  assert.equal(view.pvp.maxHp,8207);
  assert.equal(view.pvp.hp,8207);
  assert.equal(view.healedPvp,7421);
  assert.equal(profilePvpHp({hp:7987,maxHp:7987,...bonus}).maxHp,8207);
  const receipt=potionHpReceipt(potion,null,bonus);
  assert.match(receipt,/HP no PvP: \*8\.207\/8\.207\*/);
  assert.match(receipt,/HP normal após a cura: \*7\.987\/7\.987\*/);
  assert.match(receipt,/\+7\.421 HP recuperados na escala do PvP/);
  assert.match(receipt,/\+7\.222 HP normal/);
  assert.match(receipt,/\+220 HP máximo/);
});

test('Ban with Quimera keeps the same HP on healing and on profile',()=>{
  const potion={name:'Elixir Supremo',before:4200,hp:7530,maxHp:7530,healed:3330};
  const bonus={petHpRate:640/7530,teamHpRate:0};
  const result=potionPvpProjection(potion,null,bonus);
  assert.equal(result.pvp.maxHp,8170);
  assert.equal(result.pvp.hp,8170);
  assert.match(potionHpReceipt(potion,null,bonus),/HP no PvP: \*8\.170\/8\.170\*/);
});
test('regular player without vitality sees identical PvP and normal HP',()=>{
  const potion={name:'Poção Média',before:1000,hp:2000,maxHp:3000,healed:1000};
  const result=potionPvpProjection(potion,null);
  assert.equal(result.normal.maxHp,result.pvp.maxHp);
  assert.equal(result.normal.healed,result.healedPvp);
  assert.match(potionHpReceipt(potion,null),/HP no PvP: \*2\.000\/3\.000\*/);
});
test('hero life scale adjusts healed amount before projecting PvP pet bonus',()=>{
  const potion={name:'Elixir Supremo',before:3300,hp:6600,maxHp:6600,healed:3300};
  const result=potionPvpProjection(potion,{maxHp:7500},{petHpRate:.08});
  assert.equal(result.normal.maxHp,7500);
  assert.equal(result.normal.healed,3750);
  assert.equal(result.pvp.maxHp,8100);
  assert.equal(result.healedPvp,4050);
});
test('all four usePotion routes fetch the same pet/team synergy as profile',()=>{
  const code=fs.readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  assert.match(code,/async function potionReceiptForPlayer\(jid,potion,heroSheet=null\)/);
  assert.match(code,/petTeamSynergy\(team\|\|\[\]\)/);
  assert.match(code,/petPvpSpecialty\(pet\.species,pet\.level\)/);
  assert.equal((code.match(/potionReceiptForPlayer\(sender,r,/g)||[]).length,4);
  assert.equal((code.match(/usePotion\(sender,/g)||[]).length,4);
});
