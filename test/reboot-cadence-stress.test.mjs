import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cadenceReport} from '../scripts/reboot-cadence-stress.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('V2 protege orçamento bruto em 1, 3, 24 e 288 coletas diárias, níveis 1 e 5',()=>{
 const r=cadenceReport(read('src/neon/progression.js'),read('src/neon/db.js'));
 assert.equal(r.collections.length,18);
 for(const b of r.collections){
  assert.equal(b.capacityHours,24);
  assert.ok(b.grossBounded);
  assert.ok(b.runs[0].gross<=b.previousDailyGross);
  assert.ok(b.previousDailyGross-b.runs[0].gross<=34);
  for(const run of b.runs)assert.ok(run.gross<=b.runs[0].gross);
 }
});
test('curva de nível geral e de classe não excedem limites; Raid70 exige três jogadores elegíveis',()=>{
 const r=cadenceReport(read('src/neon/progression.js'),read('src/neon/db.js'));
 assert.deepEqual(r.progression.map(p=>p.rows.at(-1).level),[59,101,143,170]);
 assert.deepEqual(r.progression.map(p=>p.rows.at(-1).classLevel),[59,100,100,100]);
 assert.equal(r.progression[0].milestones[90],undefined);
 assert.equal(r.progression[3].milestones[90],34);
 assert.match(read('src/neon/reboot-economy-policy.js'),/minPlayers:3,minLevel:90/);
});
test('a cotação de melhoria usa a capacidade efetiva do mesmo catálogo',()=>{
 const source=read('src/neon/progression.js');
 assert.match(source,/const effectiveBusiness=candidateBusinessCatalog\(business\)/);
 assert.match(source,/capacityHours:effectiveBusiness.capacityHours\+extraHours/);
});
