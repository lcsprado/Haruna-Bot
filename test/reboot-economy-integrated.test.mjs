import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {C4C_WINDOWS,PLAYER_BEHAVIOR,C4C_ASSUMPTIONS,INVESTMENT_SEQUENCE,
 extractCareerRanks,buildIntegratedInputs,simulateIntegrated,integratedEconomyReport,
 assessIntegratedRisks}
 from '../scripts/reboot-economy-integrated.mjs';
import {PROFILES} from '../scripts/reboot-economy-sim.mjs';
const prog=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
const inputs=buildIntegratedInputs(prog,db);
test('modelo lê os 9 cargos, nove negócios e 19 veículos da fonte, não do banco',()=>{
 assert.equal(inputs.ranks.length,9);
 assert.equal(inputs.ranks.at(-1).name,'CEO');
 assert.equal(inputs.businesses.length,9);
 assert.equal(inputs.vehicles.cars.length,13);
 assert.equal(inputs.vehicles.motorcycles.length,6);
 assert.deepEqual(C4C_WINDOWS,[7,30,60,120]);
 assert.deepEqual(PROFILES.map(p=>p.id),['casual','regular','dedicado','intensivo']);
 assert.equal(INVESTMENT_SEQUENCE[0].id,'bicicleta');
 assert.throws(()=>extractCareerRanks('nothing'),/carreira não encontrada/);
});
test('economia integrada fecha contabilidade e nunca dá saldo negativo em 16 cenários',()=>{
 const report=integratedEconomyReport(prog,db);
 assert.equal(report.readOnly,true);
 assert.equal(report.liveAccountsUsed,false);
 assert.equal(report.profiles.length,16);
 assert.equal(report.initialState.cash,0);
 assert.equal(report.driverAndManualSameVehicleDoubleCounted,false);
 for(const row of report.profiles)for(const key of ['invested','cashOnly','level50Sensitivity']){
  const r=row[key];
  assert.equal(r.accountingBalanced,true,`${row.profile} ${row.days} ${key}`);
  assert.ok(r.cash>=0);
  assert.ok(r.capitalPaid>=0);
  assert.ok(r.workShifts>0);
  assert.equal(r.days,row.days);
  assert.ok(r.netWorthAtResaleAssumption>=r.cash);
  assert.ok(r.drivers<=2);
  assert.ok(r.vehicles<=INVESTMENT_SEQUENCE.filter(x=>x.type==='vehicle').length);
  assert.ok(r.ownedBusinesses<=9);
  assert.equal(r.driverHiring,r.purchases.filter(p=>p.type==='driver').reduce((a,b)=>a+b.paid,0));
  assert.ok(r.purchases.every(p=>p.paid>0));
  assert.ok(r.workNet>0);
 }
});
test('dinheiro sem investir não gera renda Uber/CLT/negócio do nada',()=>{
 for(const profile of PROFILES){
  const row=simulateIntegrated(profile,60,inputs,{strategy:'cash_only'});
  assert.equal(row.vehicles,0);
  assert.equal(row.drivers,0);
  assert.equal(row.ownedBusinesses,0);
  assert.equal(row.manualNet,0);
  assert.equal(row.cltNet,0);
  assert.equal(row.businessNet,0);
  assert.equal(row.capitalPaid,0);
  assert.equal(row.netWorthAtResaleAssumption,row.cash);
 }
});
test('apenas veículo não contratado remunera trabalho manual; CLT limitado a um turno/dia ativo',()=>{
 const r=simulateIntegrated(PROFILES[3],120,inputs);
 const busy=new Set(r.driverAssignments.map(d=>d.mode+':'+d.vehicleId));
 assert.ok(r.driverAssignments.every(d=>r.vehicleIds.includes(d.vehicleId)));
 assert.ok(r.cltNet>0);
 assert.ok(r.manualNet>0);
 assert.ok(r.drivers<=2);
 assert.ok(r.activeDays===120);
 assert.equal(busy.size,r.driverAssignments.length);
});
test('cenário de nível 50 é sensibilidade, não progresso declarado',()=>{
 const report=integratedEconomyReport(prog,db);
 assert.equal(report.classLevelCurveVerified,false);
 assert.match(report.caveat,/SENSIBILIDADE/);
 assert.equal(report.eventsIncluded,false);
 assert.equal(report.raidAndBossIncluded,false);
 assert.equal(report.gtIncluded,false);
 const casual=report.profiles.find(x=>x.profile==='casual'&&x.days===30);
 assert.equal(casual.invested.characterLevelAssumed,1);
 assert.equal(casual.level50Sensitivity.characterLevelAssumed,50);
 assert.ok(casual.level50Sensitivity.workNet>casual.invested.workNet);
});
test('compra CLT exige veículo e preço de contratação é gasto não revendável',()=>{
 const rows=integratedEconomyReport(prog,db).profiles;
 const all=rows.flatMap(row=>row.invested.purchases);
 const hires=all.filter(p=>p.type==='driver');
 assert.ok(hires.length>0);
 for(const row of rows){
  assert.ok(row.invested.driverHiring>=0);
  assert.ok(row.invested.netWorthAtResaleAssumption<=row.invested.cash+
    row.invested.businessBook+row.invested.vehicleBook);
 }
});
test('código do simulador não possui conexão, transações ou credenciais',()=>{
 const script=readFileSync(new URL('../scripts/reboot-economy-integrated.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(script,/DATABASE_URL|db\.query|client\.query|INSERT INTO|DELETE FROM|fetch\(|https?:\/\//);
 assert.equal(C4C_ASSUMPTIONS.consumptionPerActiveDay,1000);
 assert.ok(PLAYER_BEHAVIOR.casual.work<PLAYER_BEHAVIOR.intensivo.work);
});

test('alertas de concentração e liquidez não confundem fechar contas com economia equilibrada',()=>{
 const report=integratedEconomyReport(prog,db);
 assert.equal(report.riskSignals.checks.length,4);
 const sixty=report.riskSignals.checks.find(x=>x.days===60);
 const oneTwenty=report.riskSignals.checks.find(x=>x.days===120);
 assert.ok(sixty.wealthRatio>6);
 assert.ok(oneTwenty.wealthRatio>6);
 assert.ok(oneTwenty.largestBusinessIncomeShare>.7);
 assert.ok(oneTwenty.minimumLiquidityShare>=.03);
 assert.ok(oneTwenty.warnings.includes('wealth_inequality'));
 assert.ok(oneTwenty.warnings.includes('business_dominance'));
 assert.equal(oneTwenty.warnings.includes('low_liquidity'),false);
 assert.match(report.riskSignals.warning,/NÃO política aplicada/);
});

import {candidateEconomyReport,candidateEventCash} from '../scripts/reboot-economy-candidate.mjs';
test('simulação candidata usa os preços V2 atuais e reinveste prêmios hipotéticos sem criar saldo',()=>{
 const input=buildIntegratedInputs(prog,db,{currentV2Prices:true});
 assert.equal(input.vehicles.cars.find(x=>x.id==='sedan_esportivo').price,75000);
 assert.equal(input.vehicles.motorcycles.find(x=>x.id==='moto_125').price,8000);
 const report=candidateEconomyReport(prog,db);
 assert.equal(report.profiles.length,16);
 assert.equal(report.soloRaid70Blocked,true);
 for(const row of report.profiles){
  for(const r of [row.invested,row.withConditionalEvents])assert.equal(r.accountingBalanced,true);
  assert.equal(row.invested.extraCash,0);
  assert.ok(row.withConditionalEvents.extraCash>0);
 }
 const totals=Object.values(candidateEventCash(30)).flatMap(x=>Object.values(x)).reduce((a,b)=>a+b,0);
 assert.equal(totals,4*40000+2*1440);
 assert.equal(report.xpSensitivity.intensivo.creditedPerActiveDay,12000);
 assert.equal(report.xpSensitivity.casual.creditedPerActiveDay,2000);
});

test('Política candidata reduz disparidade, concentração e mantém liquidez nos 32 cenários',()=>{
 const report=candidateEconomyReport(prog,db);
 for(const x of [...report.riskSignals.checks,...report.conditionalRisks.checks]){
   assert.deepEqual(x.warnings,[],JSON.stringify(x));
 }
 for(const row of report.profiles){
  assert.ok(row.invested.streakCash>0);
  assert.equal(row.invested.accountingBalanced,true);
  assert.equal(row.withConditionalEvents.accountingBalanced,true);
 }
 const p=report.profiles.find(r=>r.profile==='intensivo'&&r.days===120);
 assert.equal(p.invested.netWorthAtResaleAssumption,4528983);
 assert.equal(p.withConditionalEvents.netWorthAtResaleAssumption,4953487);
 const inputs=buildIntegratedInputs(prog,db,{currentV2Prices:true});
 assert.equal(inputs.businesses.find(x=>x.id==='tech').profitHour,7000);
});
