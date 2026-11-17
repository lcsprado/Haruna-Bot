import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditVehicleRoi} from '../scripts/reboot-vehicle-roi.mjs';
import {expectedManualVehicleNet,expectedCltVehicleNet} from '../src/neon/reboot-vehicle-roi.js';
const src=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
const r=auditVehicleRoi(src);
test('ROI offline analisa 13 carros e 6 motos da versão atual sem alterar preços',()=>{
 assert.equal(r.readOnly,true);
 assert.equal(r.catalogPricesChanged,false);
 assert.equal(r.actualPlayerRevenueUsed,false);
 assert.equal(r.cars.length,13);
 assert.equal(r.motorcycles.length,6);
 assert.equal(r.cars[0].price,35000);
 assert.equal(r.motorcycles[0].price,1500);
 assert.deepEqual(r.cars[0].manual.map(x=>x.actions),[1,3,6]);
 assert.equal(r.cars[0].clt.length,3);
 assert.equal(r.motorcycles[0].clt.length,3);
});
test('retorno manual considera imposto, operação, preço e tempo ativo',()=>{
 const car=r.cars[0],one=car.manual[0],three=car.manual[1],six=car.manual[2];
 assert.ok(one.netPerAction>0);
 assert.equal(one.netPerAction,three.netPerAction);
 assert.ok(one.paybackActiveDays>three.paybackActiveDays);
 assert.ok(three.paybackActiveDays>six.paybackActiveDays);
 assert.equal(three.netPerActiveDay,3*three.netPerAction);
 assert.ok(three.hypotheticalPriceCeiling45Days>0);
 assert.ok(r.motorcycles[0].manual[1].paybackActiveDays<r.cars[0].manual[1].paybackActiveDays);
});
test('CLT desconta custos e considera aluguel de capital de veículo + motorista',()=>{
 const car=r.cars[0].clt[0];
 assert.equal(car.driverId,'comum');
 assert.equal(car.trips,24);
 assert.equal(car.combinedCapital,60000);
 assert.ok(car.paybackActiveDays>=1);
 const actual=expectedCltVehicleNet({price:35000,min:320,max:620,kind:'uber',
  driver:{price:25000,intervalMin:20,efficiency:.55,commission:.35}});
 assert.deepEqual(car,{driverId:'comum',...actual});
 assert.throws(()=>expectedCltVehicleNet({price:1000,min:1,max:2,kind:'uber'}),RangeError);
});
test('falha fechada quando catálogo muda e não consulta contas ou SQL',()=>{
 const wrong=src.replace("id:'popular',name:'Chevrolet Corsa'","id:'nonexistent',name:'Chevrolet Corsa'");
 assert.throws(()=>auditVehicleRoi(wrong),/Tarifa não encontrada/);
 assert.throws(()=>expectedManualVehicleNet({price:-1,min:1,max:2,kind:'uber'}),RangeError);
 const script=readFileSync(new URL('../scripts/reboot-vehicle-roi.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(script,/DATABASE_URL|db\.query|client\.query|fetch\(|process\.env|update wallets/i);
});
