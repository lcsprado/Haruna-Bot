import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractBusinessCatalog,projectBusinessIncome,businessEconomicBaseline} from '../scripts/reboot-economy-baseline.mjs';

test('captura dados reais dos negócios sem importar banco ou modificar catálogo',()=>{
  const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
  const catalog=extractBusinessCatalog(source);
  assert.ok(catalog.length>=9);
  const tech=catalog.find(b=>b.id==='tech');
  assert.deepEqual(tech,{id:'tech',name:'Empresa de Tecnologia',
    price:30_000_000,profitHour:110_000,capacityHours:24});
  assert.equal(businessEconomicBaseline(source).length,catalog.length*2);
});

test('simulação mostra inflação potencial e não aplica receitas na produção',()=>{
  const baseline={id:'tech',name:'Empresa de Tecnologia',
    price:30_000_000,profitHour:110_000,capacityHours:24};
  const lv1=projectBusinessIncome(baseline,1);
  const lv5=projectBusinessIncome(baseline,5);
  assert.equal(lv1.grossPer24Hours,2_640_000);
  assert.equal(lv5.grossPer24Hours,5_280_000);
  assert.equal(lv1.theoreticalPaybackDays,11.36);
  assert.equal(lv5.theoreticalPaybackDays,5.68);
  assert.throws(()=>projectBusinessIncome(baseline,0),RangeError);
});
