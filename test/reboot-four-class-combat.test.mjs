import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Imports dinâmicos: PVP_AWAKENING_ROLES é selecionado no carregamento do módulo.
const previous=process.env.ALPHA_REBOOT_MODE;
process.env.ALPHA_REBOOT_MODE='classes_only';
const {auditFourClasses,buildClassFighter}=await import('../scripts/reboot-four-class-combat.mjs');
const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
test('auditoria V2 usa quatro classes, quinze cenários e lado alternado',()=>{
 const r=auditFourClasses(source,{duelsPerOrder:20});
 assert.equal(r.scenarios.length,15);assert.equal(r.battles,3600);
 for(const s of r.scenarios){assert.equal(s.pairs.length,6);
  assert.equal(s.battles,240);assert.ok(Object.values(s.rates).every(x=>x>=0&&x<=100));}
 assert.ok(r.flagged>0,'desequilíbrio inicial conhecido deve ser resolvido, não ocultado');
});
test('atributos equivalentes respeitam papel das quatro classes e evolução',()=>{
 const p=buildClassFighter('paladin',100,5,'none'),b=buildClassFighter('berserker',100,5,'none');
 const s=buildClassFighter('samurai',100,5,'none');
 assert.ok(p.hp>b.hp);assert.ok(p.def>b.def);assert.ok(b.atk>p.atk);assert.ok(s.spd>b.spd);
 assert.ok(buildClassFighter('paladin',100,5,'gear').hp>p.hp);
 assert.throws(()=>buildClassFighter('pecado_ban',100,5,'none'),/inválido/);
});
test.after(()=>{if(previous===undefined)delete process.env.ALPHA_REBOOT_MODE;else process.env.ALPHA_REBOOT_MODE=previous});
