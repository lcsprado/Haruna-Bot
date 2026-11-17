import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PROFILES,WINDOWS,PROPOSED_HOURLY_RATES,NON_BUSINESS_ASSUMPTIONS,
  activityForecast,getBusinessVersions,forecastBusinessDay,
  extractRaidPoolCatalog,raidPoolBaseline,simulatePlayer,economyScenarioReport
} from '../scripts/reboot-economy-sim.mjs';

const businessSource=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
const raidSource=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
const catalog=getBusinessVersions(businessSource);

test('confere os 9 negócios atuais e não modifica o catálogo da V1',()=>{
  assert.equal(catalog.current.length,9);
  assert.equal(catalog.proposed.length,9);
  assert.deepEqual(Object.keys(PROPOSED_HOURLY_RATES).sort(),
    catalog.current.map(x=>x.id).sort());
  assert.equal(catalog.current.find(x=>x.id==='tech').profitHour,110000);
  assert.equal(catalog.proposed.find(x=>x.id==='tech').profitHour,42000);
  assert.equal(catalog.current.find(x=>x.id==='tech').price,30_000_000);
  assert.ok(NON_BUSINESS_ASSUMPTIONS.businessTaxFraction===.10);
});
test('modelo não confunde receita bruta, imposto de 10% e manutenção proposta',()=>{
  const current=forecastBusinessDay(catalog.current.find(x=>x.id==='tech'),5,'current');
  const proposed=forecastBusinessDay(catalog.proposed.find(x=>x.id==='tech'),5,'proposed');
  assert.equal(current.gross,5_280_000);
  assert.equal(current.net,4_752_000);
  assert.equal(proposed.gross,1_612_800);
  assert.equal(proposed.net,1_290_240);
  assert.equal(proposed.operating,161_280);
  assert.ok(proposed.net<current.net);
  assert.throws(()=>forecastBusinessDay(catalog.proposed[0],6,'proposed'),RangeError);
});
test('há rendimentos decrescentes pelo tempo jogado, sem zerar jogadores casuais',()=>{
  const casual=activityForecast(20),intensive=activityForecast(180);
  assert.ok(casual.netCash>0&&casual.xp>0);
  assert.ok(intensive.netCash>casual.netCash);
  assert.ok(intensive.xp>casual.xp);
  assert.ok(intensive.netCash/casual.netCash<3);
  assert.ok(intensive.xp/casual.xp<3);
  assert.throws(()=>activityForecast(-1),RangeError);
});
test('pools de Raid permanecem pools, sem falsa remuneração individual; Raid 75 fora',()=>{
  const raids=extractRaidPoolCatalog(raidSource);
  assert.equal(raids.length,11);
  assert.equal(raids.find(r=>r.level===75).cashPool,720000);
  const result=raidPoolBaseline(raidSource);
  assert.equal(result.proposedEligible.length,10);
  assert.ok(result.proposedEligible.every(r=>r.level<=70));
  assert.ok(result.warning.includes('não são crédito individual'));
});
test('simulações de 7, 30 e 60 dias dos quatro perfis fecham contabilidade',()=>{
  assert.deepEqual(WINDOWS,[7,30,60]);
  assert.deepEqual(PROFILES.map(p=>p.id),['casual','regular','dedicado','intensivo']);
  for(const p of PROFILES)for(const days of WINDOWS){
    const r=simulatePlayer(p,days,catalog.proposed,'proposed');
    assert.equal(r.days,days);
    assert.equal(r.accountingBalanced,true);
    assert.equal(r.netGenerated,r.cash+r.spentOnInvestments);
    assert.ok(r.cash>=0);
    assert.ok(r.portfolioValue>=0);
    assert.ok(r.ownedBusinesses<=9);
    assert.ok(r.totalXp>0);
    assert.deepEqual(r,simulatePlayer(p,days,catalog.proposed,'proposed'));
    assert.ok(r.businessOperating>=0);
    assert.ok(r.businessTax>=0);
    assert.ok(r.netGenerated>=r.portfolioValue||r.spentOnInvestments===r.portfolioValue);
  }
});
test('relatório transparente informa hipóteses, não conecta no banco ou aplica política',()=>{
  const r=economyScenarioReport(businessSource,raidSource);
  assert.equal(r.readOnly,true);
  assert.equal(r.mode,'proposal_simulation_only');
  assert.equal(r.profiles.length,12);
  assert.deepEqual(r.eligibleRaidLevels,[10,15,20,25,30,40,50,60,65,70]);
  assert.equal(r.excludedRaidLevel,75);
  assert.ok(r.businessEndgame.proposed<r.businessEndgame.current);
  assert.ok(r.profiles.every(p=>p.proposed.accountingBalanced&&p.current.accountingBalanced));
  const source=readFileSync(new URL('../scripts/reboot-economy-sim.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/DATABASE_URL|\bTRUNCATE\b|\bDELETE FROM\b|\bdb\.query\b|\bclient\.query\b/);
});
