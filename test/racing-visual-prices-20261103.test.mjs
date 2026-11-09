import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RACING_VISUAL_CATEGORIES,racingVisualOption,racingPower} from '../src/neon/racing-rules.js';

const desired={
 wheels:{sport:80000,multi:210000,track:480000},
 stripes:{double:18000,side:35000,race:90000},
 decals:{number:12000,team:45000,elite:140000},
 spoiler:{subtle:90000,sport:180000,track:350000},
 bodykit:{street:230000,sport:480000,alpha:990000},
 stance:{lowered:65000,track:140000}
};

test('preços server-side das 17 peças visuais; original sempre grátis',()=>{
 assert.equal(RACING_VISUAL_CATEGORIES.length,6);
 let count=0;
 for(const group of RACING_VISUAL_CATEGORIES){
  const original=racingVisualOption(group.id,'stock');
  assert.equal(original.option.price,0);
  for(const [id,price] of Object.entries(desired[group.id])){
   const item=racingVisualOption(group.id,id);
   assert.ok(item);
   assert.equal(item.option.price,price);
   assert.equal(Number.isSafeInteger(price),true);
   count++;
  }
 }
 assert.equal(count,17);
});

test('recusar combinações que não estejam no catálogo',()=>{
 assert.equal(racingVisualOption('wheels','__proto__'),null);
 assert.equal(racingVisualOption('unknown','stock'),null);
 assert.equal(racingVisualOption('bodykit','premier'),null);
});

test('visual não altera valores de aceleração ou poder das corridas',()=>{
 const base={modelId:'gol',upgrades:{motor:3,pneus:2},condition:95,driverLevel:5};
 const plain=racingPower(base,'cidade','equilibrada');
 const customized=racingPower({...base,visual_style:{wheels:'track',bodykit:'alpha'}},'cidade','equilibrada');
 assert.equal(plain,customized);
});

test('compra de acessório: somente no carro próprio e com carteira, transação e débito únicos',()=>{
 const src=readFileSync(new URL('../src/neon/racing-alpha.js',import.meta.url),'utf8');
 const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
 assert.match(src,/export async function raceVisualStyle/);
 assert.match(src,/if\(!found\)throw Error/);
 assert.match(src,/if\(!car\)throw Error/);
 assert.match(src,/car\.visual_unlocks\.includes\(token\)/);
 assert.match(src,/if\(price>0\)/);
 assert.match(src,/SELECT cash FROM wallets WHERE jid=\$1 FOR UPDATE/);
 assert.match(src,/UPDATE wallets SET cash=cash-\$2 WHERE jid=\$1 AND cash>=\$2 RETURNING cash/);
 assert.match(src,/racing_visual_purchase/);
 assert.match(src,/visual_unlocks=CASE WHEN \$5::boolean/);
 assert.match(api,/case 'racing\.visual': return raceVisualStyle/);
 assert.match(api,/visualCategories:RACING_VISUAL_CATEGORIES/);
});
