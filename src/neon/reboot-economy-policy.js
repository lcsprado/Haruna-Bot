// Alpha Bot 2.0 — política candidata única para emissões e dificuldade.
// Isolada por ALPHA_REBOOT_MODE=classes_only, SEM mudança na V1.
// Valores desta política são candidatos de balanceamento: homologar gastos/EXP
// antes de conectar todas as rotinas de recompensa à execução real.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js';
import {equipmentCatalogPrice} from './reboot-gear-economy.js';
import {consumableCatalogPrice} from './reboot-progression-rewards.js';
import {V2_RAID_DIFFICULTY} from './reboot-combat-progression.js';
import {businessV3CatalogPatch,businessV3IntervalGross} from './business-rebalance-v3.js';
import {businessV4CatalogPatch,businessV4IntervalGross} from './business-rebalance-v4.js';

export const V2_EVENT_BUDGET=Object.freeze({
  weeklyBossPool:40_000,                       // total coletivo, nunca por jogador
  gtWeeklyPrizes:Object.freeze([50_000,30_000,15_000,7_500]),
  gtHeatPrizes:Object.freeze([7_000,5_000,3_500,2_000,1_000]),
  gtXpPercentPerHeat:Object.freeze([15,12,10,8,5]), // máximo 45% do próximo nível/3 vitórias
  pocoRankPrizes:Object.freeze([20_000,12_000,8_000]), // só uma edição sazonal
  pocoFloorBands:Object.freeze([300,500,700,1_100,1_600,2_300]),
  dailyBaseByTier:Object.freeze([4_500,5_000,5_500,6_000,6_500]),
  dailyStreakMilestones:Object.freeze({3:500,7:1_000,14:1_500,21:2_000,30:3_000}),
  dailyMissionCash:Object.freeze({
    battle:750,dungeon:1_250,work:750,pet_train:750,
    boss_damage:1_750,raid_damage:1_500,game:750,shop:750,
    legend_raid:2_750
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
  // Orçamentos para 24 horas: a tarifa efetiva exibida é floor(rate * cap_legado / 24).
  // Alterar somente quatro negócios iniciais; cinco superiores permanecem intactos.
  hourlyRates:Object.freeze({
    carrinho_lanche:270,barbearia:450,loja_roupas:600,restaurante:960,
    posto:1_000,mercado:1_500,hotel:2_500,shopping:4_250,tech:7_000
  })
});

/** V2: flash events are open races, not a daily claim reward.
 * Budget is shared by all groups and counted by settlement date in São Paulo.
 * Active unclaimed events reserve capacity; expired events release it.
 */
export const V2_GROUP_FLASH=Object.freeze({
  dailyCashCap:12_000,minCash:300,maxCash:1_000,
  ranges:Object.freeze({
    maleta:Object.freeze([400,850]),
    pix:Object.freeze([600,1000]),
    tesouro:Object.freeze([300,650])
  })
});
export function v2GroupFlashBudgetRemaining(paid,held=0){
  if(!Number.isSafeInteger(paid)||paid<0||!Number.isSafeInteger(held)||held<0)
    throw new RangeError('Orçamento de evento inválido');
  return Math.max(0,V2_GROUP_FLASH.dailyCashCap-paid-held);
}
export function v2GroupFlashCash(type,remaining,roll=Math.random()){
  if(!Number.isSafeInteger(remaining)||remaining<0||!Number.isFinite(roll)||roll<0||roll>=1)
    throw new RangeError('Prêmio de evento inválido');
  if(remaining<V2_GROUP_FLASH.minCash)return 0;
  const range=V2_GROUP_FLASH.ranges[type];
  if(!range)throw new Error('Tipo de evento desconhecido');
  const amount=Math.floor(range[0]+roll*(range[1]-range[0]+1));
  return Math.min(remaining,Math.min(V2_GROUP_FLASH.maxCash,amount));
}

// Limites da roleta V2: conter prêmios desproporcionais sem modificar chances ou V1.
export const V2_ROULETTE=Object.freeze({
  maxRedBlackBet:1_000,maxGreenBet:100,maxRoundsPerHour:20,rollingWindowMs:60*60*1000
});
export function assertV2RouletteBet(amount,choice,{enabled=rebootEconomyEnabled()}={}){
  if(!enabled)return true;
  if(!Number.isSafeInteger(amount)||amount<10)throw new RangeError('Aposta inválida na roleta V2.');
  const max=choice==='verde'?V2_ROULETTE.maxGreenBet:
    ['vermelho','preto'].includes(choice)?V2_ROULETTE.maxRedBlackBet:null;
  if(max===null)throw new Error('Cor inválida.');
  if(amount>max)throw new Error(
    'Roleta V2: aposta máxima de R$ '+max.toLocaleString('pt-BR')+
    ' para '+choice+'. Vermelho/preto até R$ 1.000; verde até R$ 100.'
  );
  return true;
}

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
  return {...base,...patch,...V2_RAID_DIFFICULTY[Number(base.level)]};
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
// O dano deve refletir HP realmente removido, e cura efetivamente realizada.
export function raidV2MeaningfulContribution(p,total,minShare=.02){
 if(!p?.jid||!Number.isFinite(total)||total<=0)return false;
 const damage=Math.max(0,Number(p.damage||0));
 const healing=Math.max(0,Number(p.classHealing||0))+Math.max(0,Number(p.petSkillHealing||0));
 const support=Math.max(0,Number(p.alliedProtection||0))+Math.max(0,Number(p.alliedHealing||0))+Math.max(0,Number(p.curseTeamDamage||0));
 return (damage>0&&damage>=total*minShare)||healing>=Math.max(200,total*.002)||support>=Math.max(200,total*.002);
}
export function raidV2EligibleRewards(players,{enabled=rebootEconomyEnabled()}={}){
 const rows=Array.isArray(players)?players:Object.values(players||{});
 if(!enabled)return rows;
 const total=rows.reduce((sum,p)=>sum+Math.max(0,Number(p.damage||0)),0);
 return rows.filter(p=>raidV2MeaningfulContribution(p,total));
}
export function raid70V2Contributors(players,{level,enabled=rebootEconomyEnabled()}={}){
  if(!enabled||Number(level)!==70)return {valid:true,required:1,contributors:0};
  const participants=Object.values(players||{});
  const total=participants.reduce((a,p)=>a+Math.max(0,Number(p.damage||0)),0);
  // Curadores e defensores contribuem com suporte, sem exigir dano igual ao DPS.
  const qualified=participants.filter(p=>raidV2MeaningfulContribution(p,total,.05));
  const count=new Set(qualified.map(p=>p.jid)).size;
  return {valid:total>0&&count>=3,required:3,contributors:count};
}
// Novo perfil fica desligado por padrão. Exige ativação explícita e corte UTC.
export function businessV3Enabled(env=process.env){
 return rebootEconomyEnabled(env)&&env.ALPHA_BUSINESS_REBALANCE_V3==='on'
}
export function businessV3EffectiveAt(env=process.env){
 if(!businessV3Enabled(env))return null
 const n=Number(env.ALPHA_BUSINESS_V3_EFFECTIVE_AT_UNIX)
 if(!Number.isSafeInteger(n)||n<1700000000||n>2200000000)
   throw Error('Ativação V3 exige ALPHA_BUSINESS_V3_EFFECTIVE_AT_UNIX em segundos UTC válidos.')
 return n
}
export function businessV4Enabled(env=process.env){
 return businessV3Enabled(env)&&env.ALPHA_BUSINESS_REBALANCE_V4==='on'
}
export function businessV4EffectiveAt(env=process.env){
 if(!businessV4Enabled(env))return null
 const oldCutover=businessV3EffectiveAt(env)
 const currentCutover=Number(env.ALPHA_BUSINESS_V4_EFFECTIVE_AT_UNIX)
 if(!Number.isSafeInteger(currentCutover)||currentCutover<oldCutover||
    currentCutover>2200000000)throw Error('V4 exige epoch UTC >= corte V3.')
 return currentCutover
}
export function candidateBusinessCatalog(business,{enabled=rebootEconomyEnabled(),v3=businessV3Enabled(),v4=businessV4Enabled()}={}){
 if(!business)return business;
 if(!enabled)return business;
 if(v4)return businessV4CatalogPatch(business);
 if(v3)return businessV3CatalogPatch(business);
 const hourly=V2_BUSINESS_ECONOMY.hourlyRates[business.id];
 if(!Number.isSafeInteger(hourly)||hourly<0)throw new Error('Negócio sem tarifa V2 aprovada.');
 const capacity=Number(business.capacityHours);
 if(!Number.isSafeInteger(capacity)||capacity<=0||capacity>24)throw Error('Capacidade inválida.');
 return {...business,profitHour:Math.floor(hourly*capacity/24),capacityHours:24};
}
export function businessIntervalGrossV2(business,row,now){
 const legacy=candidateBusinessCatalog(business,{enabled:true,v3:false,v4:false});
 const hourly=legacy?.profitHour,cap=Number(legacy?.capacityHours);
 const end=Number(now),start=Number(row?.last_collected_at??end),level=Number(row?.level||1);
 if(!Number.isSafeInteger(hourly)||!Number.isFinite(cap)||cap<=0||!Number.isFinite(end)||
    !Number.isFinite(start)||!Number.isInteger(level)||level<1||level>5)
    throw new Error('Dados de coleta V2 inválidos.');
 if(businessV4Enabled()){
   const v3=candidateBusinessCatalog(business,{enabled:true,v3:true,v4:false})
   const v4=candidateBusinessCatalog(business,{enabled:true,v3:true,v4:true})
   return businessV4IntervalGross({
     start,now:end,v3EffectiveAt:businessV3EffectiveAt(),
     v4EffectiveAt:businessV4EffectiveAt(),baseHourV2:hourly,
     baseHourV3:v3.profitHour,baseHourV4:v4.profitHour,level,maxHours:cap
   })
 }
 if(businessV3Enabled()){
   const newRate=candidateBusinessCatalog(business,{enabled:true,v3:true,v4:false});
   return businessV3IntervalGross({
     start,now:end,effectiveAt:businessV3EffectiveAt(),baseHourOld:hourly,
     baseHourNew:newRate.profitHour,level,maxHours:cap,
     oldGrowthPercent:Math.round(V2_BUSINESS_ECONOMY.levelBonus*100)
   });
 }
 const seconds=Math.min(Math.max(0,end-start),cap*3600);
 // Inteiros em pontos percentuais: evita perder R$ 1 por erro binário.
 const growthPercent=100+(level-1)*Math.round(V2_BUSINESS_ECONOMY.levelBonus*100);
 return Math.floor(seconds*hourly*growthPercent/(3600*100));
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

// Truncamento líquido único, para não aumentar o lucro dividindo a coleta em parcelas.
export function businessSettlementV2(gross){
 if(!Number.isSafeInteger(gross)||gross<0)throw RangeError('Receita inválida');
 const tax=Math.floor(gross/10),operating=Math.ceil(gross/5)-tax;
 return {gross,tax,operating,net:gross-tax-operating};
}
