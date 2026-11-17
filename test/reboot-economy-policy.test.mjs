import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 V2_EVENT_BUDGET,V2_RAID_LEVELS,V2_BUSINESS_ECONOMY,V2_GOALS,
 budgetReport,candidateRaidConfig,raid70V2Policy,assertRaid70V2Start,
 raid70V2Contributors,rebootEconomyEnabled
} from '../src/neon/reboot-economy-policy.js';
import {gtRaceReward,gtEffectiveWeeklyPrizes} from '../src/neon/gt-alpha-rules.js';
import {weeklyBossCashPoolShares} from '../src/neon/weekly-boss-prize-pool.js';

const getSource=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const withMode=(mode,fn)=>{
 const old=process.env.ALPHA_REBOOT_MODE;
 try{
  if(mode===null)delete process.env.ALPHA_REBOOT_MODE;
  else process.env.ALPHA_REBOOT_MODE=mode;
  return fn();
 }finally{
  if(old===undefined)delete process.env.ALPHA_REBOOT_MODE;
  else process.env.ALPHA_REBOOT_MODE=old;
 }
};
test('V1 mantém todos os valores originais, inclusive premiações antigas',()=>{
 withMode(null,()=>{
  assert.equal(rebootEconomyEnabled(),false);
  assert.deepEqual(gtEffectiveWeeklyPrizes(),[15000000,8000000,5000000,1000000]);
  assert.deepEqual(gtRaceReward(1,70),{cash:300000,pilotXp:750,playerXp:4200,percent:60});
  const winners=weeklyBossCashPoolShares('2026-11-20',[{jid:'a',damage:1},{jid:'b',damage:1}]);
  assert.equal([...winners.values()].reduce((a,b)=>a+b,0),50_000_000);
  const oldRaid={level:70,hp:710000,keyPrice:390000};
  assert.equal(candidateRaidConfig(oldRaid),oldRaid);
 });
});
test('V2 limita Boss semanal, ranking e etapas do GT, sem reduzir piloto',()=>{
 withMode('classes_only',()=>{
  assert.equal(rebootEconomyEnabled(),true);
  assert.equal(budgetReport().weeklyBoss,240_000);
  assert.equal(budgetReport().weeklyGt,145_000);
  assert.equal(budgetReport().gtThreeHeatsFourPlayers,54_000);
  assert.deepEqual(gtEffectiveWeeklyPrizes(),V2_EVENT_BUDGET.gtWeeklyPrizes);
  const top=gtRaceReward(1,70);
  assert.deepEqual(top,{cash:8000,pilotXp:750,playerXp:420,percent:6});
  assert.equal(gtRaceReward(1,70).playerXp*3,1260);
  const winners=weeklyBossCashPoolShares('2026-11-20',[
   {jid:'a',damage:3},{jid:'b',damage:2},{jid:'c',damage:1}]);
  assert.equal([...winners.values()].reduce((a,b)=>a+b,0),240_000);
 });
});
test('Economia V2 tem orçamentos explícitos para todos os principais eventos',()=>{
 const b=budgetReport();
 assert.equal(b.seasonalPocoRank,230_000);
 assert.equal(b.pocoAllFloors,114_500);
 assert.equal(b.dailyThirtyDayLowLevel,140_000);
 assert.equal(b.topFiveMissions,19_500);
 assert.equal(Object.keys(V2_RAID_LEVELS).length,10);
 assert.equal(Object.keys(V2_BUSINESS_ECONOMY.hourlyRates).length,9);
 assert.deepEqual(V2_GOALS,{freshPlayers:4,startingLevel:1,startingCash:0,startingCharacterXp:0,
  weeklyEmissionsRequireAggregateCap:true,noLegacyCollabRewards:true,
  noMaxedGearFromFreshEventDrops:true,preservePvERoles:true});
});
test('Raid 70 exige três jogadores, nível 90 e não pode entrar no lote',()=>{
 const old={level:70,hp:710000,atk:200,keyPrice:390000,cashPool:710000,xpPool:24000};
 const v2=candidateRaidConfig(old,{enabled:true});
 assert.equal(v2.hp,1_600_000);
 assert.equal(v2.atk,320);
 assert.equal(v2.minLevel,90);
 assert.equal(v2.keyPrice,60_000);
 assert.equal(v2.cashPool,200_000);
 assert.equal(v2.xpPool,14_000);
 assert.equal(raid70V2Policy(70,{enabled:true}).minPlayers,3);
 assert.equal(raid70V2Policy(70,{enabled:true}).allowRaidLote,false);
 assert.throws(()=>assertRaid70V2Start({level:70,partySize:1,enabled:true}),/3 jogadores/);
 assert.throws(()=>assertRaid70V2Start({level:70,partySize:2,enabled:true}),/3 jogadores/);
 assert.throws(()=>assertRaid70V2Start({level:70,partySize:3,mode:'lote',enabled:true}),/RaidLote/);
 assert.equal(assertRaid70V2Start({level:70,partySize:3,enabled:true}),true);
 assert.equal(assertRaid70V2Start({level:70,partySize:1,enabled:false}),true);
 assert.equal(assertRaid70V2Start({level:65,partySize:1,enabled:true}),true);
});
test('Raid 70 não paga vitória para um carregador acompanhado de dois inativos',()=>{
 assert.equal(raid70V2Contributors({
  a:{jid:'a',damage:980000},b:{jid:'b',damage:1000},c:{jid:'c',damage:1000}
 },{level:70,enabled:true}).valid,false);
 assert.equal(raid70V2Contributors({
  a:{jid:'a',damage:500000},b:{jid:'b',damage:400000},c:{jid:'c',damage:100000}
 },{level:70,enabled:true}).valid,true);
 assert.equal(raid70V2Contributors({}, {level:70,enabled:false}).valid,true);
});
test('Chaves das dez Raids crescem sem premiar em dinheiro mais do que o necessário',()=>{
 const levels=Object.keys(V2_RAID_LEVELS).map(Number).sort((a,b)=>a-b);
 assert.deepEqual(levels,[10,15,20,25,30,40,50,60,65,70]);
 for(let i=1;i<levels.length;i++){
  assert.ok(V2_RAID_LEVELS[levels[i]].keyPrice>V2_RAID_LEVELS[levels[i-1]].keyPrice);
 }
 assert.equal(V2_RAID_LEVELS[70].cashPool,200000);
 assert.equal(V2_RAID_LEVELS[10].cashPool,12000);
 assert.throws(()=>candidateRaidConfig({level:75},{enabled:true}),/sem orçamento/);
});
test('Todas as entradas da Raid 70 utilizam proteção e nenhuma compra pode ser debitada antes',()=>{
 const games=getSource('src/neon/games.js'),store=getSource('src/neon/raid-lote-store.js'),wa=getSource('src/neon/index.js');
 assert.match(games,/assertRaid70V2Start\(\{level:cfg\.level,partySize:ids\.length,mode:loteAttemptId\?'lote':'manual'\}\)/);
 assert.match(games,/const cooperation=raid70V2Contributors\(s\.players,\{level:cfg\.level\}\)/);
 assert.match(games,/const raidEffectiveConfig=level=>candidateRaidConfig\(raidConfig\(level\)\)/);
 assert.match(store,/assertRaid70V2Start\(\{level:cfg\.level,partySize:1,mode:'lote'\}\)/);
 assert.ok(store.indexOf('assertRaid70V2Start')<store.indexOf('const initialQuote=raidLoteQuote'));
 assert.match(wa,/classesOnlyRebootEnabled\(\)&&level===70/);
 assert.ok(wa.includes("classesOnlyRebootEnabled()?'65':'75'"));
});
test('Missões e bônus da V2 têm valores menores sem alterar regras da versão 1',()=>{
 const daily=getSource('src/neon/daily-v2.js');
 assert.match(daily,/const cash=rebootEconomyEnabled\(\)\?V2_EVENT_BUDGET\.dailyMissionCash\[m\.type\]/);
 assert.match(daily,/const effectiveBaseCash=rebootEconomyEnabled\(\)\?V2_EVENT_BUDGET\.dailyBaseByTier\[tier\]:baseCash/);
 assert.match(daily,/V2_EVENT_BUDGET\.dailyStreakMilestones\[d\]/);
 assert.match(daily,/if\(rebootEconomyEnabled\(\)\)\{/);
 assert.ok(daily.includes("Caixa Épica"));
});
