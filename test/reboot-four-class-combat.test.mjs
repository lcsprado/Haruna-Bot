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
 assert.ok(Number.isInteger(r.flagged)); // incluindo duelos hipotéticos abaixo do nível permitido
});
test('atributos equivalentes respeitam papel das quatro classes e evolução',()=>{
 const p=buildClassFighter('paladin',100,5,'none'),b=buildClassFighter('berserker',100,5,'none');
 const s=buildClassFighter('samurai',100,5,'none');
 assert.ok(p.hp>b.hp);assert.ok(p.def>b.def);assert.ok(b.atk>p.atk);assert.ok(s.spd>b.spd);
 assert.ok(buildClassFighter('paladin',100,5,'gear').hp>p.hp);
 assert.throws(()=>buildClassFighter('pecado_ban',100,5,'none'),/inválido/);
});
test.after(()=>{if(previous===undefined)delete process.env.ALPHA_REBOOT_MODE;else process.env.ALPHA_REBOOT_MODE=previous});

test('V2: níveis liberados e estágios incompletos passam em duas sementes determinísticas',()=>{
 for(const seed of [11827341,88209117]){
  const r=auditFourClasses(source,{eligibleOnly:true,duelsPerOrder:seed===11827341?70:180,seed});
  assert.equal(r.scenarios.length,78);
  assert.equal(r.flagged,0,JSON.stringify(r.scenarios.filter(x=>x.flagged)));
 }
});
test('proteção simétrica e ajuste exclusivo de dano V2 sem alterar V1 ou Despertar V',async()=>{
 const {assertV2PvpAccess,v2PvpDamageAdjustment}=await import('../src/neon/reboot-combat-progression.js');
 assert.throws(()=>assertV2PvpAccess(20,21),/Lv.21/);
 assert.throws(()=>assertV2PvpAccess(21,20),/Lv.21/);
 assert.equal(assertV2PvpAccess(21,21),true);
 assert.equal(assertV2PvpAccess(1,21,{enabled:false}),true);
 assert.equal(v2PvpDamageAdjustment(1000,'samurai',4),975);
 assert.equal(v2PvpDamageAdjustment(1000,'necromancer',1),1020);
 assert.equal(v2PvpDamageAdjustment(1000,'paladin',2),1020);
 for(const id of ['paladin','necromancer','samurai','berserker']){
  assert.equal(v2PvpDamageAdjustment(1000,id,5),1000);
  assert.equal(v2PvpDamageAdjustment(1000,id,1,true,{enabled:false}),1000);
  assert.equal(v2PvpDamageAdjustment(1000,id,1,false),1000);
 }
 assert.match(source,/assertV2PvpAccess\(au\?\.level,bu\?\.level\)/);
 const start=source.indexOf('export async function battle(');
 assert.ok(source.indexOf('assertV2PvpAccess(au',start)<source.indexOf('claimCooldown(client',start));
});
