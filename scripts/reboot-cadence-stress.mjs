#!/usr/bin/env node
// Ensaio puro: coleta em intervalos regulares e curva real de nível.
// Não conecta banco nem presume que os volumes de XP sejam jogabilidade comprovada.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {extractBusinessCatalog} from './reboot-economy-baseline.mjs';
import {PROFILES} from './reboot-economy-sim.mjs';
import {C4C_WINDOWS} from './reboot-economy-integrated.mjs';
import {candidateBusinessCatalog,businessIntervalGrossV2,V2_BUSINESS_ECONOMY,businessSettlementV2} from '../src/neon/reboot-economy-policy.js';
import {v2XpCredit} from '../src/neon/reboot-combat-progression.js';
import {classLevelAdvance} from '../src/neon/class-combat-balance.js';
const DAY=86400;
export function collectionStress(business,level){
 const effective=candidateBusinessCatalog(business,{enabled:true});
 const runs=[1,3,24,288].map(count=>{
  let gross=0,net=0;
  for(let i=0;i<count;i++){
   const earned=businessIntervalGrossV2(business,{level,last_collected_at:i*DAY/count},(i+1)*DAY/count);
   gross+=earned;
   net+=businessSettlementV2(earned).net;
  }
  return {count,gross,net};
 });
 return {id:business.id,level,effectiveHourly:effective.profitHour,capacityHours:effective.capacityHours,runs,
  previousDailyGross:Math.floor(V2_BUSINESS_ECONOMY.hourlyRates[business.id]*business.capacityHours*(100+(level-1)*10)/100),
  grossBounded:runs.every(r=>r.gross<=runs[0].gross),netBounded:runs.every(r=>r.net<=runs[0].net)};
}
export function progressionStress(profile,rawDailyXp,dbSource){
 const formula=String(dbSource).match(/function expNeeded\(level\)\s*\{\s*return Math\.max\(100, Number\(level\) \* (\d+)\)\s*\}/);
 const cap=String(dbSource).match(/const MAX_LEVEL=(\d+)/);
 if(!formula||!cap)throw Error('Curva de nível mudou: revisar modelo.');
 const multiplier=Number(formula[1]),maxLevel=Number(cap[1]);
 let level=1,xp=0,cls={level:1,xp:0},credited=0;
 const milestones={},rows=[];
 for(let day=1;day<=120;day++){
  if((day-1)%7<profile.daysPerWeek){
   const gain=v2XpCredit(0,rawDailyXp).awarded;credited+=gain;xp+=gain;
   while(level<maxLevel&&xp>=Math.max(100,level*multiplier)){xp-=Math.max(100,level*multiplier);level++}
   if(level>=maxLevel)xp=0;
   cls=classLevelAdvance(cls.level,cls.xp,gain);
   for(const m of [25,50,75,90,100])if(level>=m&&milestones[m]===undefined)milestones[m]=day;
  }
  if(C4C_WINDOWS.includes(day))rows.push({day,level,classLevel:cls.level,credited});
 }
 return {profile:profile.id,rawDailyXp,rows,milestones};
}
export function cadenceReport(progressionSource,dbSource){
 return {readOnly:true,collections:extractBusinessCatalog(progressionSource).flatMap(b=>[1,5].map(l=>collectionStress(b,l))),
 progression:PROFILES.map((p,i)=>progressionStress(p,[2000,5000,10000,24000][i],dbSource)),
 caveat:'XP diário bruto hipotético, curva geral e classe reais; não prova taxa de vitória, acesso ao despertar, dano ou sucesso de Raid. Coletas frequentes não aumentam emissão bruta nem líquida; truncamento pode reduzir o líquido em coletas pequenas.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const p=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
 const d=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
 process.stdout.write(JSON.stringify(cadenceReport(p,d),null,2)+'\n');
}
