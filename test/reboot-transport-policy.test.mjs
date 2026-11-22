import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V2_TRANSPORT,v2TransportFare,v2ManualPaidFleet,v2TransportOperating,
  v2CltTripNet,v2TravelSettlement} from '../src/neon/reboot-transport-policy.js';

test('V2 só remunera dois veículos por comando e preserva os outros para CLT',()=>{
  const fleet=[{id:'a',price:35_000},{id:'b',price:350_000},{id:'c',price:85_000},
    {id:'d',price:6_000_000}];
  assert.deepEqual(v2ManualPaidFleet(fleet,{enabled:true}).map(x=>x.id),['d','b']);
  assert.equal(fleet.length,4);
  assert.equal(v2ManualPaidFleet(fleet,{enabled:false}),fleet);
  assert.equal(V2_TRANSPORT.maxManualPaidVehicles,2);
});
test('iFood inclui a bicicleta e todas as motos livres na mesma rodada',()=>{
  const garage=[
    {id:'bicicleta',price:1_500},
    {id:'moto_125',price:8_000},
    {id:'moto_160',price:14_000},
    {id:'moto_300',price:30_000}
  ];
  assert.deepEqual(v2ManualPaidFleet(garage,{enabled:true,kind:'ifood'}),garage);
  assert.equal(v2ManualPaidFleet(garage,{enabled:true,kind:'ifood'}).length,4);
  const inClt=new Set(['moto_125']);
  const available=garage.filter(vehicle=>!inClt.has(vehicle.id));
  assert.deepEqual(v2ManualPaidFleet(available,{enabled:true,kind:'ifood'}).map(vehicle=>vehicle.id),
    ['bicicleta','moto_160','moto_300']);
  assert.deepEqual(v2ManualPaidFleet(garage,{enabled:false,kind:'ifood'}),garage);
  // O limite de dois carros no Uber permanece intacto.
  assert.deepEqual(v2ManualPaidFleet(garage,{enabled:true}).map(vehicle=>vehicle.id),
    ['moto_300','moto_160']);
  const src=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
  assert.match(src,/v2ManualPaidFleet\(garage\.filter\(x=>!busyIds\.has\(x\.id\)\),\{kind:'ifood'\}\)/);
});

test('tarifas V2 reduzem sem prejudicar as mesmas ações na V1',()=>{
  assert.equal(v2TransportFare(1000,'uber',{enabled:true}),550);
  assert.equal(v2TransportFare(1000,'ifood',{enabled:true}),600);
  assert.equal(v2TransportFare(1000,'uber',{enabled:false}),1000);
  assert.throws(()=>v2TransportFare(-1,'uber'),RangeError);
});
test('custo de combustível/desgaste e TAXADE não duplicam nem tornam valor negativo',()=>{
  const v2=v2TravelSettlement(10_000,{enabled:true,legacyTaxMultiplier:3});
  assert.deepEqual(v2,{gross:10_000,tax:1_000,taxRate:10,operating:1_500,total:7_500});
  assert.deepEqual(v2TravelSettlement(10_000,{enabled:false}),{
    gross:10_000,tax:1000,taxRate:10,operating:0,total:9000
  });
  assert.equal(v2TransportOperating(10000,{enabled:false}),0);
  assert.equal(v2TransportOperating(10000,{enabled:true}),1500);
});
test('CLT Uber/iFood têm no máximo 8h por turno e não recebem superlucro na V2',()=>{
  assert.equal(v2CltTripNet(1000,.35,'uber',{enabled:false}),585);
  assert.equal(v2CltTripNet(1000,.35,'uber',{enabled:true}),268);
  assert.equal(v2CltTripNet(1000,.35,'ifood',{enabled:true}),292);
  assert.equal(V2_TRANSPORT.maxShiftHours,8);
  assert.throws(()=>v2CltTripNet(1000,-1,'uber'),RangeError);
});
test('caminhos da V2 evitam bônus de eventos, rastreiam custos e preservam a V1',()=>{
  const src=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
  assert.equal((src.match(/rebootEconomyEnabled\(\)\?1:Math\.max\(await getDoubleEventMultiplier/g)||[]).length,2);
  assert.equal((src.match(/v2ManualPaidFleet\(/g)||[]).length,2);
  assert.equal((src.match(/v2TravelSettlement\(gross,/g)||[]).length,2);
  assert.equal((src.match(/'transport_operation'/g)||[]).length,2);
  assert.match(src,/return v2CltTripNet\(gross,d\.commission,'uber'\)/);
  assert.match(src,/return v2CltTripNet\(gross,d\.commission,'ifood'\)/);
  assert.match(src,/const CLT_IFOOD_SHIFT_SECONDS=8\*3600/);
  assert.match(src,/const CLT_UBER_SHIFT_SECONDS=8\*60\*60/);
});


test('Mensagens do WhatsApp informam operação V2 sem alterar os avisos V1',()=>{
  const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  assert.equal((src.match(/Operação\/desgaste:/g)||[]).length,2);
  assert.match(src,/operatingTotal\+=Number\(r\.operating\|\|0\)/);
  assert.match(src,/\?\`TAXADE das atividades\`|TAXADE das atividades/);
  assert.match(src,/Custo operacional:/);
});
