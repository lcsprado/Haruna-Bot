import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectEffectiveGear} from '../src/neon/equipment-star-logic.js';
import {ANTI_CRIT_SHIELDS,antiCritShieldStats,effectiveShieldedCritChance,shieldedCriticalMultiplier} from '../src/neon/anti-crit-shields.js';

test('seis escudos com progressão exclusiva, sem ATK ou DEF',()=>{
 assert.equal(ANTI_CRIT_SHIELDS.length,6);
 assert.deepEqual(ANTI_CRIT_SHIELDS.map(x=>x.critResist),[.02,.04,.06,.09,.11,.12]);
 for (const x of ANTI_CRIT_SHIELDS) {
  assert.equal(x.category,'shield');
  assert.equal(x.atk,undefined);
  assert.equal(x.def,undefined);
  const lv1=antiCritShieldStats(x.id,1),lv10=antiCritShieldStats(x.id,10);
  assert.equal(lv1.critResist,x.critResist);
  assert.ok(lv10.critResist>lv1.critResist);
  assert.ok(lv10.critGuard>lv1.critGuard);
  assert.ok(lv10.critResist<=.20);
  assert.ok(lv10.critGuard<=.30);
 }
});

test('anti-crítico reduz chance em pontos percentuais preservando mínimo residual',()=>{
 assert.equal(effectiveShieldedCritChance(.40,.12),.28);
 assert.equal(effectiveShieldedCritChance(.10,.18),.05);
 assert.equal(effectiveShieldedCritChance(.03,.18),.03);
 assert.equal(effectiveShieldedCritChance(.40,0),.40);
 assert.equal(effectiveShieldedCritChance(.40,2),.20);
});

test('guarda reduz somente o bônus de dano crítico, não o ataque comum',()=>{
 assert.equal(shieldedCriticalMultiplier(1.6,0),1.6);
 assert.ok(Math.abs(shieldedCriticalMultiplier(1.6,.25)-1.45)<1e-10);
 assert.equal(shieldedCriticalMultiplier(1,.30),1);
});

test('níveis inválidos e escudos desconhecidos não geram poder',()=>{
 assert.equal(antiCritShieldStats('qualquer',10),null);
 assert.deepEqual(antiCritShieldStats('escudo_madeira',0),antiCritShieldStats('escudo_madeira',1));
 assert.deepEqual(antiCritShieldStats('escudo_madeira',500),antiCritShieldStats('escudo_madeira',10));
});


test('apenas os três escudos iniciais ficam na loja; Égide é drop da Raid 70',()=>{
  const sale=ANTI_CRIT_SHIELDS.filter(x=>x.price>0).map(x=>x.id);
  assert.deepEqual(sale,['escudo_madeira','escudo_ferro','escudo_runico']);
  assert.equal(ANTI_CRIT_SHIELDS.find(x=>x.id==='egide_celestial')?.price,0);
  assert.equal(ANTI_CRIT_SHIELDS.find(x=>x.id==='bastiao_eclipse')?.price,0);
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  assert.match(games,/level:70,[^\n]*gear:\[[^\n]*'egide_celestial'/);
  const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  assert.match(index,/'escudo_madeira','escudo_ferro','escudo_runico',\s*'caixa_sorte'/);
  assert.doesNotMatch(index,/'escudo_madeira','escudo_ferro','escudo_runico','egide_celestial'/);
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  assert.match(db,/"escudo_madeira","escudo_ferro","escudo_runico","caixa_sorte"/);
});


test('seleção efetiva dos escudos usa resistência e guarda reais, sem curva de armas',()=>{
  const plain=antiCritShieldStats('escudo_runico',2,1);
  const forged=antiCritShieldStats('escudo_runico',1,3);
  assert.ok(forged.critResist>plain.critResist);
  assert.deepEqual(selectEffectiveGear(2,1,3,'escudo_runico'),{level:1,stars:3});
  assert.deepEqual(selectEffectiveGear(10,1,3,'escudo_runico'),{level:10,stars:1});
  // Armas e armaduras não mudam a regra histórica de seleção.
  assert.deepEqual(selectEffectiveGear(2,1,3,'espada_aurora'),{level:2,stars:1});
  // Até 5 estrelas/nível 10: sempre escolher a peça superior pelos atributos efetivos.
  for(const shield of ANTI_CRIT_SHIELDS){
    for(let normal=1;normal<=10;normal++){
      for(let level=1;level<=10;level++){
        for(let stars=2;stars<=5;stars++){
          const best=selectEffectiveGear(normal,level,stars,shield.id);
          const selected=antiCritShieldStats(shield.id,best.level,best.stars);
          const a=antiCritShieldStats(shield.id,normal,1);
          const b=antiCritShieldStats(shield.id,level,stars);
          assert.ok(selected.critResist>=Math.max(a.critResist,b.critResist),shield.id+' '+normal+'/'+level+'/'+stars);
        }
      }
    }
  }
});
