import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
const view=app.slice(app.indexOf('function renderPets(){'),app.indexOf('function itemIcon(',app.indexOf('function renderPets(){')));

test('Pets page only offers owned pets and Raid/special summons',()=>{
  assert.match(view,/\['owned','Minha coleção/);
  assert.match(view,/\['raid','✨ Raid \/ especiais/);
  assert.match(view,/collection\(\)\.map\(ownedPetCard\)/);
  assert.match(view,/catalogPets\(\)\.filter\(x=>x\.source==='raid'\)/);
  assert.doesNotMatch(view,/data-pet-tab="adopt"/);
  assert.doesNotMatch(view,/\['adopt'/);
  assert.doesNotMatch(view,/petAdoptModal/);
});

test('No adoption controls or write actions are reachable from the Web',()=>{
  for (const forbidden of [
    /function petAdoptModal\(/,
    /petAdoptSpecies/,
    /data-pet-adopt/,
    /doAction\('pet\.adopt'/,
    /Adotar novo pet/,
    /Confirmar adoção/
  ]) assert.doesNotMatch(app,forbidden);
  assert.match(app,/data-pet-summon/);
  assert.match(app,/data-pet-team-save/);
  assert.match(app,/data-pet-select/);
});

test('PWA and app script have matching adoption removal cache markers',()=>{
  assert.match(sw,/adoption-disabled-v1/);
  assert.match(html,/\/app\.js\?v=[^"]*adoption-disabled-v1/);
});