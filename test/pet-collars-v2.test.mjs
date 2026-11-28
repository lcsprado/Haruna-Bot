import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PET_COLLARS,MYTHIC_COLLAR,MYTHIC_COLLAR_FEE,MYTHIC_COLLAR_MATERIALS,petCollarDamage,petCollarEstimate,seedPetCollars} from '../src/neon/pet-collars.js';
import {mitigateRaidPetDamage} from '../src/neon/raid-pet-mitigation.js';
test('collar is multiplicative, bounded and preserves the old formula without a collar',()=>{
 for(const level of [10,15,20,25,30,40,50,60,65,70]){
  for(const mode of ['manual','lote']){
   for(const raw of [0,1,2,3,10,80,150,300,1000,10000]){
    const baseline=mitigateRaidPetDamage(level,raw,{enabled:true,mode});
    assert.equal(petCollarDamage(baseline,null),baseline);
    for(const item of PET_COLLARS){
     const expected=baseline===0?0:Math.max(1,Math.round(baseline*(1-item.percent/100)));
     assert.equal(petCollarDamage(baseline,item.id),expected);
     assert.ok(petCollarEstimate(baseline,item.id)>=expected);
    }
   }
  }
 }
 assert.equal(petCollarDamage(1000,MYTHIC_COLLAR),750);
 assert.equal(petCollarDamage(1000,'invalid'),1000);
});
test('six tiers and approved recipe',()=>{
 assert.deepEqual(PET_COLLARS.map(x=>x.percent),[5,8,12,16,20,25]);
 assert.deepEqual(PET_COLLARS.map(x=>x.price),[50000,100000,250000,500000,1000000,0]);
 assert.equal(MYTHIC_COLLAR_FEE,500000);
 assert.deepEqual(MYTHIC_COLLAR_MATERIALS,{coleira_egide_primordial:1,nucleo_pedra:500,olho_abissal:300,essencia_rei_abissal:150,fragmento_caos:50});
 assert.equal(new Set(PET_COLLARS.map(x=>x.id)).size,6);
});
test('catalog seed is idempotent SQL and never creates inventory',async()=>{
 const calls=[];await seedPetCollars({query:async(sql,params)=>calls.push({sql,params})});
 assert.equal(calls.length,6);
 for(const c of calls){assert.match(c.sql,/ON CONFLICT\(id\) DO UPDATE/);assert.doesNotMatch(c.sql,/inventories/)}
});
test('collar never contributes to the player or squad defense and uses a per-pet snapshot',()=>{
 const g=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
 const bonus=g.slice(g.indexOf('function petBossBonus('),g.indexOf('function squadCombatBonus('));
 assert.doesNotMatch(bonus,/collar|petCollar/i);
 assert.match(g,/petDamage=petCollarDamage\(mitigateRaidPetDamage/);
 assert.match(g,/const petTaken=petCollarDamage/);
 assert.match(g,/collarId:classesOnlyRebootEnabled\(\)\?pet\.collar_id/);
 assert.match(g,/pc\.active=TRUE AND pc\.species=p\.species/);
 const d=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
 assert.match(d,/ALTER TABLE pet_collection ADD COLUMN IF NOT EXISTS collar_id TEXT REFERENCES items\(id\)/);
 assert.match(d,/if\(pet\.collar_id\) throw new Error\('Retire a coleira/);
 assert.match(d,/if\(item\)await consumeCollarMaterials/);
 assert.match(d,/if\(pet\.collar_id\)await giveCollarItem/);
});
