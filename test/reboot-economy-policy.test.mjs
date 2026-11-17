import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 V2_EVENT_BUDGET,V2_RAID_LEVELS,V2_BUSINESS_ECONOMY,V2_GOALS,
 budgetReport,candidateRaidConfig,candidateShopCatalogItem,candidateBusinessCatalog,businessIntervalGrossV2,raid70V2Policy,assertRaid70V2Start,
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
test('Preço de chave V2 coincide entre loja, catálogo e Raid sem alterar V1',()=>{
 const old=['chave_raid_70','Chave de Raid', 'Entrada', 'special',390000,'legendary'];
 assert.equal(candidateShopCatalogItem(old,{enabled:false}),old);
 const patched=candidateShopCatalogItem(old,{enabled:true});
 assert.notEqual(patched,old);
 assert.equal(patched[4],V2_RAID_LEVELS[70].keyPrice);
 assert.equal(old[4],390000);
 assert.equal(candidateShopCatalogItem(['chave_raid_75','Collab','', 'special',480000,'event'],{enabled:true})[4],480000);
 const source=getSource('src/neon/db.js');
 assert.match(source,/candidateShopCatalogItem\(item\)/);
 for(const level of Object.keys(V2_RAID_LEVELS)){
  const id='chave_raid_'+level,updated=candidateShopCatalogItem([id,id,'','special',9999,'common'],{enabled:true});
  assert.equal(updated[4],V2_RAID_LEVELS[level].keyPrice);
 }
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

test('Negócios V2 respeitam tarifa, capacidade fixa e nível, sem histórico da V1',()=>{
 const base={id:'tech',price:30000000,profitHour:110000,capacityHours:24};
 const v1=candidateBusinessCatalog(base,{enabled:false});
 const v2=candidateBusinessCatalog(base,{enabled:true});
 assert.equal(v1,base);
 assert.equal(v2.profitHour,42000);
 assert.equal(base.profitHour,110000);
 const now=1_900_000_000;
 assert.equal(businessIntervalGrossV2(base,{level:5,last_collected_at:now-48*3600},now),1_612_800);
 assert.equal(businessIntervalGrossV2(base,{level:1,last_collected_at:now-2*3600},now),84_000);
 assert.equal(businessIntervalGrossV2(base,{level:1,last_collected_at:now+3600},now),0);
 assert.throws(()=>businessIntervalGrossV2({id:'invalido',capacityHours:24},{level:1},now),/inválidos/);
 const progression=getSource('src/neon/progression.js');
 assert.ok(progression.includes('businessIntervalGrossV2(b,row,now)'));
 assert.ok(progression.includes('operating=rebootEconomyEnabled()?Math.floor(gross*V2_BUSINESS_ECONOMY.operatingCostRate):0'));
 assert.ok(progression.includes('const recovery=rebootEconomyEnabled()?null:'));
 assert.ok(progression.includes("const moneyMultiplier=rebootEconomyEnabled()?1:await getDoubleEventMultiplier(client,'money')"));
 const wa=getSource('src/neon/index.js');
 assert.ok(wa.includes('BUSINESSES.map(b=>candidateBusinessCatalog(b)).forEach'));
});
