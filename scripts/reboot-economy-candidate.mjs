#!/usr/bin/env node
// Simulação candidata: sem conexão, histórico real ou alterações no runtime.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PROFILES} from './reboot-economy-sim.mjs';
import {C4C_WINDOWS,buildIntegratedInputs,simulateIntegrated,assessIntegratedRisks} from './reboot-economy-integrated.mjs';
import {V2_EVENT_BUDGET,V2_RAID_LEVELS,raidCashSharesV2,assertRaid70V2Start} from '../src/neon/reboot-economy-policy.js';
import {v2XpCredit} from '../src/neon/reboot-combat-progression.js';
import {rebootWeeklyBossReward} from '../src/neon/weekly-golem-payouts.js';

const ordered=['intensivo','dedicado','regular','casual'];
export function candidateEventCash(days){
 if(!C4C_WINDOWS.includes(days))throw RangeError('Horizonte inválido');
 const schedule=Object.fromEntries(ordered.map(id=>[id,{}]));
 const grant=(id,day,cash)=>{schedule[id][day]=(schedule[id][day]||0)+cash};
 for(let day=1;day<=days;day++){
   // Hipótese adversa: os quatro contribuem toda semana, vitória ou encerramento válido.
   if(day%7===0){
     ordered.forEach((id,i)=>grant(id,day,V2_EVENT_BUDGET.weeklyBossPool*(4-i)/10));
   }
   // Vitória de Raid 10 cooperativa semanal, a partir da 3ª semana; não presume Raid 70.
   if(day>=21&&day%7===0){
     const members=ordered.map((jid,i)=>({jid,damage:4-i}));
     const cfg=V2_RAID_LEVELS[10],paid=raidCashSharesV2(cfg,members,{enabled:true});
     members.forEach(({jid})=>grant(jid,day,paid.payouts.get(jid)-cfg.keyPrice));
   }
 }
 return schedule;
}
export function candidateEconomyReport(progressionSource,dbSource){
 const inputs=buildIntegratedInputs(progressionSource,dbSource,{currentV2Prices:true});
 const profiles=PROFILES.flatMap(profile=>C4C_WINDOWS.map(days=>{
   const dailyExtraCash=candidateEventCash(days)[profile.id];
   return {profile:profile.id,days,invested:simulateIntegrated(profile,days,inputs),
     withConditionalEvents:simulateIntegrated(profile,days,inputs,{dailyExtraCash})};
 }));
 const riskSignals=assessIntegratedRisks(profiles);
 const conditionalRisks=assessIntegratedRisks(profiles.map(p=>({...p,invested:p.withConditionalEvents})));
 const xp=Object.fromEntries([2000,5000,10000,24000].map((raw,i)=>[
   PROFILES[i].id,{rawPerActiveDay:raw,creditedPerActiveDay:v2XpCredit(0,raw).awarded}
 ]));
 const boss=ordered.map((id,i)=>({id,...rebootWeeklyBossReward({
   position:i+1,damage:(4-i)*100000,totalDamage:1000000,weekendKey:'2026-11-20'})}));
 let soloRaid70Blocked=false;
 try{assertRaid70V2Start({level:70,partySize:1,enabled:true})}catch{soloRaid70Blocked=true}
 return {readOnly:true,currentV2Prices:true,profiles,riskSignals,conditionalRisks,
  xpSensitivity:xp,bossVictorySensitivity:boss,soloRaid70Blocked,
  assumptions:'Saldo zero, nível de personagem fixo em 1, perfis e investimentos do modelo integrado. Eventos hipotéticos: Boss semanal e Raid 10 semanal após dia 21, lucro líquido de chave, sem drops/consumíveis específicos.',
  exclusions:'GT, Poço, Bingo, leilão, cidade, streaks, XP real por atividade, compras de poder, tempo/nível de acesso à Raid e custos adicionais não modelados. Não é homologação.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const p=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
 const d=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
 process.stdout.write(JSON.stringify(candidateEconomyReport(p,d),null,2)+'\n');
}
