import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
const action=api.slice(api.indexOf("case 'pet.heal':"),api.indexOf("case 'raid.create':"));

test('Web adoption endpoint denies writes rather than calling adoptPet',()=>{
  assert.match(action,/case 'pet\.adopt': throw new Error\('Adoção comum foi encerrada/);
  assert.doesNotMatch(action,/adoptPet\(/);
});

test('Owned pets still load, equip and heal; Raid summon stays available',()=>{
  for(const expected of [
    'listPets(jid)', 'getPetTeam(jid)', "case 'pet.select':",
    "case 'pet.rename':", "case 'pet.team':", "case 'pet.summon':"
  ]) assert.ok(api.includes(expected),expected);
  assert.match(api,/ADOPTABLE_PETS\.map\(p=>\(\{\.\.\.p,source:'adoption'\}\)\)/);
});