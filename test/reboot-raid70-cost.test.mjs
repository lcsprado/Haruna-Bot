import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const previous=process.env.ALPHA_REBOOT_MODE;
process.env.ALPHA_REBOOT_MODE='classes_only';
const {raidPlayerDefenseCoefficient,raidPetDamageMultiplier,mitigateRaidPetDamage,estimatedRaidPetHit}=await import('../src/neon/raid-pet-mitigation.js');
const {raid70CostReport}=await import('../scripts/reboot-raid70-cost.mjs');
const {V2_RAID_DIFFICULTY}=await import('../src/neon/reboot-combat-progression.js');
test('ajuste isolado na Raid70 V2, sem zerar dano válido ou alterar economia V1',()=>{
 assert.equal(raidPlayerDefenseCoefficient(70),.55);
 assert.equal(raidPlayerDefenseCoefficient(70,{enabled:false}),.22);
 assert.equal(raidPetDamageMultiplier(70),.08);
 assert.ok(Math.abs(raidPetDamageMultiplier(70,{enabled:false})-.7)<1e-10);
 assert.equal(mitigateRaidPetDamage(70,100),8);
 assert.equal(mitigateRaidPetDamage(70,1),1);
 assert.equal(mitigateRaidPetDamage(70,0),0);
 assert.equal(estimatedRaidPetHit(70,320),16);
 for(const lv of [10,15,20,25,30,40,50,60,65,75]){
  assert.equal(raidPlayerDefenseCoefficient(lv),.22);
  assert.equal(raidPetDamageMultiplier(lv),raidPetDamageMultiplier(lv,{enabled:false}));
 }
 assert.deepEqual(V2_RAID_DIFFICULTY[70],{hp:1600000,atk:320});
 const game=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
 assert.match(game,/Number\(p.def\|\|0\)\*raidPlayerDefenseCoefficient\(cfg.level\)/);
});
test('ensaio de custo: equipe inicial ainda não vence, avançada vence com menos gasto',()=>{
 const baseline=raid70CostReport({balance:false,samples:40,seed:721190});
 const candidate=raid70CostReport({samples:40,seed:981276});
 for(const x of candidate){
  if(x.level===90)assert.equal(x.wins,0);
  else{
   assert.equal(x.wins,x.samples);
   assert.ok(x.totalCost<24000,JSON.stringify(x));
   assert.ok(x.totalCost<baseline.find(y=>y.level===x.level&&y.party===x.party).totalCost*.15);
  }
 }
});
test.after(()=>{if(previous===undefined)delete process.env.ALPHA_REBOOT_MODE;else process.env.ALPHA_REBOOT_MODE=previous});
