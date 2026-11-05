import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');

test('Raid reanima pet de HP zero antes de avaliar roundActive',()=>{
  const raid=games.slice(games.indexOf('export async function raidRound('),games.indexOf('export async function getPlayerDamageStats(')>games.indexOf('export async function raidRound(')?games.indexOf('export async function getPlayerDamageStats('):games.indexOf('async function loadBossCombatPet('));
  assert.ok(raid.includes("context:'raid-revive'"));
  assert.ok(raid.includes("preRoundPetHeals.set(p.jid,healed)"));
  assert.ok(raid.indexOf("context:'raid-revive'")<raid.indexOf('p.pet.roundActive=Number(p.pet.energy)>0&&Number(p.pet.hp)>0'));
  assert.ok(raid.includes("autoPetHeal=preRoundPetHeals.get(p.jid)||null"));
  assert.ok(raid.includes('if(!petFainted&&!autoPetHeal'));
  assert.ok(raid.includes('}else if(!autoPetHeal){'));
});
test('Boss limita a uma poção por ataque, inclusive quando o pet começa desmaiado',()=>{
  const boss=games.slice(games.indexOf('export async function attackBoss('));
  assert.ok(boss.includes('if(canFight)autoPetHeal=await healBossCombatPet(c,jid,petRow)'));
  assert.ok(boss.includes('!pet.petFainted && !autoPetHeal'));
  assert.ok(boss.includes('if(!switched&&!autoPetHeal)'));
  assert.ok(boss.includes('Boolean(pet?.petFainted&&!petSwitch)'));
});
test('Raid e Boss não gastam poções em pet sem energia para voltar ao combate',()=>{
  assert.ok(games.includes("item_id='energetico_pet' AND quantity>0 FOR UPDATE"));
  assert.ok(games.includes('if(canFight){'));
});
