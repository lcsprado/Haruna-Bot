import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=load('web/styles.css');

test('Garagem desktop: fotos da frota respeitam altura do quadro e nao cobrem atributos',()=>{
  assert.match(css,/\.race-fleet-visual\{height:clamp\(160px,17vw,220px\);min-height:0;max-height:none;overflow:hidden;min-width:0\}/);
  assert.match(css,/\.race-fleet-visual \.race-car-photo,\s*\.race-car-preview \.race-car-photo\{[^}]*height:100%;max-width:100%;max-height:100%;[^}]*aspect-ratio:auto;object-fit:contain;object-position:center/s);
  assert.match(css,/\.race-stat-grid\{display:grid/);
  assert.match(css,/\.race-fleet-actions\{margin-top:13px/);
});

test('Concessionaria desktop: as fotos permanecem dentro dos quatro cards',()=>{
  assert.match(css,/\.race-car-preview\{min-width:0;overflow:hidden\}/);
  assert.match(css,/\.race-car-preview\{height:132px;/);
  assert.match(css,/@media\(min-width:1200px\)\{\.race-model-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}\}/);
  const ui=load('web/racing-ui.js');
  assert.match(ui,/class="race-car-photo"/);
  assert.match(ui,/\/assets\/racing\//);
  assert.match(ui,/data-race-act/);
});

test('Mobile e telas intermediarias: a foto acompanha o tamanho do card',()=>{
  assert.match(css,/@media\(max-width:560px\)\{\s*\.race-fleet-visual\{height:155px\}/);
  assert.match(css,/\.race-car-preview\{height:90px\}/);
  assert.match(css,/\.race-hero-showroom>\.race-car-photo\{width:min\(100%,550px\);height:auto;max-height:285px/);
  assert.match(css,/\.race-shop-hero \.race-car-photo\{height:auto;max-height:230px;aspect-ratio:auto\}/);
  assert.match(css,/\.race-paint-stage \.race-car-photo\{height:auto;max-height:280px;aspect-ratio:auto\}/);
});

test('Mantem fotos originais, PWA e versao de estilo nova',()=>{
  assert.match(load('web/index.html'),/styles\.css\?v=2026\d{4}-[\w-]+/);
  assert.match(load('web/sw.js'),/garage-alpha2-v1/);
  assert.match(load('web/sw.js'),/alpha-fixed-art\.webp/);
  assert.match(load('web/sw.js'),/racing-ui\.js/);
});
