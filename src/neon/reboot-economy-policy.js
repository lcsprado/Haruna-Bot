// Alpha Bot 2.0 — política candidata única para emissões e dificuldade.
// Isolada por ALPHA_REBOOT_MODE=classes_only, SEM mudança na V1.
// Valores desta política são candidatos de balanceamento: homologar gastos/EXP
// antes de conectar todas as rotinas de recompensa à execução real.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js';
import {equipmentCatalogPrice} from './reboot-gear-economy.js';
import {consumableCatalogPrice} from './reboot-progression-rewards.js';

export const V2_EVENT_BUDGET=Object.freeze({
  weeklyBossPool:40_000,                       // total coletivo, nunca por jogador
  gtWeeklyPrizes:Object.freeze([10_000,5_500,3_000,1_500]),
  gtHeatPrizes:Object.freeze([1_200,750,450,250,100]),
  gtXpPercentPerHeat:Object.freeze([6,5,4,3,2]), // máximo 18% do próximo nível/3 vitórias
  pocoRankPrizes:Object.freeze([20_000,12_000,8_000]), // só uma edição sazonal
  pocoFloorBands:Object.freeze([300,500,700,1_100,1_600,2_300]),
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
  taxRate:.10,operatingCostRate:.10,levelBonus:.10,capacityExtraHoursPerLevel:0,
  hourlyRates:Object.freeze({
    carrinho_lanche:160,barbearia:400,loja_roupas:900,restaurante:1_700,
    posto:3_000,mercado:4_500,hotel:8_000,shopping:14_000,tech:27_000
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

// Pagamento coletivo V2: reembolsa a chave consumida por integrante
// e limita o lucro NOVO a 12% do cashPool nominal por vitória (não por jogador).
// Metade do bônus é igualitária (suporte) e metade por dano registrado.
export function raidCashSharesV2(config,participants,{enabled=rebootEconomyEnabled()}={}){
 if(!enabled)return null;
 const key=Number(config?.keyPrice),pool=Number(config?.cashPool);
 if(!Number.isSafeInteger(key)||key<=0||!Number.isSafeInteger(pool)||pool<0)
   throw new RangeError('Configuração financeira da Raid inválida');
 if(!Array.isArray(participants)||participants.length<1||participants.length>10)
   throw new RangeError('Equipe inválida');
 const seen=new Set();
 const rows=participants.map(p=>{
   const jid=String(p?.jid||''),damage=Number(p?.damage);
   if(!jid||seen.has(jid)||!Number.isSafeInteger(damage)||damage<0)
     throw new RangeError('Contribuição inválida ou duplicada');
   seen.add(jid);
   return {jid,damage};
 });
 const totalDamage=rows.reduce((a,p)=>a+BigInt(p.damage),0n);
 if(totalDamage===0n)throw new RangeError('Raid sem dano');
 const bonusBudget=Math.floor(pool*.12),equal=Math.floor(bonusBudget/2);
 const damageBudget=bonusBudget-equal;
 const shared=Math.floor(equal/rows.length),remaining=equal%rows.length;
 const bonuses=rows.map((p,i)=>shared+(i<remaining?1:0));
 let distributed=0;
 const remainders=rows.map((p,i)=>{
   const weighted=BigInt(damageBudget)*BigInt(p.damage);
   const earned=Number(weighted/totalDamage);
   bonuses[i]+=earned;distributed+=earned;
   return {i,remainder:weighted%totalDamage};
 });
 remainders.sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1);
 for(let i=0;i<damageBudget-distributed;i++)bonuses[remainders[i].i]++;
 const payouts=new Map(rows.map((p,i)=>[p.jid,key+bonuses[i]]));
 const keyReimbursements=key*rows.length;
 const awarded=[...payouts.values()].reduce((a,b)=>a+b,0);
 if(!Number.isSafeInteger(awarded)||awarded!==keyReimbursements+bonusBudget)
   throw new Error('Prêmio da Raid fora do limite coletivo');
 return {payouts,keyReimbursements,bonusBudget,awarded};
}

export function candidateShopCatalogItem(row,{enabled=rebootEconomyEnabled()}={}){
 if(!Array.isArray(row))throw new TypeError('Item de catálogo inválido');
 if(!enabled)return row;
 const match=String(row[0]||'').match(/^chave_raid_(\d+)$/);
 const price=match?V2_RAID_LEVELS[Number(match[1])]?.keyPrice:
   row[3]==='consumable'?consumableCatalogPrice(row[0],row[4],{enabled:true}):
   equipmentCatalogPrice({category:row[3],price:row[4],rarity:row[5]},{enabled:true});
 return price===undefined||price===row[4]?row:[...row.slice(0,4),price,...row.slice(5)];
}

export function raid70V2Policy(level,{enabled=rebootEconomyEnabled()}={}){
  return enabled&&Number(level)===70
    ?{minPlayers:3,minLevel:90,allowRaidLote:false,minimumMeaningfulContributors:3}
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
  // Curadores e defensores contribuem com suporte, sem exigir dano igual ao DPS.
  const minimumHealing=Math.max(200,total*.002);
  const qualified=participants.filter(p=>p.jid&&(
    (Number(p.damage||0)>0&&Number(p.damage||0)>=total*.05)||
    (Number(p.classHealing||0)+Number(p.petSkillHealing||0)>=minimumHealing)
  ));
  const count=new Set(qualified.map(p=>p.jid)).size;
  return {valid:total>0&&count>=3,required:3,contributors:count};
}
export function candidateBusinessCatalog(business,{enabled=rebootEconomyEnabled()}={}){
 if(!business)return business;
 if(!enabled)return business;
 const hourly=V2_BUSINESS_ECONOMY.hourlyRates[business.id];
 if(!Number.isSafeInteger(hourly)||hourly<0)throw new Error('Negócio sem tarifa V2 aprovada.');
 return {...business,profitHour:hourly};
}
export function businessIntervalGrossV2(business,row,now){
 const hourly=V2_BUSINESS_ECONOMY.hourlyRates[business?.id],cap=Number(business?.capacityHours);
 const end=Number(now),start=Number(row?.last_collected_at??end),level=Number(row?.level||1);
 if(!Number.isSafeInteger(hourly)||!Number.isFinite(cap)||cap<=0||!Number.isFinite(end)||
    !Number.isFinite(start)||!Number.isInteger(level)||level<1||level>5)
    throw new Error('Dados de coleta V2 inválidos.');
 const seconds=Math.min(Math.max(0,end-start),cap*3600);
 return Math.floor(seconds/3600*hourly*(1+(level-1)*V2_BUSINESS_ECONOMY.levelBonus));
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
