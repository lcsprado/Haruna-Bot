import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
const render=app.slice(app.indexOf('function renderPets(){'),app.indexOf('function itemIcon(',app.indexOf('function renderPets(){')));

test('Raid invocations are reachable at top of mobile Pets page',()=>{
  const nav=render.indexOf('pet-navigation-tabs');
  const composer=render.indexOf('pet-team-composer');
  const grid=render.indexOf('<div class="grid cards">');
  assert.ok(nav>=0 && composer>nav && grid>composer,'navigation must precede Team Pet and pet cards');
  assert.match(render,/data-pet-tab="raid">✨ Invocar pets de Raid/);
  assert.match(render,/\['raid','✨ Raid \/ especiais/);
  assert.match(render,/ui\.petTab==='owned' \? '<div class="card pet-team-composer">/);
  assert.match(render,/ui\.petTab==='raid'\?'<div class="section-title pet-raid-title">/);
  assert.match(render,/catalogPets\(\)\.filter\(x=>x\.source==='raid'\)\.map\(catalogPetCard\)/);
  assert.match(render,/Nenhum pet na sua coleção/);
});

test('Actual Raid summoning stays enabled and ordinary adoption remains closed',()=>{
  assert.match(app,/data-pet-summon/);
  assert.match(app,/doAction\('pet\.summon',\{materialId:x\.dataset\.petSummon\}/);
  assert.doesNotMatch(app,/doAction\('pet\.adopt'/);
  assert.doesNotMatch(render,/\['adopt'/);
  assert.match(app,/ui\.petTab=x\.dataset\.petTab==='raid'\?'raid':'owned'/);
});

test('PWA and CSS are versioned for updated mobile navigation',()=>{
  assert.match(css,/\.pet-navigation-tabs/);
  assert.match(sw,/raid-tabs-top-v1/);
  assert.match(html,/\/app\.js\?v=[^"]*raid-tabs-top-v1/);
  assert.match(html,/\/styles\.css\?v=[^"]*raid-tabs-top-v1/);
});
