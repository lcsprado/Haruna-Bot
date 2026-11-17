import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROFILES} from '../scripts/reboot-economy-sim.mjs';
import {buildIntegratedInputs} from '../scripts/reboot-economy-integrated.mjs';
import {V2_EVENT_BUDGET} from '../src/neon/reboot-economy-policy.js';
import {allocatePoolByWeights,eventPressure,fundedFleetForMode,
  prefundedFleetUpperBound,raid70V2EmissionEstimate,stressEconomyReport}
  from '../scripts/reboot-economy-stress.mjs';

const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
const inputs=buildIntegratedInputs(source,db);

test('pool semanal só é emitido uma vez por grupo, sem jogador duplicado',()=>{
  const awards=allocatePoolByWeights(240000,
    ['intensivo','dedicado','regular','casual'],[4,3,2,1]);
  assert.equal(awards.length,4);
  assert.equal(awards.reduce((sum,x)=>sum+x.amount,0),240000);
  assert.deepEqual(awards.map(x=>x.amount),[96000,72000,48000,24000]);
  assert.deepEqual(allocatePoolByWeights(100,[],[]),[]);
  assert.throws(()=>allocatePoolByWeights(100,['casual','casual'],[1,1]),RangeError);
  assert.throws(()=>allocatePoolByWeights(100,['casual'],[0]),RangeError);
});
test('7,30,60,120 dias: prêmios não se multiplicam por quatro ao pagar pools',()=>{
  const expectedWeeks=[1,4,8,17];
  for(const [i,days] of [7,30,60,120].entries()){
    const events=eventPressure(days);
    assert.equal(events.reconciled,true);
    assert.equal(events.completedWeeks,expectedWeeks[i]);
    assert.equal(events.sources.weeklyBoss,expectedWeeks[i]*V2_EVENT_BUDGET.weeklyBossPool);
    assert.equal(events.sources.gtWeekly,expectedWeeks[i]*V2_EVENT_BUDGET.gtWeeklyPrizes.reduce((a,b)=>a+b,0));
    assert.equal(events.sources.gtHeat<=days*3*V2_EVENT_BUDGET.gtHeatPrizes.slice(0,4).reduce((a,b)=>a+b,0),true);
    assert.equal(events.pocoCount,days<60?0:1);
  }
});
test('Poço é uma edição sazonal, não 1 evento semanal, e requer conclusão hipotética',()=>{
  assert.equal(eventPressure(30).sources.pocoRanking,0);
  const e60=eventPressure(60);
  assert.equal(e60.sources.pocoRanking,230000);
  assert.equal(e60.sources.pocoFloors,4*5*(1000+1800+2600+4000+5500+8000));
  assert.equal(eventPressure(120).sources.pocoRanking,230000);
  assert.equal(eventPressure(120).sources.pocoFloors,e60.sources.pocoFloors);
});
test('frota CLT três por modalidade + dois veículos livres por comando, sem duplicar',()=>{
  const uber=fundedFleetForMode(inputs.vehicles.cars,'uber');
  const ifood=fundedFleetForMode(inputs.vehicles.motorcycles,'ifood');
  for(const mode of [uber,ifood]){
    assert.equal(mode.drivers.length,3);
    assert.equal(mode.manual.length,2);
    assert.equal(new Set([...mode.drivers.map(x=>x.id),...mode.manual.map(x=>x.id)]).size,5);
    assert.ok(mode.upfrontCapital>0);
    assert.ok(mode.shiftNet>0);
    assert.ok(mode.manualNetPerCommand>0);
  }
  const per=fundedFleetForMode(inputs.vehicles.cars,'uber');
  assert.deepEqual(uber,per,'Frota determinística');
  assert.throws(()=>fundedFleetForMode([], 'uber'),RangeError);
});
test('frota completa é sensibilidade PRÉ-FINANCIADA, não dinheiro do nada',()=>{
  for(const profile of PROFILES){
    const x=prefundedFleetUpperBound(profile,120,inputs);
    assert.equal(x.vehiclesOwned,10);
    assert.equal(x.cltDrivers,6);
    assert.equal(x.manualVehiclesPerService,2);
    assert.ok(x.manualTimeMinutesPerActiveDay<=profile.minutes);
    assert.ok(x.upfrontCapital>0);
    assert.equal(x.earnedWithoutCapitalRecovery,x.activeDays*(x.cltNetDaily+x.manualNetDaily));
    assert.equal(x.netAfterUpfrontInvestment,x.earnedWithoutCapitalRecovery-x.upfrontCapital);
  }
});
test('Raid 70: um ou dois jogadores nunca começam; cashPool é coeficiente, não teto',()=>{
  const cases=[1,2,3,4,5].map(raid70V2EmissionEstimate);
  assert.deepEqual(cases.map(x=>x.canStart),[false,false,true,true,true]);
  assert.equal(cases[2].minLevel,90);
  assert.equal(cases[2].raidLoteAllowed,false);
  assert.equal(cases[2].cashAwarded,242400);
  assert.equal(cases[2].keysConsumed,180000);
  assert.equal(cases[3].cashAwarded,315200);
  assert.equal(cases[3].keysConsumed,240000);
  assert.equal(cases[4].cashAwarded,388000);
  assert.ok(cases.slice(2).every(x=>x.exceedsNominalCashPool));
  assert.throws(()=>raid70V2EmissionEstimate(6),RangeError);
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  assert.match(games,/const keyReturn=Math\.floor\(cfg\.keyPrice\*1\.08\)/);
  assert.match(games,/const collaborationBonus=Math\.floor\(cfg\.cashPool\*\(\.04\+\.12\*share\)\)/);
  assert.match(games,/assertRaid70V2Start\(\{level:cfg\.level,partySize:ids\.length/);
});
test('quatro jogadores têm contabilidade fechada mesmo após eventos não reinvestidos',()=>{
  const report=stressEconomyReport(source,db);
  assert.equal(report.readOnly,true);
  assert.equal(report.liveAccountOrHistoryUsed,false);
  assert.equal(report.freshStartingCash,0);
  assert.equal(report.eventsNotGuaranteed,true);
  assert.equal(report.eventsReinvested,false);
  assert.equal(report.rows.length,4);
  for(const row of report.rows){
    assert.equal(row.players.length,4);
    assert.equal(row.portfolioPlusEventReconciled,true);
    assert.ok(row.totalWithEvents>row.totalBaseWealth);
    assert.equal(row.players.reduce((a,p)=>a+p.eventCash,0),row.eventBudget.groupTotal);
    assert.ok(row.players.every(p=>p.cashHoldingEventRewards>=0));
  }
  assert.deepEqual(report.raid70.map(x=>x.canStart),[false,false,true,true,true]);
});
test('nenhuma consulta de histórico, conta real, credencial ou serviço',()=>{
  const file=readFileSync(new URL('../scripts/reboot-economy-stress.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(file,/DATABASE_URL|client\.query|db\.query|INSERT INTO|DELETE FROM|fetch\(|https?:\/\//);
});
