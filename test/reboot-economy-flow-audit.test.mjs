import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditMoneyFlows} from '../scripts/reboot-economy-flow-audit.mjs';

const paths={
  weeklyBoss:'src/neon/weekly-boss-prize-pool.js',
  gt:'src/neon/gt-alpha-rules.js',
  poco:'src/neon/poco-abismo-rules.js',
  pocoRewards:'src/neon/poco-abismo-rewards.js',
  daily:'src/neon/daily-v2.js',
  mission:'src/neon/daily-mission-rotation.js',
  raids:'src/neon/games.js',
  raidLote:'src/neon/raid-lote-policy.js',
  businesses:'src/neon/progression.js'
};
const src=Object.fromEntries(Object.entries(paths).map(([k,p])=>
  [k,readFileSync(new URL('../'+p,import.meta.url),'utf8')]));
const audit=auditMoneyFlows(src);

test('Superboss 50 milhões, GT semanal 29 milhões, Poço sazonal 50 milhões',()=>{
  assert.equal(audit.readOnly,true);
  assert.equal(audit.ignoreLast12Hours,true);
  assert.equal(audit.weeklyBoss.cashPool,50_000_000);
  assert.deepEqual(audit.gt.weeklyPrizes,[15_000_000,8_000_000,5_000_000,1_000_000]);
  assert.equal(audit.gt.weeklyTotal,29_000_000);
  assert.deepEqual(audit.poco.rankingPrizes,[25_000_000,15_000_000,10_000_000]);
  assert.equal(audit.poco.rankingTotal,50_000_000);
  assert.equal(audit.mixedPeriodStressTotal,129_000_000);
  assert.match(audit.warning,/períodos DIFERENTES/);
});
test('GT 3 provas: emissão por posição, não prêmio semanal garantido',()=>{
  assert.equal(audit.gt.heatsPerDay,3);
  assert.deepEqual(audit.gt.heatPrizes,[300_000,200_000,120_000,70_000,30_000]);
  assert.equal(audit.gt.maxFourPlayersPerHeat,690_000);
  assert.equal(audit.gt.threeHeatsFourPlayers,2_070_000);
  assert.equal(audit.gt.xpPercentPerPlace[0],60);
});
test('Poço soma 30 andares e oferece equipamento ★5 Lv10 nos drops',()=>{
  assert.equal(audit.poco.floorLimit,30);
  assert.equal(audit.poco.completeRunFloorCash,3_500_000);
  assert.equal(audit.poco.dropsCanGrantMaxedGear,true);
});
test('diário depende de resgate, cinco missões e sequência',()=>{
  assert.deepEqual(audit.daily.baseCashByTier,[15_000,30_000,50_000,75_000,100_000]);
  assert.equal(audit.daily.streakBonuses.length,5);
  assert.equal(audit.daily.thirtyClaimsTierOneMax,2_450_000);
  assert.equal(audit.daily.missionTypes.length,8);
  assert.equal(audit.daily.topFiveMissionCash,155_000);
});
test('RaidLote depende de vitória, recompensa de Raid é pool e 75 fica fora',()=>{
  assert.equal(audit.raids.regular.length,10);
  assert.equal(audit.raids.excluded,75);
  assert.equal(audit.raids.regular.at(-1).level,70);
  assert.equal(audit.raids.regular.at(-1).cashPool,710_000);
  assert.equal(audit.raids.regular.at(-1).keyPrice,390_000);
  assert.equal(audit.raids.poolsNotPerPlayer,true);
  assert.equal(audit.raidLote.maxAttempts,10);
  assert.equal(audit.raidLote.feeBasisPoints,1000);
  assert.equal(audit.raidLote.cashNetProfitBasisPoints,5000);
  assert.equal(audit.raidLote.winConditional,true);
});
test('fonte de catálogo incorreta bloqueia relatório',()=>{
  assert.throws(()=>auditMoneyFlows({...src,gt:src.gt.replace('GT_WEEKLY_PRIZES','GT_UNKNOWN_PRIZES')}),/Fonte ou estrutura/);
  assert.throws(()=>auditMoneyFlows({...src,mission:''}),/Fonte ou estrutura/);
  assert.throws(()=>auditMoneyFlows({...src,weeklyBoss:null}),/Arquivo-fonte ausente/);
});
test('sem consulta a dados bancários e pressão indicativa não é renda semanal',()=>{
  assert.equal(audit.source,'git_static_no_live_balance');
  assert.ok(audit.fourPlayerSevenDayModelCashNet>0);
  assert.ok(audit.mixedPeriodStressRatio>10);
  const source=readFileSync(new URL('../scripts/reboot-economy-flow-audit.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/DATABASE_URL|db\.query|client\.query|fetch\(|https?:\/\/|process\.env/);
});
