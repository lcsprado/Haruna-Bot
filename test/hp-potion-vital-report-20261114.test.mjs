import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {potionDisplayHp,potionHpReceipt} from '../src/neon/potion-hp-receipt.js';
import {applyVitalCombatHp,restoreVitalPersistentHp} from '../src/neon/vital-pets.js';
import {formatPvpBattleReport} from '../src/neon/pvp-report.js';

test('PvP Leviatã: 7.482 HP normal becomes 8.018 temporary, without altering persistence',()=>{
  const base=7482,extra=536;
  const pvp=applyVitalCombatHp(base,base,extra/base,0,{pvp:true});
  assert.deepEqual({hp:pvp.hp,maxHp:pvp.maxHp,bonus:pvp.maxHp-base},{hp:8018,maxHp:8018,bonus:536});
  assert.equal(restoreVitalPersistentHp(pvp.hp,pvp.maxHp,base),base);
});
test('partial HP preserves percentage under PvP vitality, returns to original scale',()=>{
  const base=7482,part=3741,extra=536;
  const pvp=applyVitalCombatHp(part,base,extra/base,0,{pvp:true});
  assert.equal(pvp.maxHp,8018);
  assert.equal(pvp.hp,4009);
  assert.equal(restoreVitalPersistentHp(pvp.hp,pvp.maxHp,base),part);
});
test('potion receipt uses consistent hero HP scale for both healing amount and max',()=>{
  const potion={name:'Elixir Supremo',before:3700,hp:6787,maxHp:6787,healed:3087};
  const view=potionDisplayHp(potion,{maxHp:7482});
  assert.equal(view.maxHp,7482);
  assert.equal(view.after,7482);
  assert.equal(view.healed,view.after-view.before);
  assert.ok(view.healed>3087);
  const receipt=potionHpReceipt(potion,{maxHp:7482});
  assert.match(receipt,/HP normal após a cura: \*7\.482\/7\.482\*/);
  assert.match(receipt,/Bônus temporários/);
});
test('potion receipt never changes healing scale for a normal class',()=>{
  const x=potionDisplayHp({name:'Poção',before:100,hp:150,maxHp:200,healed:50});
  assert.deepEqual({before:x.before,after:x.after,max:x.maxHp,heal:x.healed},{before:100,after:150,max:200,heal:50});
});
test('pvp opening discloses base HP and temporary pet bonus for any player',()=>{
  const a={jid:'lp',name:'LP',heroId:'pecado_ban',heroMasteryStage:5,
    hp:8018,maxHp:8018,vitalBaseHp:7482,vitalBaseMaxHp:7482,
    vitalHpRate:536/7482,vitalPulseRate:0.0167,
    atk:1663,def:1491,spd:688,crit:.378,petName:'Leviatã da Eternidade',petPvpBonus:{}};
  const b={jid:'jp',name:'João Pedro',hp:8084,maxHp:8095,atk:1683,def:1697,spd:673,crit:.538};
  const report=formatPvpBattleReport({
    ok:true,winner:{name:'João Pedro',hp:467},loser:{name:'LP'},
    opening:{attacker:a,defender:b},log:[],roundCount:0,
    ending:{attackerHp:0,defenderHp:467},reward:603
  });
  assert.match(report,/HP no PvP: 8\.018\/8\.018/);
  assert.match(report,/HP normal: 7\.482\/7\.482/);
  assert.match(report,/Bônus temporário no PvP: \+536 HP máximo/);
  assert.match(report,/Coração Eterno/);
});
test('all four WhatsApp potion paths use the same receipt',()=>{
  const source=fs.readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  assert.equal((source.match(/usePotion\(sender,/g)||[]).length,4);
  assert.equal((source.match(/potionReceiptForPlayer\(sender,r,/g)||[]).length,4);
  assert.match(source,/return potionHpReceipt\(potion,heroSheet,/);
  assert.doesNotMatch(source,/finalHeal=healedHero/);
});
test('PvP snapshot includes normal and temporary HP without modifying combat math',()=>{
  const source=fs.readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  assert.match(source,/fighter\.vitalBaseHp=baseHp/);
  assert.match(source,/vitalBaseHp:Number\(fighter\.vitalBaseHp/);
  assert.match(source,/applyVitalCombatHp\(baseHp,baseMax/);
});
