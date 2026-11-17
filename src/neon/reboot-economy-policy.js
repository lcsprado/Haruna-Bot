// Alpha Bot 2.0 — política candidata única para emissões e dificuldade.
// Isolada por ALPHA_REBOOT_MODE=classes_only, SEM mudança na V1.
// Valores desta política são candidatos de balanceamento: homologar gastos/EXP
// antes de conectar todas as rotinas de recompensa à execução real.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js';

export const V2_EVENT_BUDGET=Object.freeze({
  weeklyBossPool:240_000,                       // total coletivo, nunca por jogador
  gtWeeklyPrizes:Object.freeze([70_000,40_000,25_000,10_000]),
  gtHeatPrizes:Object.freeze([8_000,5_000,3_000,2_000,1_000]),
  gtXpPercentPerHeat:Object.freeze([6,5,4,3,2]), // máximo 18% do próximo nível/3 vitórias
  pocoRankPrizes:Object.freeze([120_000,70_000,40_000]), // só uma edição sazonal
  pocoFloorBands:Object.freeze([1_000,1_800,2_600,4_000,5_500,8_000]),
  dailyBaseByTier:Object.freeze([2_000,3_000,4_500,6_000,8_000]),
  dailyStreakMilestones:Object.freeze({3:5_000,7:10_000,14:15_000,21:20_000,30:30_000}),
  dailyMissionCash:Object.freeze({
    battle:3_000,dungeon:4_000,work:3_000,pet_train:3_000,
    boss_damage:5_000,raid_damage:4_500,game:3_000,shop:3_000,
    legend_raid:7_000
  })
});
export const V2_RAID_LEVELS=Object.freeze({
  10:{keyPrice:2_000,cashPool:12_000,xpPool:600},
  15:{keyPrice:3_000,cashPool:16_000,xpPool:800},
  20:{keyPrice:4_500,cashPool:24_000,xpPool:1_200},
  25:{keyPrice:6_000,cashPool:32_000,xpPool:1_700},
  30:{keyPrice:9_000,cashPool:45_000,xpPool:2_500},
  40:{keyPrice:14_000,cashPool:65_000,xpPool:3_800},
  50:{keyPrice:22_000,cashPool:90_000,xpPool:6_000},
  60:{keyPrice:32_000,cashPool:125_000,xpPool:8_500},
  65:{keyPrice:45_000,cashPool:160_000,xpPool:11_000},
  70:{keyPrice:60_000,cashPool:200_000,xpPool:14_000,hp:1_600_000,atk:320,
      minLevel:90,minPlayers:3,allowRaidLote:false}
});
export const V2_BUSINESS_ECONOMY=Object.freeze({
  taxRate:.10,operatingCostRate:.10,levelBonus:.15,capacityExtraHoursPerLevel:0,
  hourlyRates:Object.freeze({
    carrinho_lanche:180,barbearia:450,loja_roupas:1_100,restaurante:2_200,
    posto:4_200,mercado:7_200,hotel:13_500,shopping:25_000,tech:42_000
  })
});
export const V2_GOALS=Object.freeze({
  freshPlayers:4,startingLevel:1,startingCash:0,startingCharacterXp:0,
  weeklyEmissionsRequireAggregateCap:true,
  noLegacyCollabRewards:true,noMaxedGearFromFreshEventDrops:true,
  preservePvERoles:true
});
export function rebootEconomyEnabled(env=process.env){
  return classesOnlyRebootEnabled(env);
}
export function candidateRaidConfig(base,{enabled=rebootEconomyEnabled()}={}){
  if(!base)return null;
  if(!enabled)return base;
  const patch=V2_RAID_LEVELS[Number(base.level)];
  if(!patch)throw new Error('Raid sem orçamento aprovado na Economia 2.0.');
  return {...base,...patch};
}
export function candidateShopCatalogItem(row,{enabled=rebootEconomyEnabled()}={}){
 if(!Array.isArray(row))throw new TypeError('Item de catálogo inválido');
 if(!enabled)return row;
 const match=String(row[0]||'').match(/^chave_raid_(\d+)$/);
 const price=match?V2_RAID_LEVELS[Number(match[1])]?.keyPrice:undefined;
 return price===undefined?row:[...row.slice(0,4),price,...row.slice(5)];
}

export function raid70V2Policy(level,{enabled=rebootEconomyEnabled()}={}){
  return enabled&&Number(level)===70
    ?{minPlayers:3,minLevel:90,allowRaidLote:false,minimumMeaningfulContributors:2}
    :{minPlayers:1,minLevel:null,allowRaidLote:true,minimumMeaningfulContributors:1};
}
export function assertRaid70V2Start({level,partySize,mode='manual',enabled=rebootEconomyEnabled()}={}){
  const policy=raid70V2Policy(level,{enabled});
  if(!enabled||Number(level)!==70)return true;
  if(mode==='lote')throw new Error('Raid 70 é cooperativa na nova temporada; RaidLote Lv.70 indisponível.');
  if(!Number.isSafeInteger(partySize)||partySize<policy.minPlayers){
    throw new Error('Raid 70 exige ao menos 3 jogadores distintos no início da batalha.');
  }
  return true;
}
export function raid70V2Contributors(players,{level,enabled=rebootEconomyEnabled()}={}){
  if(!enabled||Number(level)!==70)return {valid:true,required:1,contributors:0};
  const participants=Object.values(players||{});
  const total=participants.reduce((a,p)=>a+Math.max(0,Number(p.damage||0)),0);
  const qualified=participants.filter(p=>p.jid&&Number(p.damage||0)>0&&
    Number(p.damage||0)>=total*.05);
  return {valid:total>0&&new Set(qualified.map(p=>p.jid)).size>=2,
    required:2,contributors:new Set(qualified.map(p=>p.jid)).size};
}
export function budgetReport(){
  const e=V2_EVENT_BUDGET;
  return Object.freeze({
    weeklyBoss:e.weeklyBossPool,
    weeklyGt:e.gtWeeklyPrizes.reduce((a,b)=>a+b,0),
    gtThreeHeatsFourPlayers:3*e.gtHeatPrizes.slice(0,4).reduce((a,b)=>a+b,0),
    seasonalPocoRank:e.pocoRankPrizes.reduce((a,b)=>a+b,0),
    pocoAllFloors:5*e.pocoFloorBands.reduce((a,b)=>a+b,0),
    dailyThirtyDayLowLevel:30*e.dailyBaseByTier[0]+
      Object.values(e.dailyStreakMilestones).reduce((a,b)=>a+b,0),
    topFiveMissions:Object.values(e.dailyMissionCash).filter((_,i)=>i!==8)
      .sort((a,b)=>b-a).slice(0,5).reduce((a,b)=>a+b,0)
  });
}
