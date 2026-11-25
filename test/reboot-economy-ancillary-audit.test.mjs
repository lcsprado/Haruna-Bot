import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {C4F_SOURCES,auditAncillaryCashSources} from '../scripts/reboot-economy-ancillary-audit.mjs';
const files=Object.fromEntries(Object.entries(C4F_SOURCES).map(([key,path])=>
 [key,readFileSync(new URL('../'+path,import.meta.url),'utf8')]));
const report=auditAncillaryCashSources(files);
test('C4f identifica os 3 Bingos históricos e leilão sem reusar suas edições',()=>{
 assert.equal(report.readOnly,true);
 assert.equal(report.legacyEvents.length,4);
 assert.ok(report.legacyEvents.every(x=>x.closed&&!x.canReuseInV2));
 assert.equal(report.legacyBingoTotalNominal,6_270_000);
 assert.throws(()=>auditAncillaryCashSources({...files,
  bingoNov16:files.bingoNov16.replace('2026-11-16T20:00:00-03:00','2026-12-16T20:00:00-03:00')
 }),/não encerrado/);
});
test('patrocínio V2 não multiplica lucro semanal do GT',()=>{
 assert.equal(report.sponsor.cash,5000);
 assert.deepEqual(report.sponsor.discountCaps,[5000,10000]);
 assert.equal(report.gt.weeklyRanking,102500);
 assert.equal(report.gt.dailyHeatsFourPlayers,52500);
 assert.equal(report.gt.weeklySponsorMaxFour,20000);
 assert.equal(report.gt.maxConditionalWeeklyWithSponsors,490000);
});
test('empréstimos transferem valor, leilão consome caixa mas itens ainda precisam correção',()=>{
 assert.equal(report.loans.mintsMoney,false);
 assert.equal(report.loans.kind,'transfer_between_players');
 assert.equal(report.auction.kind,'cash_sink_with_item_reward');
 assert.equal(report.auction.fullyForgedVouchersPresent,true);
 assert.ok(report.blockers.some(x=>x.includes('Bingos antigos')));
});
test('auditoria é estática e falha quando a lógica financeira conhecida muda',()=>{
 assert.equal(report.playersRead,false);
 const src=readFileSync(new URL('../scripts/reboot-economy-ancillary-audit.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/DATABASE_URL|client\.query|db\.query|INSERT INTO|DELETE FROM|fetch\(/);
 assert.throws(()=>auditAncillaryCashSources({...files,loans:''}),/revisão necessária/);
});
