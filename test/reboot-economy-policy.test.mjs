import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 V2_EVENT_BUDGET,V2_RAID_LEVELS,V2_BUSINESS_ECONOMY,V2_GOALS,
 budgetReport,candidateRaidConfig,candidateShopCatalogItem,candidateBusinessCatalog,businessIntervalGrossV2,businessSettlementV2,raid70V2Policy,assertRaid70V2Start,
 raid70V2Contributors,raidCashSharesV2,raidV2EligibleRewards,raidV2MeaningfulContribution,rebootEconomyEnabled
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
  assert.equal(budgetReport().weeklyBoss,40_000);
  assert.equal(budgetReport().weeklyGt,102_500);
  assert.equal(budgetReport().gtThreeHeatsFourPlayers,52_500);
  assert.deepEqual(gtEffectiveWeeklyPrizes(),V2_EVENT_BUDGET.gtWeeklyPrizes);
  const top=gtRaceReward(1,70);
  assert.deepEqual(top,{cash:7000,pilotXp:750,playerXp:1050,percent:15});
  assert.equal(gtRaceReward(1,70).playerXp*3,3150);
  const winners=weeklyBossCashPoolShares('2026-11-20',[
   {jid:'a',damage:3},{jid:'b',damage:2},{jid:'c',damage:1}]);
  assert.equal([...winners.values()].reduce((a,b)=>a+b,0),40_000);
 });
});
test('Economia V2 tem orçamentos explícitos para todos os principais eventos',()=>{
 const b=budgetReport();
 assert.equal(b.seasonalPocoRank,40_000);
 assert.equal(b.pocoAllFloors,32_500);
 assert.equal(b.dailyThirtyDayLowLevel,143_000);
 assert.equal(b.topFiveMissions,6_000);
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
 assert.match(games,/const raidEffectiveConfig=level=>expandV2RaidWeapons\(candidateRaidConfig\(raidConfig\(level\)\),classesOnlyRebootEnabled\(\)\)/);
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
 assert.equal(v2.profitHour,7000);
 assert.equal(base.profitHour,110000);
 const now=1_900_000_000;
 assert.equal(businessIntervalGrossV2(base,{level:5,last_collected_at:now-48*3600},now),235_200);
 assert.equal(businessIntervalGrossV2(base,{level:1,last_collected_at:now-2*3600},now),14_000);
 assert.equal(businessIntervalGrossV2(base,{level:1,last_collected_at:now+3600},now),0);
 assert.throws(()=>businessIntervalGrossV2({id:'invalido',capacityHours:24},{level:1},now),/inválidos|sem tarifa/);
 const progression=getSource('src/neon/progression.js');
 assert.ok(progression.includes('businessIntervalGrossV2(b,row,now)'));
 assert.ok(progression.includes('rebootEconomyEnabled()?businessSettlementV2(gross):'));
 assert.ok(progression.includes('const recovery=rebootEconomyEnabled()?null:'));
 assert.ok(progression.includes("const moneyMultiplier=rebootEconomyEnabled()?1:await getDoubleEventMultiplier(client,'money')"));
 const wa=getSource('src/neon/index.js');
 assert.ok(wa.includes('BUSINESSES.map(b=>candidateBusinessCatalog(b)).forEach'));
});

test('V2 reforça somente quatro negócios iniciais, com 24 horas e líquido de 80%',()=>{
 const now=1_900_000_000;
 const starter=[
  {id:'carrinho_lanche',price:15_000,profitHour:300,capacityHours:8,expectedHour:90,expectedNet:1_728},
  {id:'barbearia',price:45_000,profitHour:800,capacityHours:8,expectedHour:150,expectedNet:2_880},
  {id:'loja_roupas',price:120_000,profitHour:2_000,capacityHours:10,expectedHour:250,expectedNet:4_800},
  {id:'restaurante',price:300_000,profitHour:4_500,capacityHours:10,expectedHour:400,expectedNet:7_680}
 ];
 for(const base of starter){
  const v1=candidateBusinessCatalog(base,{enabled:false});
  const v2=candidateBusinessCatalog(base,{enabled:true});
  assert.equal(v1,base);
  assert.equal(v2.profitHour,base.expectedHour);
  assert.equal(v2.capacityHours,24);
  const gross=businessIntervalGrossV2(base,{level:1,last_collected_at:now-24*3600},now);
  const settlement=businessSettlementV2(gross);
  assert.equal(settlement.net,base.expectedNet);
  assert.equal(settlement.tax+settlement.operating,gross-settlement.net);
  assert.equal(businessIntervalGrossV2(base,{level:1,last_collected_at:now-48*3600},now),gross);
  assert.equal(businessIntervalGrossV2(base,{level:2,last_collected_at:now-24*3600},now),
    Math.floor(gross*1.1));
 }
 const larger=[
  ['posto',7000,12,500],['mercado',12000,12,750],['hotel',24000,16,1666],
  ['shopping',50000,18,3187],['tech',110000,24,7000]
 ];
 for(const [id,profitHour,capacityHours,expected] of larger){
  assert.equal(candidateBusinessCatalog({id,profitHour,capacityHours},{enabled:true}).profitHour,expected);
 }
});

test('C4e limita lucro líquido de Raid por vitória sem depender de número de jogadores',()=>{
 const cfg=V2_RAID_LEVELS[70];
 const roster=n=>Array.from({length:n},(_,i)=>({jid:'j'+i,damage:1000}));
 for(const n of [3,4,5]){
  const result=raidCashSharesV2(cfg,roster(n),{enabled:true});
  assert.equal(result.bonusBudget,24000);
  assert.equal(result.keyReimbursements,n*60000);
  assert.equal(result.awarded,n*60000+24000);
  assert.equal([...result.payouts.values()].reduce((a,b)=>a+b,0),result.awarded);
 }
 const group=[{jid:'a',damage:7000},{jid:'b',damage:2500},{jid:'c',damage:500}];
 const split=raidCashSharesV2(cfg,group,{enabled:true});
 assert.ok(split.payouts.get('a')>split.payouts.get('c'));
 assert.ok(split.payouts.get('c')>cfg.keyPrice);
 assert.equal(raidCashSharesV2(cfg,group,{enabled:false}),null);
 assert.throws(()=>raidCashSharesV2(cfg,[{jid:'a',damage:2},{jid:'a',damage:1}],{enabled:true}),RangeError);
});
test('Raid 70 exige terceira contribuição, suporte de classe conta',()=>{
 const group={a:{jid:'a',damage:500000},b:{jid:'b',damage:400000},
   c:{jid:'c',damage:0,classHealing:3000}};
 assert.equal(raid70V2Contributors(group,{level:70,enabled:true}).valid,true);
 assert.equal(raid70V2Contributors({...group,c:{jid:'c',damage:0}},{level:70,enabled:true}).valid,false);
});

test('Poço V2 reduz ranking/andares e não entrega equipamento ★5 Lv10 pronto',()=>{
 const source=getSource('src/neon/poco-abismo-rewards.js');
 assert.match(source,/if\(rebootEconomyEnabled\(\)\)return \{kind:'exclusive',itemId,stars:1,level:1,needsForja:true\}/);
 assert.match(source,/V2_EVENT_BUDGET\.pocoRankPrizes\[position-1\]/);
 const rules=getSource('src/neon/poco-abismo-rules.js');
 assert.match(rules,/V2_EVENT_BUDGET\.pocoFloorBands/);
 assert.ok(V2_EVENT_BUDGET.pocoFloorBands.reduce((a,b)=>a+b,0)*5===32500);
});

test('Redistribuição V2 reduz emissão sem penalizar a primeira diária',()=>{
 assert.deepEqual(V2_EVENT_BUDGET.dailyBaseByTier,[4500,5000,5500,6000,6500]);
 assert.equal(V2_EVENT_BUDGET.dailyStreakMilestones[30],3000);
 assert.equal(V2_EVENT_BUDGET.dailyMissionCash.battle,750);
 const rates=Object.values(V2_BUSINESS_ECONOMY.hourlyRates);
 assert.equal(rates[0],270);
 assert.ok(rates.every((value,i)=>i===0||value>rates[i-1]));
});

test('V2 Raid: recompensa apenas contribuição efetiva, incluindo cura; V1 preservada',()=>{
 const rows=[{jid:'a',damage:9700},{jid:'b',damage:200},{jid:'c',damage:0,classHealing:200},{jid:'d',damage:100},{jid:'e',damage:0}];
 assert.deepEqual(raidV2EligibleRewards(rows,{enabled:true}).map(r=>r.jid),['a','b','c']);
 assert.deepEqual(raidV2EligibleRewards(rows,{enabled:false}),rows);
 assert.equal(raidV2MeaningfulContribution({jid:'x',damage:0,classHealing:199},10000),false);
 assert.equal(raidV2MeaningfulContribution({jid:'x',damage:0,petSkillHealing:200},10000),true);
 const game=getSource('src/neon/games.js');
 assert.match(game,/p\.damage=Number\(p\.damage\|\|0\)\+\(rebootEconomyEnabled\(\)\?actualDamage:dmg\)/);
 assert.match(game,/const ranked=raidV2EligibleRewards\(Object\.values\(s\.players\|\|\{\}\)\)/);
 assert.match(game,/const ownerDrop=rebootEconomyEnabled\(\)\?1:/);
 assert.match(game,/const loteReduced=lote&&\(rebootEconomyEnabled\(\)\|\|s\.auctionPassManualRewards!==true\)/);
 assert.match(game,/cfg\.level===60 && Number\(p\.damage\|\|0\)>0&&!rebootEconomyEnabled\(\)/);
 assert.equal((game.match(/cfg\.level===50 && Number\(p\.damage\|\|0\)>0&&!rebootEconomyEnabled\(\)/g)||[]).length,2);
 assert.match(game,/cfg\.level===70 && Number\(p\.damage\|\|0\)>0&&!rebootEconomyEnabled\(\)/);
 assert.match(game,/cfg\.level===65 && Number\(p\.damage\|\|0\)>0 && !rebootEconomyEnabled\(\)/);
});
test('V2 Raid aplica estrelas de botas no início e entrada tardia e Dungeon não usa eventos antigos',()=>{
 const game=getSource('src/neon/games.js'),db=getSource('src/neon/db.js');
 assert.match(game,/lev\(st\.boot_id\),rebootEconomyEnabled\(\)\?activeStars\(st\.boot_id\):1/);
 assert.match(game,/await lev\(st\.boot_id\),rebootEconomyEnabled\(\)\?forgeStars\[st\.boot_id\]\|\|1:1/);
 const dungeon=db.slice(db.indexOf('export async function dungeon(jid)'),db.indexOf('export async function robPlayer'));
 assert.match(dungeon,/moneyMultiplier=classesOnlyRebootEnabled\(\)\?1:await getDoubleEventMultiplier/);
 assert.match(dungeon,/xpMultiplier=classesOnlyRebootEnabled\(\)\?1:await getDoubleEventMultiplier/);
});
