import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classHpWithEquipment} from '../src/neon/class-combat-balance.js';
import {classPvpAttack,classPvpDefense,PVP_AWAKENING_ROLES} from '../src/neon/pvp-class-powers.js';
import {formatPvpBattleReport} from '../src/neon/pvp-report.js';
import {auditSeventeen} from '../src/neon/pvp-balance-simulator.js';

test('class selection with gear never displays stored HP above max HP',()=>{
  assert.deepEqual(classHpWithEquipment(5213,4316,4316,2234),{hp:5213,maxHp:6550});
  assert.deepEqual(classHpWithEquipment(9000,4316,4316,2234),{hp:6550,maxHp:6550});
  assert.deepEqual(classHpWithEquipment(0,4316,4316,2234),{hp:0,maxHp:6550});
});

test('class reclassification retains the actual equipped-HP ratio, including forged items',()=>{
  assert.deepEqual(classHpWithEquipment(6550,4316,4200,2234),{hp:6434,maxHp:6434});
  const result=classHpWithEquipment(3275,4316,4200,2234);
  assert.equal(result.hp,3217);
  assert.equal(result.maxHp,6434);
  assert.deepEqual(classHpWithEquipment(4316,4316,4200,0),{hp:4200,maxHp:4200});
});

test('production class switch reads equipment and uses the same HP projection for status and persistence',()=>{
  const src=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  const body=src.slice(src.indexOf('export async function setPlayerClass('),src.indexOf('export async function claimCooldown('));
  assert.match(body,/weapon_id,armor_id,boot_id,helmet_id FROM stats/);
  assert.match(body,/const equippedStars=await getEquipmentStarLevels\(jid,\[st\.weapon_id,st\.armor_id\],client\)/);
  assert.match(body,/currentDisplay=classHpWithEquipment\(st\.hp,st\.max_hp,st\.max_hp,gearHp\)/);
  assert.match(body,/convertedHp=classHpWithEquipment\(st\.hp,oldMax,maxHp,gearHp\)/);
});

test('Samurai PvP awakening bonus is bounded without changing base attack or PvE skills',()=>{
  assert.equal(PVP_AWAKENING_ROLES.samurai.attack,.17);
  assert.equal(PVP_AWAKENING_ROLES.samurai.defense,.07);
  const noAwakening=classPvpAttack({classId:'samurai',damage:1000,awakeningStage:0,attackIndex:1});
  const base=classPvpAttack({classId:'samurai',damage:1000,awakeningStage:5,attackIndex:1});
  assert.equal(noAwakening.damage,1000);
  assert.equal(base.damage,1170);
  const burst=classPvpAttack({classId:'samurai',damage:1000,critical:true,awakeningStage:5,attackIndex:4,awakeningState:{focus:3}});
  assert.ok(burst.damage>base.damage);
  assert.ok(burst.damage<=1550,'Samurai stacked crit burst exceeds reviewed PvP ceiling');
  const reduced=classPvpDefense({classId:'samurai',damage:1000,awakeningStage:5,roll:.5,hp:5000,maxHp:5000});
  assert.equal(reduced.damage,930);
});

test('PvP report identifies active class and equipment separately from collab synergy',()=>{
  const r={
    ok:true,opening:{
      attacker:{jid:'a',name:'Hero',hp:1000,maxHp:1000,atk:1000,def:1000,spd:200,crit:.2,heroId:'pecado_diane',heroMasteryStage:5,heroGear:{weapon:false,armor:true,defense:.02},weaponName:'Outra arma',armorName:'Armadura Diane'},
      defender:{jid:'b',name:'Samurai',hp:1000,maxHp:1000,atk:1000,def:1000,spd:210,crit:.2,classId:'samurai',classApplied:true,awakeningStage:5,weaponName:'Katana Divina',armorName:'Armadura de Raid'}
    },log:[],roundCount:0,winner:{jid:'b',name:'Samurai',hp:1000},loser:{jid:'a',name:'Hero',hp:0},reward:0
  };
  const msg=formatPvpBattleReport(r);
  assert.match(msg,/Classe: \*Samurai\* • Despertar 5\/5/);
  assert.match(msg,/Arma em uso: \*Katana Divina\*/);
  assert.match(msg,/Arma correspondente não equipada/);
  assert.match(msg,/Arma em uso: \*Outra arma\*/);
});

test('round-robin regression: report Samurai versus Ban, Meliodas and Diane without player data',()=>{
  const result=auditSeventeen({duelsPerOrder:100,gear:false,awakening:5,mastery:5});
  const pairs=result.pairs.filter(x=>x.a.startsWith('pecado_')&&['paladin','berserker','samurai','necromancer'].includes(x.b));
  const wins=pairs.reduce((sum,p)=>sum+p.aWins,0),total=pairs.reduce((sum,p)=>sum+p.fights,0);
  const heroWins=100*wins/total;
  const samurai=pairs.filter(p=>p.b==='samurai').map(p=>({hero:p.a,winPct:p.winRateA}));
  console.log('ALPHA_PVP_SAMURAI_HERO_AUDIT '+JSON.stringify({heroWins,samurai}));
  assert.ok(heroWins>=60,'heroes too weak against four awakened classes');
});
