import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PECADOS_HERO_IDS} from '../src/neon/sete-pecados-catalog.js';
import {PET_STATUS_SPECIALTIES} from '../src/neon/game-catalog.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const eventIds=[
  'corcel_espectral_halloween','manticora_eclipse_20261030','guaxinim_errante_20261027',
  'onca_eclipse_20261026','lince_astral','raposa_astral'
];

test('seis pets exclusivos têm WebPs próprios, distintos e otimizados',()=>{
  const hashes=new Set();
  for(const id of eventIds){
    const url=new URL(`web/assets/pets/${id}.webp`,root);
    const bytes=readFileSync(url);
    assert.equal(bytes.toString('ascii',0,4),'RIFF',id);
    assert.equal(bytes.toString('ascii',8,12),'WEBP',id);
    assert.ok(statSync(url).size<500_000,`${id} excede 500 KB`);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size,eventIds.length);
});

test('os IDs usam o renderizador real e entram no cache PWA',()=>{
  const app=read('web/app.js'),sw=read('web/sw.js'),audit=read('web/pet-art-audit.html');
  for(const id of eventIds){
    assert.ok(app.includes(`${id}:'/assets/pets/${id}.webp'`),id);
    assert.ok(sw.includes(`/assets/pets/${id}.webp`),id);
    assert.ok(audit.includes(`'${id}'`),id);
  }
  assert.match(app,/window\.alphaPetArtAudit=Object\.freeze\(\{render:petVisualMarkup\}\)/);
  assert.match(audit,/portrait\.innerHTML=render\(name/);
  assert.match(app,/urso_runico:'fixed-urso-runico'/);
  assert.doesNotMatch(audit,/urso_runico\.svg|rasterNames/);
});

test('Sete Pecados permanecem personagens, sem especialidades ou catálogo pet',()=>{
  for(const id of PECADOS_HERO_IDS)assert.equal(PET_STATUS_SPECIALTIES[id],undefined,id);
  const api=read('src/neon/web-api.js'),app=read('web/app.js'),heroes=read('src/neon/playable-heroes.js');
  assert.match(api,/\[\.\.\.adoptable,\.\.\.legendary\]\.filter\(p=>!PECADOS_HERO_IDS\.includes\(p\.species\)\)/);
  assert.match(app,/\.filter\(p=>!COLLAB_HERO_ART\[p\.species\]\)/);
  assert.match(heroes,/SELECT species,MAX\(level\)::int AS level,MAX\(xp\)::int AS xp,COUNT\(\*\)::int AS copies FROM pet_collection/);
});
