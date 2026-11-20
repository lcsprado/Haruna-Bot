#!/usr/bin/env node
// Apenas auditoria offline. Executar com ALPHA_REBOOT_MODE=classes_only.
// Usa o trecho real de resolução do duelo, sem importar db.js nem abrir conexão.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PLAYER_CLASSES,petPvpSpecialty} from '../src/neon/game-catalog.js';
import {classCombatGrowth} from '../src/neon/class-combat-balance.js';
import {classPvpAttack,classPvpDefense,classPvpCritBonus} from '../src/neon/pvp-class-powers.js';
import {antiCritShieldStats,effectiveShieldedCritChance,shieldedCriticalMultiplier} from '../src/neon/anti-crit-shields.js';
import {applyVitalCombatHp,vitalPulseHeal} from '../src/neon/vital-pets.js';
import {pvpWinnerByHealth} from '../src/neon/pvp-outcome-policy.js';
import {REBOOT_CLASS_IDS,classesOnlyRebootEnabled} from '../src/neon/reboot-classes-policy.js';
const IDS=['paladin','necromancer','samurai','berserker'];
const LEVELS=[1,25,50,75,100];
const ELIGIBLE_LEVELS=[21,22,23,24,25,50,75,100];
const SCENARIOS=['none','gear','petShield'];
function rng(seed){
 let x=seed>>>0;
 return ()=>{x=(x+0x6d2b79f5)>>>0;let y=Math.imul(x^(x>>>15),1|x);
 y^=y+Math.imul(y^(y>>>7),61|y);return ((y^(y>>>14))>>>0)/4294967296};
}
export function compileClassDuel(dbSource){
 if(!classesOnlyRebootEnabled())throw Error('Execute a auditoria em classes_only.');
 const start=dbSource.indexOf('const log=[]\nlet first=A.spd');
 const end=dbSource.indexOf('const roundCount=Math.max(A.attackIndex,B.attackIndex)',start);
 if(start<0||end<=start)throw Error('Trecho do motor mudou: revisar auditoria.');
 const body=dbSource.slice(start,end);
 if(!body.includes('classPvpAttack(')||!body.includes('classPvpDefense(')||!body.includes('round<=20')||
    /await\s|\.query\(|process\.|require\(|import\s|fetch\(/.test(body))throw Error('Trecho de combate não é puro ou mudou.');
 const deps={classPvpAttack,classPvpDefense,vitalPulseHeal,effectiveShieldedCritChance,shieldedCriticalMultiplier,pvpWinnerByHealth};
 // Fonte local versionada, trecho sem I/O. A ramificação de herói nunca é executada.
 const duel=new Function(...Object.keys(deps),'A','B','Math',body+'\nreturn {winner:pvpWinnerByHealth(A,B,Math.random()).classId,ending:[A.hp,B.hp],rounds:Math.max(A.attackIndex,B.attackIndex)}');
 return (a,b,random)=>{const math=Object.create(Math);math.random=random;return duel(...Object.values(deps),a,b,math)};
}
export function buildClassFighter(id,level,stage,scenario){
 if(!IDS.includes(id)||![...LEVELS,...ELIGIBLE_LEVELS].includes(level)||!SCENARIOS.includes(scenario))throw Error('Cenário inválido.');
 const c=PLAYER_CLASSES[id],g=classCombatGrowth(id,level);
 // Base inicial e crescimento geral lidos do esquema: HP+8/ATK+2/DEF+1/SPD+1.
 // Despertar concluído nos checkpoints é hipótese, não elegibilidade comprovada.
 const hp=100+(level-1)*8+c.hp+g.hp+[0,0,30,75,135,215][stage];
 const m=scenario!=='none'?{hp:level*3,atk:Math.round(level*1.2),def:Math.round(level*.8),spd:10,crit:.06}:{hp:0,atk:0,def:0,spd:0,crit:0};
 const pet=scenario==='petShield'?petPvpSpecialty(level>=60?'quimera_rubra':'cachorro',level):null;
 const max=vitalHp(hp+m.hp,pet);
 const shield=scenario==='petShield'?antiCritShieldStats('escudo_runico',Math.min(10,Math.ceil(level/10)),1):null;
 const awakeningStat=[0,0,6,15,27,43][stage];
 return {jid:id,name:id,classId:id,classApplied:true,awakeningStage:stage,awakeningState:{},
 heroId:null,hp:max,maxHp:max,atk:10+(level-1)*2+c.atk+g.atk+awakeningStat+m.atk,
 def:5+level-1+c.def+g.def+awakeningStat+m.def,spd:10+level-1+c.spd+g.spd+m.spd,
 crit:.10+m.crit+classPvpCritBonus(id,true,stage),attackIndex:0,lastProcAttack:0,
 petBonus:pet,petHealUses:0,shieldCritGuard:shield?.critGuard||0,shieldCritResist:shield?.critResist||0};
}
function vitalHp(hp,pet){return applyVitalCombatHp(hp,hp,pet?.hp||0,0,{pvp:true}).maxHp}
export function auditFourClasses(dbSource,{duelsPerOrder=160,eligibleOnly=false,seed=20261118}={}){
 if(!Number.isSafeInteger(duelsPerOrder)||duelsPerOrder<1||duelsPerOrder>1000)throw Error('Amostra inválida.');
 if(!IDS.every(id=>REBOOT_CLASS_IDS.includes(id))||REBOOT_CLASS_IDS.length!==4)throw Error('Catálogo V2 mudou.');
 const duel=compileClassDuel(dbSource),scenarios=[];
 for(const level of eligibleOnly?ELIGIBLE_LEVELS:LEVELS){
  const stages=eligibleOnly?Array.from({length:Math.min(5,Math.floor(level/25)+1)+1},(_,i)=>i):[LEVELS.indexOf(level)+1];
  for(const stage of stages)for(const scenario of SCENARIOS){
   const wins=Object.fromEntries(IDS.map(id=>[id,0])),pairs=[];
   for(let i=0;i<IDS.length;i++)for(let j=i+1;j<IDS.length;j++){
    let w=0;
    for(let k=0;k<duelsPerOrder;k++)for(const flip of [false,true]){
     const a=buildClassFighter(IDS[flip?j:i],level,stage,scenario),b=buildClassFighter(IDS[flip?i:j],level,stage,scenario);
     const r=duel(a,b,rng(seed+level*10000+i*500+j*200+k));
     wins[r.winner]++;if(r.winner===IDS[i])w++;
    }
    pairs.push({a:IDS[i],b:IDS[j],battles:2*duelsPerOrder,winRateA:Math.round(w/(2*duelsPerOrder)*1000)/10});
   }
   const rates=Object.fromEntries(IDS.map(id=>[id,Math.round(wins[id]/(6*duelsPerOrder)*1000)/10]));
   scenarios.push({level,stage,scenario,rates,pairs,battles:12*duelsPerOrder,
     flagged:Object.values(rates).some(v=>v<30||v>70)});
  }
 }
 return {readOnly:true,eligibleOnly,seed,scenarios,battles:scenarios.reduce((s,r)=>s+r.battles,0),
 thresholds:{minClassWinRate:30,maxClassWinRate:70},flagged:scenarios.filter(x=>x.flagged).length,
 caveat:'Equipamento sintético igual, pet e escudo reais iguais; nível geral/classe iguais e despertar concluído hipoteticamente. Não modela inventário real, sinergias completas, PvE, obtenção de gear ou economia.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
 process.stdout.write(JSON.stringify(auditFourClasses(source,{eligibleOnly:true,duelsPerOrder:180,seed:88209117}),null,2)+'\n');
}
