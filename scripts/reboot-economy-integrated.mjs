#!/usr/bin/env node
// C4c: integração *estimada* das fontes V2. Pura e reproduzível.
// Nenhum acesso a Postgres, saldo real, jogadores, Render, Aiven ou Neon.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PROFILES,getBusinessVersions,UPGRADE_RATES,forecastBusinessDay} from './reboot-economy-sim.mjs';
import {auditVehicleRoi} from './reboot-vehicle-roi.mjs';
import {V2_EVENT_BUDGET,V2_BUSINESS_ECONOMY} from '../src/neon/reboot-economy-policy.js';
import {careerWorkXp,careerWorkGross} from '../src/neon/reboot-career-policy.js';

// Ações são hipóteses de uso. Não são novo limite no runtime.
export const C4C_WINDOWS=Object.freeze([7,30,60,120]);
export const PLAYER_BEHAVIOR=Object.freeze({
  casual:Object.freeze({work:1,manual:1,mission:1}),
  regular:Object.freeze({work:2,manual:2,mission:2}),
  dedicado:Object.freeze({work:3,manual:4,mission:3}),
  intensivo:Object.freeze({work:4,manual:6,mission:5})
});
export const C4C_ASSUMPTIONS=Object.freeze({
  startingCash:0,startingCareerXp:0,startingCharacterLevel:1,
  reserve:5000,oneInvestmentDecisionPerActiveDay:true,
  collectBusinessOnActiveDaysOnly:true,
  oneCltShiftPerHiredDriverPerActiveDay:true,
  manualVehicleAlsoInCltShift:false,
  consumptionPerActiveDay:1000,
  characterXpAndCombatDropsNotSimulated:true,
  investmentSaleValuation:'70% do preço de compra para carros e motos; negócio a custo histórico, sem garantia de liquidez'
});
export const INVESTMENT_SEQUENCE=Object.freeze([
  Object.freeze({type:'vehicle',mode:'ifood',id:'bicicleta'}),
  Object.freeze({type:'business',id:'carrinho_lanche'}),
  Object.freeze({type:'vehicle',mode:'ifood',id:'moto_125'}),
  Object.freeze({type:'driver',mode:'ifood',id:'comum',vehicleId:'bicicleta'}),
  Object.freeze({type:'vehicle',mode:'uber',id:'popular'}),
  Object.freeze({type:'business',id:'barbearia'}),
  Object.freeze({type:'driver',mode:'uber',id:'comum',vehicleId:'popular'}),
  Object.freeze({type:'vehicle',mode:'uber',id:'sedan_esportivo'}),
  Object.freeze({type:'business',id:'loja_roupas'}),
  Object.freeze({type:'business',id:'restaurante'}),
  Object.freeze({type:'vehicle',mode:'ifood',id:'moto_160'}),
  Object.freeze({type:'business',id:'posto'}),
  Object.freeze({type:'business',id:'mercado'}),
  Object.freeze({type:'business',id:'hotel'}),
  Object.freeze({type:'business',id:'shopping'}),
  Object.freeze({type:'business',id:'tech'})
]);
// C4c histórico permanece reproduzível: não mistura o baseline com a política atual.
const C4C_BASELINE_BUDGET=Object.freeze({dailyBaseByTier:Object.freeze([2000,3000,4500,6000,8000]),dailyMissionCash:Object.freeze({battle:3000,dungeon:4000,work:3000,pet_train:3000,boss_damage:5000,raid_damage:4500,game:3000,shop:3000,legend_raid:7000})});
const money=x=>Math.floor(x);
const sum=(a,b)=>a+b;
export function extractCareerRanks(dbSource){
  const raw=String(dbSource||'').match(/const CAREER_RANKS=\[([\s\S]*?)\n\]/)?.[1];
  if(!raw)throw Error('Tabela de carreira não encontrada');
  const ranks=[...raw.matchAll(/\{name:'([^']+)',xp:(\d+),mult:([\d.]+)\}/g)]
    .map(m=>({name:m[1],xp:Number(m[2]),mult:Number(m[3])}));
  if(ranks.length!==9||ranks[0].xp!==0||ranks.at(-1).name!=='CEO'||
     ranks.some((r,i)=>i>0&&r.xp<=ranks[i-1].xp))
    throw Error('Carreira alterada: recalibrar a simulação');
  return ranks;
}
function targetProduct(row,businesses,vehicles){
  if(row.type==='business')return businesses.find(x=>x.id===row.id);
  if(row.type==='vehicle')return (row.mode==='uber'?vehicles.cars:vehicles.motorcycles).find(x=>x.id===row.id);
  if(row.type==='driver'){
    const vehicle=(row.mode==='uber'?vehicles.cars:vehicles.motorcycles).find(x=>x.id===row.vehicleId);
    const matched=vehicle?.clt.find(x=>x.driverId===row.id);
    if(!matched)throw Error('Motorista sem veículo e projeção');
    // Contratação é gasto irrecuperável; não é ativo revendável.
    return {price:matched.combinedCapital-vehicle.price};
  }
  return null;
}
export function buildIntegratedInputs(progressionSource,dbSource,{currentV2Prices=false}={}){
  const original=getBusinessVersions(progressionSource).proposed;
  const biz=currentV2Prices?original.map(b=>({...b,profitHour:V2_BUSINESS_ECONOMY.hourlyRates[b.id]})):original;
  const eventBudget=currentV2Prices?V2_EVENT_BUDGET:C4C_BASELINE_BUDGET;
  const cars=auditVehicleRoi(progressionSource,{currentV2Prices});
  const ranks=extractCareerRanks(dbSource);
  for(const b of biz)
    if(!Number.isSafeInteger(b.profitHour)||b.profitHour<=0)
      throw Error('Tabelas de lucro divergem; não simular valores incompatíveis');
  for(const entry of INVESTMENT_SEQUENCE){
    if(!targetProduct(entry,biz,cars))throw Error('Investimento sem catálogo '+entry.id);
  }
  return {businesses:biz,vehicles:cars,ranks,eventBudget,includeStreak:currentV2Prices};
}
function eligibleManualVehicles(ownedVehicles,hired,kind){
  const busy=new Set(hired.filter(x=>x.mode===kind).map(x=>x.vehicleId));
  return ownedVehicles.filter(x=>x.mode===kind&&!busy.has(x.id));
}
function chooseManual(ownedVehicles,hired){
  const choices=['uber','ifood'].flatMap(mode=>
    eligibleManualVehicles(ownedVehicles,hired,mode).map(x=>({mode,
      id:x.id,net:x.manual[0].netPerAction})));
  choices.sort((a,b)=>b.net-a.net||a.mode.localeCompare(b.mode)||a.id.localeCompare(b.id));
  return choices[0]||null;
}
function maybeInvest({day,cash,step,businesses,vehicles,ranks,ownedBusiness,ownedVehicle,hired}){
  const candidate=INVESTMENT_SEQUENCE[step];
  const product=candidate?targetProduct(candidate,businesses,vehicles):null;
  let currentCash=cash,decision=null,nextStep=step;
  if(candidate&&product&&currentCash>=product.price+C4C_ASSUMPTIONS.reserve){
    if(candidate.type==='driver'&&!ownedVehicle.some(v=>v.id===candidate.vehicleId&&v.mode===candidate.mode))
      throw Error('Tentativa de CLT sem veículo');
    currentCash-=product.price;
    if(candidate.type==='business')ownedBusiness.push({
      business:product,level:1,collectedAt:day,capital:product.price
    });
    if(candidate.type==='vehicle')ownedVehicle.push({
      ...product,mode:candidate.mode,capital:product.price
    });
    if(candidate.type==='driver')hired.push({
      mode:candidate.mode,id:candidate.id,vehicleId:candidate.vehicleId,
      paid:product.price,shiftNet:(candidate.mode==='uber'?vehicles.cars:vehicles.motorcycles)
        .find(x=>x.id===candidate.vehicleId).clt.find(x=>x.driverId===candidate.id).shiftNet
    });
    decision={type:candidate.type,id:candidate.id,paid:product.price};
    nextStep++;
  }else if(ownedBusiness.length){
    const upgrades=ownedBusiness.filter(x=>x.level<5).map(row=>{
      const cost=money(row.business.price*UPGRADE_RATES[row.level-1]);
      const before=forecastBusinessDay(row.business,row.level,'proposed').net;
      const after=forecastBusinessDay(row.business,row.level+1,'proposed').net;
      return {row,cost,paybackDays:cost/Math.max(1,after-before)};
    }).filter(x=>x.paybackDays<=30&&currentCash>=x.cost+C4C_ASSUMPTIONS.reserve)
      .sort((a,b)=>a.paybackDays-b.paybackDays||a.cost-b.cost);
    if(upgrades.length){
      const x=upgrades[0];currentCash-=x.cost;x.row.level++;x.row.capital+=x.cost;
      decision={type:'upgrade',id:x.row.business.id,paid:x.cost};
    }
  }
  return {cash:currentCash,nextStep,decision};
}
export function simulateIntegrated(profile,days,inputs,{
  strategy='invest',characterLevel=1,dailyExtraCash={}
}={}){
  if(!PROFILES.some(p=>p.id===profile?.id)||!PLAYER_BEHAVIOR[profile.id])
    throw TypeError('Perfil desconhecido');
  if(!C4C_WINDOWS.includes(days))throw RangeError('Horizonte não autorizado');
  if(!['invest','cash_only'].includes(strategy))throw RangeError('Estratégia inválida');
  if(!Number.isSafeInteger(characterLevel)||characterLevel<1)
    throw RangeError('Nível inválido');
  const actions=PLAYER_BEHAVIOR[profile.id],{businesses,vehicles,ranks,eventBudget=C4C_BASELINE_BUDGET,includeStreak=false}=inputs;
  const ownedBusiness=[],ownedVehicle=[],hired=[];
  let streak=0,lastDay=0,lastProtection=-100,streakCash=0,extraCash=0,cash=0,careerXp=0,careerRank='Ajudante',step=0,workNet=0,missionNet=0,
    manualNet=0,cltNet=0,businessNet=0,consumableSpent=0,capitalPaid=0,
    businessTax=0,businessOperating=0,workTax=0,activeDays=0,workShifts=0;
  const picks=[];
  for(let day=1;day<=days;day++){
    const extra=dailyExtraCash[day]??0;
    if(!Number.isSafeInteger(extra)||extra<0)throw RangeError('Prêmio hipotético inválido');
    cash+=extra;extraCash+=extra;
    if((day-1)%7>=profile.daysPerWeek)continue;
    activeDays++;
    for(const row of ownedBusiness){
      const elapsedHours=Math.min(row.business.capacityHours,24*(day-row.collectedAt));
      const gross=money(row.business.profitHour*elapsedHours*
        (1+(row.level-1)*V2_BUSINESS_ECONOMY.levelBonus));
      const tax=money(gross*.10),operating=money(gross*.10);
      const net=gross-tax-operating;
      cash+=net;businessNet+=net;businessTax+=tax;businessOperating+=operating;
      row.collectedAt=day;
    }
    // Cenário pessimista: não fingir que missões difíceis foram completadas.
    const missionCash=Object.entries(eventBudget.dailyMissionCash)
      .filter(([id])=>id!=='legend_raid').map(([,v])=>v).sort((a,b)=>a-b).slice(0,actions.mission).reduce(sum,0);
    const tier=characterLevel>=200?4:characterLevel>=150?3:characterLevel>=100?2:characterLevel>=50?1:0;
    const dayClaim=eventBudget.dailyBaseByTier[includeStreak?tier:0];
    const diff=day-lastDay;
    const protectedGap=diff===2&&day-lastProtection>=30;
    if(protectedGap)lastProtection=day;
    streak=lastDay&&(diff===1||protectedGap)?streak+1:1;lastDay=day;
    const streakBonus=includeStreak?(eventBudget.dailyStreakMilestones[((streak-1)%30)+1]||0):0;
    streakCash+=streakBonus;
    const missionAmount=dayClaim+missionCash+streakBonus;
    missionNet+=missionAmount;cash+=missionAmount;
    for(let j=0;j<actions.work;j++){
      const xpGain=careerWorkXp(.5,{enabled:true});
      careerXp+=xpGain;workShifts++;
      const rank=[...ranks].reverse().find(x=>careerXp>=x.xp)||ranks[0];
      careerRank=rank.name;
      const gross=careerWorkGross({level:characterLevel,legacyPayCap:1500,
        careerMultiplier:rank.mult,enabled:true});
      const tax=money(gross*.10),net=gross-tax;
      workTax+=tax;workNet+=net;cash+=net;
    }
    for(const driver of hired){cash+=driver.shiftNet;cltNet+=driver.shiftNet;}
    const manual=chooseManual(ownedVehicle,hired);
    if(manual){
      const value=actions.manual*manual.net;
      cash+=value;manualNet+=value;
    }
    // Consumo de cura/equipamento: premissa exógena; nunca saldo negativo.
    const drain=Math.min(cash,C4C_ASSUMPTIONS.consumptionPerActiveDay);
    cash-=drain;consumableSpent+=drain;
    if(strategy==='invest'){
      const r=maybeInvest({day,cash,step,businesses,vehicles,ranks,
        ownedBusiness,ownedVehicle,hired});
      cash=r.cash;step=r.nextStep;
      if(r.decision){picks.push({day,...r.decision});capitalPaid+=r.decision.paid;}
    }
    if(cash<0)throw Error('Saldo negativo: cenário inválido');
  }
  const generated=workNet+missionNet+manualNet+cltNet+businessNet+extraCash;
  const businessBook=ownedBusiness.reduce((a,b)=>a+b.capital,0);
  const vehicleBook=ownedVehicle.reduce((a,b)=>a+b.capital,0);
  const driverHiring=hired.reduce((a,b)=>a+b.paid,0);
  const residualVehicleValue=ownedVehicle.reduce((a,b)=>a+money(b.capital*.70),0);
  const totalAssetsBook=businessBook+vehicleBook;
  const netWorthAtResaleAssumption=cash+businessBook+residualVehicleValue;
  return {profile:profile.id,days,characterLevelAssumed:characterLevel,
    strategy,activeDays,minutesPerActiveDay:profile.minutes,
    careerXp,careerRank,workShifts,
    cash,ownedBusinesses:ownedBusiness.length,vehicles:ownedVehicle.length,drivers:hired.length,
    businessLevels:ownedBusiness.map(r=>({id:r.business.id,level:r.level})),
    vehicleIds:ownedVehicle.map(r=>r.id),driverAssignments:hired.map(r=>({mode:r.mode,id:r.id,vehicleId:r.vehicleId})),
    workNet,missionNet,manualNet,cltNet,businessNet,businessTax,businessOperating,workTax,
    extraCash,streakCash,consumableSpent,capitalPaid,businessBook,vehicleBook,driverHiring,
    residualVehicleValue,netWorthAtResaleAssumption,totalAssetsBook,
    netGenerated:generated-consumableSpent,
    accountingBalanced:generated-consumableSpent===cash+capitalPaid,
    purchases:picks};
}

export function assessIntegratedRisks(rows){
 const thresholds=Object.freeze({
  maxSuggestedWealthRatio:6,
  maxSuggestedBusinessCashShare:.70,
  minSuggestedLiquidityFraction:.03
 });
 const checks=C4C_WINDOWS.map(days=>{
  const day=rows.filter(x=>x.days===days);
  if(day.length!==PROFILES.length)throw Error('Perfil ausente na auditoria de risco');
  const sorted=[...day].sort((a,b)=>a.invested.netWorthAtResaleAssumption-
    b.invested.netWorthAtResaleAssumption);
  const smallest=sorted[0],largest=sorted.at(-1);
  const wealthRatio=largest.invested.netWorthAtResaleAssumption/
    Math.max(1,smallest.invested.netWorthAtResaleAssumption);
  const greatestBusinessShare=Math.max(...day.map(row=>{
    const x=row.invested;
    const earned=x.workNet+x.missionNet+x.manualNet+x.cltNet+x.businessNet+x.extraCash;
    return x.businessNet/Math.max(1,earned);
  }));
  const leastLiquid=[...day].sort((a,b)=>
    a.invested.cash/Math.max(1,a.invested.netWorthAtResaleAssumption)-
    b.invested.cash/Math.max(1,b.invested.netWorthAtResaleAssumption))[0];
  const leastLiquidityFraction=leastLiquid.invested.cash/
    Math.max(1,leastLiquid.invested.netWorthAtResaleAssumption);
  const warnings=[];
  if(wealthRatio>thresholds.maxSuggestedWealthRatio)warnings.push('wealth_inequality');
  if(greatestBusinessShare>thresholds.maxSuggestedBusinessCashShare)warnings.push('business_dominance');
  if(leastLiquidityFraction<thresholds.minSuggestedLiquidityFraction)warnings.push('low_liquidity');
  return {days,wealthRatio:Number(wealthRatio.toFixed(2)),
    lowestWealthProfile:smallest.profile,highestWealthProfile:largest.profile,
    largestBusinessIncomeShare:Number(greatestBusinessShare.toFixed(3)),
    leastLiquidProfile:leastLiquid.profile,
    minimumLiquidityShare:Number(leastLiquidityFraction.toFixed(4)),
    warnings};
 });
 return {thresholds,checks,
  warning:'Limiares de análise propostos, NÃO política aplicada e NÃO garantia de equilíbrio.'};
}

export function integratedEconomyReport(progressionSource,dbSource){
  const inputs=buildIntegratedInputs(progressionSource,dbSource);
  const rows=PROFILES.flatMap(profile=>C4C_WINDOWS.map(days=>({
    profile:profile.id,days,
    invested:simulateIntegrated(profile,days,inputs),
    cashOnly:simulateIntegrated(profile,days,inputs,{strategy:'cash_only'}),
    level50Sensitivity:simulateIntegrated(profile,days,inputs,
      {strategy:'invest',characterLevel:50})
  })));
  return {readOnly:true,liveAccountsUsed:false,initialState:{cash:0,careerXp:0,
    characterLevel:1,vehicles:0,staff:0,businesses:0},
    classLevelCurveVerified:false,stage:'C4c_simulation_only',profiles:rows,
    caveat:'Nível 1 fixo é cenário conservador; nível 50 desde o primeiro dia é SENSIBILIDADE, não progressão observada.',
    eventsIncluded:false,raidAndBossIncluded:false,gtIncluded:false,
    manualCarFleetMaxModeledPerCommand:1,
    driverAndManualSameVehicleDoubleCounted:false,
    plannedInvestmentSequence:INVESTMENT_SEQUENCE,
    riskSignals:assessIntegratedRisks(rows)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const progression=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
 const data=integratedEconomyReport(progression,db);
 if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(data,null,2)+'\n');
 else{
  process.stdout.write('ECONOMIA C4c: CARREIRA + TRANSPORTE + CLT + NEGÓCIOS (OFFLINE)\n');
  for(const r of data.profiles){
   process.stdout.write(r.profile+' '+r.days+'d: investe R$ '+
     r.invested.cash.toLocaleString('pt-BR')+
     ', patrimônio estimado R$ '+r.invested.netWorthAtResaleAssumption.toLocaleString('pt-BR')+
     ', trabalho R$ '+r.invested.workNet.toLocaleString('pt-BR')+
     ', renda CLT R$ '+r.invested.cltNet.toLocaleString('pt-BR')+
     ', negócios R$ '+r.invested.businessNet.toLocaleString('pt-BR')+
     ', compras '+r.invested.purchases.length+'\n');
  }
 }
}
