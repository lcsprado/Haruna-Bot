#!/usr/bin/env node
// C4d — teste adverso reproduzível, sem banco, login, rede ou saldos reais.
// Separa emissão de eventos, frota PRÉ-FINANCIADA e análise de Raid 70.
// Não modifica pagamentos ou regras de produção.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PROFILES} from './reboot-economy-sim.mjs';
import {C4C_WINDOWS,PLAYER_BEHAVIOR,buildIntegratedInputs,
  simulateIntegrated} from './reboot-economy-integrated.mjs';
import {V2_EVENT_BUDGET,V2_RAID_LEVELS,raid70V2Policy,raidCashSharesV2} from '../src/neon/reboot-economy-policy.js';
import {V2_TRANSPORT} from '../src/neon/reboot-transport-policy.js';

const RANKED=Object.freeze(['intensivo','dedicado','regular','casual']);
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const rankedIds=ids=>RANKED.filter(id=>ids.includes(id));

export function allocatePoolByWeights(pool,ids,weights){
  if(!Number.isSafeInteger(pool)||pool<0)throw RangeError('Orçamento inválido');
  if(!Array.isArray(ids)||!Array.isArray(weights)||ids.length!==weights.length||
     ids.some(id=>!RANKED.includes(id))||new Set(ids).size!==ids.length||
     weights.some(w=>!Number.isSafeInteger(w)||w<=0))
    throw RangeError('Participantes ou pesos inválidos');
  if(!ids.length)return [];
  const total=sum(weights);
  const amounts=weights.map(weight=>Math.floor(pool*weight/total));
  let remaining=pool-sum(amounts);
  const order=weights.map((weight,i)=>({i,rest:pool*weight/total-amounts[i]}))
    .sort((a,b)=>b.rest-a.rest||a.i-b.i);
  for(let i=0;i<remaining;i++)amounts[order[i%order.length].i]++;
  return ids.map((id,i)=>({id,amount:amounts[i]}));
}
function activeProfiles(day){
  return PROFILES.filter(p=>(day-1)%7<p.daysPerWeek).map(p=>p.id);
}
// TODOS os prêmios aqui são upper bound condicionais, não elegibilidade comprovada.
// Os quatro limpam o Poço uma vez no dia 60 somente por hipótese adversa.
export function eventPressure(days,{pocoClearedAtDay=60}={}){
  if(!C4C_WINDOWS.includes(days))throw RangeError('Horizonte inválido');
  if(!Number.isSafeInteger(pocoClearedAtDay)||pocoClearedAtDay<1)
    throw RangeError('Dia de conclusão do Poço inválido');
  const paid=Object.fromEntries(RANKED.map(id=>[id,{
    gtHeat:0,gtWeekly:0,weeklyBoss:0,pocoRanking:0,pocoFloors:0
  }]));
  const sources={gtHeat:0,gtWeekly:0,weeklyBoss:0,pocoRanking:0,pocoFloors:0};
  let completedWeeks=0,gtHeatDays=0,pocoCount=0;
  const grant=(id,key,value)=>{
    if(!Number.isSafeInteger(value)||value<0)throw Error('Pagamento inválido');
    paid[id][key]+=value;sources[key]+=value;
  };
  for(let day=1;day<=days;day++){
    const eligible=rankedIds(activeProfiles(day));
    if(eligible.length){
      gtHeatDays++;
      for(let heat=0;heat<3;heat++){
        eligible.slice(0,5).forEach((id,rank)=>
          grant(id,'gtHeat',V2_EVENT_BUDGET.gtHeatPrizes[rank]));
      }
    }
    if(day%7===0){
      completedWeeks++;
      // Quatro pilotos elegíveis a prêmios semanais é hipótese máxima.
      RANKED.slice(0,4).forEach((id,rank)=>grant(id,'gtWeekly',
        V2_EVENT_BUDGET.gtWeeklyPrizes[rank]));
      const boss=allocatePoolByWeights(V2_EVENT_BUDGET.weeklyBossPool,RANKED,[4,3,2,1]);
      for(const row of boss)grant(row.id,'weeklyBoss',row.amount);
    }
    if(day===pocoClearedAtDay){
      pocoCount++;
      RANKED.slice(0,V2_EVENT_BUDGET.pocoRankPrizes.length)
        .forEach((id,rank)=>grant(id,'pocoRanking',V2_EVENT_BUDGET.pocoRankPrizes[rank]));
      const floorCash=5*sum(V2_EVENT_BUDGET.pocoFloorBands);
      RANKED.forEach(id=>grant(id,'pocoFloors',floorCash));
    }
  }
  const players=RANKED.map(id=>({id,...paid[id],total:sum(Object.values(paid[id]))}));
  return {days,players,sources,groupTotal:sum(Object.values(sources)),
    reconciled:sum(players.map(row=>row.total))===sum(Object.values(sources)),
    completedWeeks,gtHeatDays,pocoCount,
    caveat:'Teto teórico de pagamentos condicionais. GT pressupõe participações nos dias ativos; Boss e GT semanal pressupõem elegibilidade. Poço no dia 60 e quatro conclusões são hipóteses, NÃO disponibilidade ou progressão comprovada.'};
}
const DRIVERS=Object.freeze({
  uber:Object.freeze(['executivo','experiente','comum']),
  ifood:Object.freeze(['premium','experiente','comum'])
});
export function fundedFleetForMode(rows,mode){
  if(!['uber','ifood'].includes(mode)||!Array.isArray(rows)||rows.length<5)
    throw RangeError('Catálogo de frota insuficiente');
  const remaining=[...rows],drivers=[],manual=[];
  for(const type of DRIVERS[mode]){
    const eligible=remaining.map(vehicle=>({vehicle,
      spec:vehicle.clt.find(x=>x.driverId===type)})).filter(x=>x.spec)
      .sort((a,b)=>b.spec.shiftNet-a.spec.shiftNet||
        a.vehicle.id.localeCompare(b.vehicle.id));
    if(!eligible.length)throw Error('Tipo CLT sem veículo elegível');
    const candidate=eligible[0];
    remaining.splice(remaining.findIndex(x=>x.id===candidate.vehicle.id),1);
    const staffCost=candidate.spec.combinedCapital-candidate.vehicle.price;
    if(staffCost<0)throw Error('Preço de contratação incorreto');
    drivers.push({id:candidate.vehicle.id,type,vehiclePrice:candidate.vehicle.price,
      hiredPrice:staffCost,shiftNet:candidate.spec.shiftNet});
  }
  remaining.sort((a,b)=>b.price-a.price||a.id.localeCompare(b.id));
  manual.push(...remaining.slice(0,V2_TRANSPORT.maxManualPaidVehicles).map(x=>({
    id:x.id,price:x.price,netPerAction:x.manual[0].netPerAction
  })));
  if(manual.length!==2||drivers.length!==3||
     new Set([...manual.map(x=>x.id),...drivers.map(x=>x.id)]).size!==5)
    throw Error('Veículo faturando em CLT e manual simultaneamente');
  return {mode,drivers,manual,shiftNet:sum(drivers.map(x=>x.shiftNet)),
    manualNetPerCommand:sum(manual.map(x=>x.netPerAction)),
    upfrontCapital:sum(drivers.map(x=>x.vehiclePrice+x.hiredPrice))+
      sum(manual.map(x=>x.price))};
}
// Uma frota completa NÃO existe no cenário de personagens com saldo inicial zero.
// Esta sensibilidade só vale se alguém tiver capital suficiente antes do dia 1.
export function prefundedFleetUpperBound(profile,days,inputs){
  if(!PROFILES.some(p=>p.id===profile?.id)||!C4C_WINDOWS.includes(days))
    throw RangeError('Cenário de frota inválido');
  const uber=fundedFleetForMode(inputs.vehicles.cars,'uber');
  const ifood=fundedFleetForMode(inputs.vehicles.motorcycles,'ifood');
  const activeDays=Array.from({length:days},(_,i)=>i+1)
    .filter(day=>(day-1)%7<profile.daysPerWeek).length;
  const actions=PLAYER_BEHAVIOR[profile.id].manual;
  const minutesRequired=actions*(9+6); // 1 ação manual em cada serviço por ciclo.
  if(minutesRequired>profile.minutes)throw Error('Mais ações do que o tempo diário permite');
  const cltNetDaily=uber.shiftNet+ifood.shiftNet;
  const manualNetDaily=actions*(uber.manualNetPerCommand+ifood.manualNetPerCommand);
  const capitalRequired=uber.upfrontCapital+ifood.upfrontCapital;
  const operatingDaysToPayback=cltNetDaily+manualNetDaily>0
    ?Math.ceil(capitalRequired/(cltNetDaily+manualNetDaily)):null;
  return {profile:profile.id,days,activeDays,upfrontCapital:capitalRequired,
    vehiclesOwned:10,cltDrivers:6,manualVehiclesPerService:2,
    manualTimeMinutesPerActiveDay:minutesRequired,
    cltNetDaily,manualNetDaily,earnedWithoutCapitalRecovery:
      activeDays*(cltNetDaily+manualNetDaily),
    netAfterUpfrontInvestment:activeDays*(cltNetDaily+manualNetDaily)-capitalRequired,
    operatingDaysToPayback,uber,ifood,
    caveat:'Frota de 10 veículos e seis contratados totalmente pré-financiada antes do dia 1. Não simular riqueza saindo de R$ 0.'};
}
export function raid70V2EmissionEstimate(partySize){
  if(!Number.isSafeInteger(partySize)||partySize<1||partySize>5)
    throw RangeError('Tamanho de grupo fora do ensaio');
  const cfg=V2_RAID_LEVELS[70],p=raid70V2Policy(70,{enabled:true});
  if(partySize<p.minPlayers)return {partySize,canStart:false,
    minPlayers:p.minPlayers,minLevel:p.minLevel,
    raidLoteAllowed:false,cashAwarded:0,keysConsumed:0,netBeforeConsumables:0};
  const members=Array.from({length:partySize},(_,i)=>({jid:'p'+i,damage:1000}));
  const distribution=raidCashSharesV2(cfg,members,{enabled:true});
  const cashAwarded=distribution.awarded,keysConsumed=distribution.keyReimbursements;
  return {partySize,canStart:true,minPlayers:p.minPlayers,minLevel:p.minLevel,
    raidLoteAllowed:false,nominalCashPool:cfg.cashPool,
    keyPrice:cfg.keyPrice,perPlayerCash:distribution.payouts.get('p0'),
    cashAwarded,keysConsumed,netBeforeConsumables:distribution.bonusBudget,
    cappedNetNewMoney:distribution.bonusBudget,
    exceedsNominalCashPool:cashAwarded>cfg.cashPool,
    caveat:'Vitória hipotética sem consumíveis ou drops. Só o bônus coletivo 12% é dinheiro novo; reembolso de chaves não é lucro.'};
}
export function stressEconomyReport(progressionSource,dbSource){
  const inputs=buildIntegratedInputs(progressionSource,dbSource);
  const rows=C4C_WINDOWS.map(days=>{
    const events=eventPressure(days);
    const players=PROFILES.map(profile=>{
      const baseline=simulateIntegrated(profile,days,inputs);
      const eventRow=events.players.find(x=>x.id===profile.id);
      return {profile:profile.id,baseCash:baseline.cash,
        baseWealth:baseline.netWorthAtResaleAssumption,
        eventCash:eventRow.total,
        cashHoldingEventRewards:baseline.cash+eventRow.total,
        wealthHoldingEventRewards:baseline.netWorthAtResaleAssumption+eventRow.total,
        baselineBusinessNet:baseline.businessNet,
        prefundedFleet:prefundedFleetUpperBound(profile,days,inputs)};
    });
    const totalBaseWealth=sum(players.map(x=>x.baseWealth));
    const totalWithEvents=sum(players.map(x=>x.wealthHoldingEventRewards));
    return {days,players,eventBudget:events,
      totalBaseWealth,totalWithEvents,
      portfolioPlusEventReconciled:totalWithEvents-totalBaseWealth===events.groupTotal,
      eventShareOfIncrementalWealth:Number((events.groupTotal/Math.max(1,totalWithEvents)).toFixed(4)),
      fullFleetCapitalIsNotStartingMoney:true,
      directEventsReinvested:false};
  });
  return {readOnly:true,liveAccountOrHistoryUsed:false,mode:'conditional_max_pressure_not_forecast',
    freshStartingCash:0,eventsNotGuaranteed:true,eventsReinvested:false,
    seasonalPocoOnlyOnce:true,
    maxManualPaidVehicles:V2_TRANSPORT.maxManualPaidVehicles,
    maxDriversPerMode:3,rows,
    raid70:[1,2,3,4,5].map(raid70V2EmissionEstimate),
    caveats:[
      'Frota integral é ensaio pré-financiado separado, não pode surgir da carteira R$0.',
      'Premiações só são creditadas na simulação como caixa reservado, sem reinvestimento posterior.',
      'Poço completo no dia 60 por quatro pessoas é hipótese de estresse e pode ser impossível na prática.',
      'Não contabiliza outros eventos, bingões, leilões, despesas de reparo, morte ou drops de poder.',
      'Experiência de personagem e aptidão para Raid 70 NÃO são inferidas do saldo ou EXP profissional.'
    ]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const progression=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  const r=stressEconomyReport(progression,db);
  if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(r,null,2)+'\n');
  else{
    process.stdout.write('C4d - ESTRESSE CONDICIONAL: EVENTOS + FROTA PRÉ-FINANCIADA + RAID 70\n');
    for(const row of r.rows){
      process.stdout.write(row.days+' dias: quatro jogadores: base R$ '+
        row.totalBaseWealth.toLocaleString('pt-BR')+', com eventos R$ '+
        row.totalWithEvents.toLocaleString('pt-BR')+', emissão extra R$ '+
        row.eventBudget.groupTotal.toLocaleString('pt-BR')+
        ', ciclos Boss/GT semanais '+row.eventBudget.completedWeeks+
        ', Poço '+row.eventBudget.pocoCount+'\n');
    }
    const longest=r.rows.find(x=>x.days===120);
    for(const person of longest.players){
      const fleet=person.prefundedFleet;
      process.stdout.write('Frota pré-financiada '+person.profile+': capital R$ '+
        fleet.upfrontCapital.toLocaleString('pt-BR')+
        ', rendimento líquido por dia ativo R$ '+
        (fleet.cltNetDaily+fleet.manualNetDaily).toLocaleString('pt-BR')+
        ', retorno '+fleet.operatingDaysToPayback+' dias ativos; capital NÃO parte de R$0\n');
    }
    for(const x of r.raid70)if(x.canStart)process.stdout.write(
      'Raid70 '+x.partySize+' jogadores: prêmio R$ '+x.cashAwarded.toLocaleString('pt-BR')+
      ', chaves R$ '+x.keysConsumed.toLocaleString('pt-BR')+
      ', lucro bruto grupo R$ '+x.netBeforeConsumables.toLocaleString('pt-BR')+'\n');
  }
}
