import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {profilePvpHp,profileHpLines} from '../src/neon/profile-pvp-hp.js';
import {applyVitalCombatHp} from '../src/neon/vital-pets.js';

test('perfil and duel have exactly the same maximum HP for Ban + Quimera',()=>{
  const input={hp:7530,maxHp:7530,petHpRate:640/7530};
  const profile=profilePvpHp(input);
  const duel=applyVitalCombatHp(7530,7530,640/7530,0,{pvp:true});
  assert.deepEqual(profile,duel);
  assert.equal(profile.maxHp,8170);
  assert.equal(profile.hp,8170);
  const displayed=profileHpLines({normalHp:7530,normalMaxHp:7530,pvpHp:profile.hp,pvpMaxHp:profile.maxHp});
  assert.match(displayed,/HP no PvP: \*8\.170\/8\.170\*/);
  assert.match(displayed,/HP normal: \*7\.530\/7\.530\*/);
});

test('profile after PvP defeat uses 25 percent normal HP and same PvP maximum',()=>{
  const profile=profilePvpHp({hp:1882,maxHp:7530,petHpRate:640/7530});
  assert.equal(profile.maxHp,8170);
  assert.equal(profile.hp,2042);
  const displayed=profileHpLines({normalHp:1882,normalMaxHp:7530,pvpHp:profile.hp,pvpMaxHp:profile.maxHp});
  assert.match(displayed,/HP no PvP: \*2\.042\/8\.170\*/);
  assert.match(displayed,/HP normal: \*1\.882\/7\.530\*/);
});

test('players without PvP vitality do not have an inflated HP profile',()=>{
  const pvp=profilePvpHp({hp:2000,maxHp:8000});
  assert.deepEqual({hp:pvp.hp,maxHp:pvp.maxHp},{hp:2000,maxHp:8000});
  assert.equal(profileHpLines({normalHp:2000,normalMaxHp:8000,pvpHp:pvp.hp,pvpMaxHp:pvp.maxHp}),'❤️ HP: *2.000/8.000*');
});

test('all profiles (heros and classes) use the same PvP projection when applicable',()=>{
  const index=fs.readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  const heroes=fs.readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  const duel=fs.readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  assert.match(index,/const hpForPvpProfile=profilePvpHp\(/);
  assert.match(index,/formatPlayableHeroCombatSheet\(heroSheet,\{compact:true,pvpHp:hpForPvpProfile\}\)/);
  assert.match(index,/profileHpLines\(\{normalHp:Number\(p\.effective_hp/);
  assert.match(heroes,/profileHpLines\(\{normalHp:sheet\.hp/);
  assert.match(duel,/applyVitalCombatHp\(baseHp,baseMax/);
});

test('duel report clarifies that KO is before respawn',()=>{
  const src=fs.readFileSync(new URL('../src/neon/pvp-report.js',import.meta.url),'utf8');
  assert.match(src,/Depois do duelo, o perdedor recupera 25% da vida normal/);
});
