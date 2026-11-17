#!/usr/bin/env node
// Economia 2.0 — modelo DETERMINÍSTICO de decisão, sem conexão com Postgres.
// Não altera BUSINESSES, raids, XP, carteira, scripts de produção ou env.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractBusinessCatalog} from './reboot-economy-baseline.mjs';

export const PROFILES=Object.freeze([
  Object.freeze({id:'casual',name:'Casual',minutes:20,daysPerWeek:5}),
  Object.freeze({id:'regular',name:'Regular',minutes:45,daysPerWeek:6}),
  Object.freeze({id:'dedicado',name:'Dedicado',minutes:90,daysPerWeek:7}),
  Object.freeze({id:'intensivo',name:'Intensivo',minutes:180,daysPerWeek:7})
]);
export const WINDOWS=Object.freeze([7,30,60]);

// PROPOSTA, NÃO APROVADA: renda menor nos 9 negócios, sem remover o catálogo.
// Manter preços existentes para que a mudança possa ser simulada isoladamente.
export const PROPOSED_HOURLY_RATES=Object.freeze({
  carrinho_lanche:160,barbearia:400,loja_roupas:900,restaurante:1700,
  posto:3000,mercado:4500,hotel:8000,shopping:14000,tech:27000
});
export const UPGRADE_RATES=Object.freeze([.20,.30,.40,.50]);
const NON_BUSINESS_ASSUMPTIONS=Object.freeze({
  dailyMissionCash:12000,
  dailyMissionXp:700,
  gameplaySpendingFraction:.25, // hipotético: poções, forja, manutenção, etc.
  candidateBusinessOperatingFraction:.10,
  businessTaxFraction:.10,
  reserveCash:5000
});
export {NON_BUSINESS_ASSUMPTIONS};

// Valor PROJETADO de atividades, não tabelas de recompensa do bot atual.
// Diminuição do retorno marginal para não premiar 3 horas linearmente.
// A distribuição real por missão/Boss/Raid/GT fica para a etapa seguinte.
export function marginalReward(minutes,segments){
  if(!Number.isInteger(minutes)||minutes<0||minutes>24*60)throw new RangeError('Tempo de sessão inválido');
  let left=minutes,total=0;
  for(const [maxMinutes,perMinute] of segments){
    const chunk=Math.min(left,maxMinutes);
    total+=chunk*perMinute;
    left-=chunk;
    if(left<=0)break;
  }
  return Math.floor(total);
}
export function activityForecast(minutes){
  const cash=NON_BUSINESS_ASSUMPTIONS.dailyMissionCash+
    marginalReward(minutes,[[20,850],[40,360],[60,140],[Infinity,70]]);
  const xp=NON_BUSINESS_ASSUMPTIONS.dailyMissionXp+
    marginalReward(minutes,[[20,40],[40,16],[60,6],[Infinity,2]]);
  const spending=Math.floor(cash*NON_BUSINESS_ASSUMPTIONS.gameplaySpendingFraction);
  return {grossCash:cash,spending,netCash:cash-spending,xp};
}
export function getBusinessVersions(source){
  const catalog=extractBusinessCatalog(source);
  const names=catalog.map(x=>x.id).sort();
  const planned=Object.keys(PROPOSED_HOURLY_RATES).sort();
  if(JSON.stringify(names)!==JSON.stringify(planned))
    throw new Error('Catálogo alterado: revisão de balanceamento obrigatória.');
  return Object.freeze({
    current:catalog.map(x=>({...x})),
    proposed:catalog.map(x=>({...x,profitHour:PROPOSED_HOURLY_RATES[x.id]}))
  });
}
export function forecastBusinessDay(business,level,version='proposed'){
  if(!['current','proposed'].includes(version))throw new RangeError('Cenário desconhecido');
  if(!Number.isInteger(level)||level<1||level>5)throw new RangeError('Nível de negócio inválido');
  const hours=Math.min(24,business.capacityHours+(version==='current'?level-1:0));
  const multiplier=1+(level-1)*(version==='current'?.25:.10);
  const gross=Math.floor(business.profitHour*hours*multiplier);
  const tax=Math.floor(gross*NON_BUSINESS_ASSUMPTIONS.businessTaxFraction);
  const operating=version==='proposed'?
    Math.floor(gross*NON_BUSINESS_ASSUMPTIONS.candidateBusinessOperatingFraction):0;
  return {gross,tax,operating,net:gross-tax-operating,hours};
}
export function extractRaidPoolCatalog(source){
  const section=String(source||'');
  const start=section.indexOf('const RAID_CONFIGS=[');
  if(start<0)throw new Error('Configuração RAID_CONFIGS ausente.');
  const end=section.indexOf('\n]',start);
  if(end<start)throw new Error('Término de RAID_CONFIGS ausente.');
  const rows=[...section.slice(start,end).matchAll(
    /\{level:(\d+),name:'([^']+)'[^\n]*?keyPrice:(\d+),cashPool:(\d+),xpPool:(\d+)/g
  )].map(m=>({
    level:Number(m[1]),name:m[2],keyPrice:Number(m[3]),
    cashPool:Number(m[4]),xpPool:Number(m[5])
  }));
  if(rows.length<10||!rows.some(r=>r.level===75))throw new Error('Raid alterada; revisar pools.');
  return rows;
}
export function raidPoolBaseline(source){
  const raids=extractRaidPoolCatalog(source);
  return {
    current:raids,
    proposedEligible:raids.filter(r=>r.level!==75),
    excludedLevel:75,
    warning:'cashPool e xpPool são pools; não são crédito individual garantido.'
  };
}
function upgradeCost(business,level){
  return Math.floor(business.price*UPGRADE_RATES[level-1]);
}
function paybackDays(business,level,version){
  const curr=forecastBusinessDay(business,level,version).net;
  const next=forecastBusinessDay(business,level+1,version).net;
  return upgradeCost(business,level)/Math.max(1,next-curr);
}
function collectOwned(owned,day,version){
  let gross=0,tax=0,operating=0,net=0;
  for(const row of owned){
    const elapsed=(day-row.lastCollectedDay)*24;
    const cap=row.business.capacityHours+(version==='current'?row.level-1:0);
    const hours=Math.min(cap,Math.max(0,elapsed));
    const mult=1+(row.level-1)*(version==='current'?.25:.10);
    const earned=Math.floor(row.business.profitHour*hours*mult);
    const t=Math.floor(earned*NON_BUSINESS_ASSUMPTIONS.businessTaxFraction);
    const o=version==='proposed'?Math.floor(earned*NON_BUSINESS_ASSUMPTIONS.candidateBusinessOperatingFraction):0;
    gross+=earned;tax+=t;operating+=o;net+=earned-t-o;
    row.lastCollectedDay=day;
  }
  return {gross,tax,operating,net};
}
export function simulatePlayer(profile,days,catalog,version='proposed'){
  if(!PROFILES.some(p=>p.id===profile?.id))throw new TypeError('Perfil de simulação desconhecido');
  if(!Number.isInteger(days)||days<1||days>365)throw new RangeError('Horizonte inválido');
  if(!['current','proposed'].includes(version))throw new RangeError('Versão inválida');
  const owned=[];
  let cash=0,totalXp=0,activityGross=0,activitySpent=0,businessGross=0,
    businessTax=0,businessOperating=0,spentOnInvestments=0,activeDays=0,upgrades=0;
  const activity=activityForecast(profile.minutes);
  for(let day=1;day<=days;day++){
    // 5 dias por semana: folga em dias 6-7; ausências limitam a coleta passiva.
    if((day-1)%7>=profile.daysPerWeek)continue;
    activeDays++;
    const collected=collectOwned(owned,day,version);
    cash+=collected.net;
    businessGross+=collected.gross;
    businessTax+=collected.tax;
    businessOperating+=collected.operating;
    cash+=activity.netCash;
    activityGross+=activity.grossCash;
    activitySpent+=activity.spending;
    totalXp+=activity.xp;
    // Hipótese de reinvestimento humano: no máximo uma decisão por dia ativo.
    // Prioriza abrir negócio que falta e depois upgrade com retorno em até 30 dias.
    const next=catalog.find(b=>!owned.some(o=>o.business.id===b.id));
    if(next && cash>=next.price+NON_BUSINESS_ASSUMPTIONS.reserveCash){
      cash-=next.price;spentOnInvestments+=next.price;
      owned.push({business:next,level:1,lastCollectedDay:day});
      continue;
    }
    const options=owned.filter(row=>row.level<5).map(row=>({
      row,cost:upgradeCost(row.business,row.level),
      payback:paybackDays(row.business,row.level,version)
    })).filter(o=>o.payback<=30 && cash>=o.cost+NON_BUSINESS_ASSUMPTIONS.reserveCash)
      .sort((a,b)=>a.payback-b.payback||a.cost-b.cost);
    if(options.length){
      const chosen=options[0];cash-=chosen.cost;spentOnInvestments+=chosen.cost;
      chosen.row.level++;upgrades++;
    }
  }
  const portfolioValue=owned.reduce((sum,row)=>sum+
    row.business.price+UPGRADE_RATES.slice(0,row.level-1).reduce(
      (n,rate)=>n+Math.floor(row.business.price*rate),0),0);
  const identity=activeDays>0?activity.netCash*activeDays:0;
  const emitted=activityGross+businessGross;
  const drains=activitySpent+businessTax+businessOperating;
  return {profile:profile.id,version,days,minutesPerDay:profile.minutes,
    daysPerWeek:profile.daysPerWeek,activeDays,totalXp,
    cash,portfolioValue,ownedBusinesses:owned.length,upgrades,
    highestBusiness:owned.at(-1)?.business.id||null,
    activityGross,activitySpent,businessGross,businessTax,businessOperating,
    spentOnInvestments,emitted,drains,netGenerated:emitted-drains,
    accountingBalanced:emitted-drains===cash+spentOnInvestments};
}
export function economyScenarioReport(businessSource,raidSource){
  const versions=getBusinessVersions(businessSource);
  const raid=raidPoolBaseline(raidSource);
  const businessEndgame=Object.fromEntries(['current','proposed'].map(version=>[
    version,versions[version].reduce((sum,b)=>sum+forecastBusinessDay(b,5,version).net,0)
  ]));
  const profiles=PROFILES.flatMap(p=>WINDOWS.map(days=>({
    profile:p.id,days,
    current:simulatePlayer(p,days,versions.current,'current'),
    proposed:simulatePlayer(p,days,versions.proposed,'proposed')
  })));
  return {readOnly:true,mode:'proposal_simulation_only',businesses:versions.proposed.length,
    eligibleRaidLevels:raid.proposedEligible.map(r=>r.level),
    excludedRaidLevel:raid.excludedLevel,
    raidBaseline:raid.current.map(({level,keyPrice,cashPool,xpPool})=>({level,keyPrice,cashPool,xpPool})),
    assumptions:NON_BUSINESS_ASSUMPTIONS,
    timeProfiles:PROFILES,businessEndgame,profiles};
}
const onCli=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(onCli){
  const businessSource=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
  const raidSource=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  const result=economyScenarioReport(businessSource,raidSource);
  if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(result,null,2)+'\n');
  else{
    process.stdout.write('ALPHA V2 - ECONOMIA 7/30/60 DIAS (SOMENTE MODELO; NÃO APLICADO)\n');
    process.stdout.write('Todos começam com R$ 0/0 XP; 10% TAXADE nos negócios.\n');
    for(const row of result.profiles){
      process.stdout.write(row.profile+' '+row.days+'d: proposta R$ '+row.proposed.cash.toLocaleString('pt-BR')+
        ' + negócios R$ '+row.proposed.portfolioValue.toLocaleString('pt-BR')+
        ' (atual simulado R$ '+row.current.cash.toLocaleString('pt-BR')+
        ' + ativos R$ '+row.current.portfolioValue.toLocaleString('pt-BR')+')\n');
    }
  }
}
