#!/usr/bin/env node
// Alpha C2 — auditoria de orçamentos de prêmio feita só com arquivos Git.
// Sem conexão, JID, DATABASE_URL, saldos ou histórico de transações.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractRaidPoolCatalog,economyScenarioReport} from './reboot-economy-sim.mjs';

const PATHS=Object.freeze({
  weeklyBoss:'src/neon/weekly-boss-prize-pool.js',
  gt:'src/neon/gt-alpha-rules.js',
  poco:'src/neon/poco-abismo-rules.js',
  pocoRewards:'src/neon/poco-abismo-rewards.js',
  daily:'src/neon/daily-v2.js',
  mission:'src/neon/daily-mission-rotation.js',
  raids:'src/neon/games.js',
  raidLote:'src/neon/raid-lote-policy.js',
  businesses:'src/neon/progression.js'
});
function required(text,re,key){
  const match=String(text||'').match(re);
  if(!match)throw new Error('Fonte ou estrutura não reconhecida: '+key);
  return match[1];
}
function amounts(text,key){
  const chunks=text.split(',').map(s=>s.trim()).filter(Boolean);
  if(!chunks.length||chunks.some(s=>!/^\d[\d_]*$/.test(s)))throw new Error('Lista inválida: '+key);
  return chunks.map(s=>Number(s.replaceAll('_','')));
}
const sum=list=>list.reduce((a,b)=>a+b,0);
export function auditMoneyFlows(src){
  for(const key of Object.keys(PATHS))if(typeof src?.[key]!=='string')
    throw new TypeError('Arquivo-fonte ausente: '+key);
  const weeklyBoss=Number(required(src.weeklyBoss,/WEEKLY_BOSS_POOL_CASH\s*=\s*([\d_]+)/,'Boss semanal').replaceAll('_',''));
  const gtWeekly=amounts(required(src.gt,/GT_WEEKLY_PRIZES=Object\.freeze\(\[([^\]]+)\]\)/,'GT semanal'),'GT semanal');
  const gtHeats=required(src.gt,/GT_TRACK_IDS=Object\.freeze\(\[([^\]]+)\]\)/,'pistas GT').split(',').length;
  const gtRace=amounts(required(src.gt,/GT_RACE_CASH_PRIZES=Object\.freeze\(\[([^\]]+)\]\)/,'GT corrida'),'GT corrida');
  const gtXp=amounts(required(src.gt,/GT_RACE_XP_PERCENTS=Object\.freeze\(\[([^\]]+)\]\)/,'GT XP'),'GT XP');
  const pocoPrizes=amounts(required(src.poco,/prizes:\[([^\]]+)\]/,'Poço ranking'),'Poço ranking');
  const pocoBands=amounts(required(src.poco,/floorMoney=f=>\[([^\]]+)\]/,'Poço andares'),'Poço andares');
  const floorLimit=Number(required(src.poco,/floorLimit:(\d+)/,'total andares'));
  if(pocoBands.length!==6||floorLimit!==30)throw new Error('Poço mudou de duração; revisar faixas');
  const dailyBase=amounts(required(src.daily,/const baseCash=\[([^\]]+)\]\[tier\]/,'resgate diário'),'resgate diário');
  const milestoneBlock=required(src.daily,/const m=\{([\s\S]*?)\}\s*\n\s*return m\[d\]/,'bônus sequência');
  const milestones=[...milestoneBlock.matchAll(/(\d+):\{cash:(\d+)/g)].map(m=>({day:Number(m[1]),cash:Number(m[2])}));
  const missionBlock=required(src.mission,/const QUESTS=Object\.freeze\(\{([\s\S]*?)\n\}\);/,'missões V3');
  const missionTypes=[...missionBlock.matchAll(/^\s*(\w+):\{cash:(\d+),xp:(\d+),petXp:(\d+)/gm)]
    .map(m=>({type:m[1],cash:Number(m[2]),xp:Number(m[3]),petXp:Number(m[4])}));
  const raid=extractRaidPoolCatalog(src.raids);
  const regular=raid.filter(r=>r.level!==75);
  const fee=Number(required(src.raidLote,/feeBasisPoints:(\d+)/,'taxa RaidLote'));
  const share=Number(required(src.raidLote,/cashNetProfitBasisPoints:(\d+)/,'lucro RaidLote'));
  const maxAttempts=Number(required(src.raidLote,/maxAttempts:(\d+)/,'tentativas RaidLote'));
  if(weeklyBoss<=0||gtWeekly.length!==4||gtRace.length!==5||gtXp.length!==5||
    gtHeats!==3||pocoPrizes.length!==3||dailyBase.length!==5||
    milestones.length!==5||missionTypes.length!==8||raid.length!==11)
    throw new Error('Catálogo mudou; auditoria bloqueada até revisão');
  const modeled=economyScenarioReport(src.businesses,src.raids);
  const modelWeekFourPlayers=sum(modeled.profiles.filter(x=>x.days===7).map(x=>x.proposed.netGenerated));
  const seasonAndWeeklyMixed=weeklyBoss+sum(gtWeekly)+sum(pocoPrizes);
  return {
    readOnly:true,source:'git_static_no_live_balance',ignoreLast12Hours:true,
    weeklyBoss:{cashPool:weeklyBoss,from:'2026-11-20',period:'weekly',sharedPool:true},
    gt:{weeklyPrizes:gtWeekly,weeklyTotal:sum(gtWeekly),heatsPerDay:gtHeats,
      heatPrizes:gtRace,maxFourPlayersPerHeat:sum(gtRace.slice(0,4)),
      threeHeatsFourPlayers:gtHeats*sum(gtRace.slice(0,4)),xpPercentPerPlace:gtXp},
    poco:{rankingPrizes:pocoPrizes,rankingTotal:sum(pocoPrizes),period:'one_2026_11_16_20_event',
      floorLimit,completeRunFloorCash:5*sum(pocoBands),
      dropsCanGrantMaxedGear:/INSERT INTO equipment_star_forges[\s\S]*?VALUES\(\$1,\$2,5,10,/.test(src.pocoRewards)},
    daily:{baseCashByTier:dailyBase,streakBonuses:milestones,
      thirtyClaimsTierOneMax:dailyBase[0]*30+sum(milestones.map(x=>x.cash)),
      missionTypes,topFiveMissionCash:sum(missionTypes.map(x=>x.cash).sort((a,b)=>b-a).slice(0,5))},
    raids:{regular,excluded:75,poolsNotPerPlayer:true,
      aggregatePoolAcrossDifferentLevels:sum(regular.map(x=>x.cashPool))},
    raidLote:{feeBasisPoints:fee,cashNetProfitBasisPoints:share,maxAttempts,
      winConditional:true},
    fourPlayerSevenDayModelCashNet:modelWeekFourPlayers,
    mixedPeriodStressTotal:seasonAndWeeklyMixed,
    mixedPeriodStressRatio:Number((seasonAndWeeklyMixed/Math.max(1,modelWeekFourPlayers)).toFixed(2)),
    warning:'Choque hipotético de prêmios de períodos DIFERENTES; não é total semanal, não é renda garantida nem valor observado.',
    pending:['Boss comum','Patrocínio GT','Uber e iFood (ativo e CLT)','Leilão e bingo',
      'Caixas, raridades e drops','Poço futuro e eventos recorrentes','Empréstimos, IPTU, IPVA e manutenção',
      'PvP e clãs','Multiplicadores e curva real de EXP']
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const src=Object.fromEntries(Object.entries(PATHS).map(([k,path])=>
    [k,readFileSync(new URL('../'+path,import.meta.url),'utf8')]));
  const r=auditMoneyFlows(src);
  if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(r,null,2)+'\n');
  else{
    process.stdout.write('ECONOMIA C2 — SÓ CÓDIGO, ZERO BANCO\n');
    process.stdout.write('Boss semanal R$ '+r.weeklyBoss.cashPool.toLocaleString('pt-BR')+'\n');
    process.stdout.write('GT ranking semanal R$ '+r.gt.weeklyTotal.toLocaleString('pt-BR')+'\n');
    process.stdout.write('Poço sazonal R$ '+r.poco.rankingTotal.toLocaleString('pt-BR')+'\n');
    process.stdout.write('Poço 30 andares R$ '+r.poco.completeRunFloorCash.toLocaleString('pt-BR')+' por vencedor\n');
    process.stdout.write('Choque misto fictício R$ '+r.mixedPeriodStressTotal.toLocaleString('pt-BR')+' ('+r.mixedPeriodStressRatio+'x modelo semanal de 4 jogadores)\n');
  }
}
