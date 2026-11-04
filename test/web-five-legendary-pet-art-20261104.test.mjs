import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const ids=['cervo_aurora_viva','guardiao_nucleo_vital','quimera_rubra','serafim_vida_abissal','leviata_eternidade'];

test('cinco pets lendários têm artes WebP individuais e válidas',()=>{
 const hashes=new Set();
 for(const id of ids){
  const path=new URL(`web/assets/pets/${id}.webp`,root);
  const bytes=readFileSync(path);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.ok(statSync(path).size<500_000,`${id} excede 500 KB`);
  hashes.add(createHash('sha256').update(bytes).digest('hex'));
 }
 assert.equal(hashes.size,5);
});

test('os cinco IDs usam o renderizador comum e o cache da Web',()=>{
 const app=read('web/app.js'),sw=read('web/sw.js'),audit=read('web/pet-art-audit.html');
 for(const id of ids){
  assert.ok(app.includes(`${id}:'/assets/pets/${id}.webp'`));
  assert.ok(sw.includes(`/assets/pets/${id}.webp`));
  assert.ok(audit.includes(`'${id}'`));
 }
 assert.match(app,/function petVisualMarkup\(species/);
 assert.match(app,/petVisualMarkup\(p\.species,'pet-picker-portrait-art'\)/);
 assert.match(app,/petVisualMarkup\(p\.species,'pet-team-open-art'\)/);
 assert.match(audit,/alphaPetArtAudit\?\.render/);
 assert.match(audit,/portrait\.innerHTML=render\(name/);
});
