import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFairFighter} from '../src/neon/pvp-balance-simulator.js';
import {heroPvpAttack,heroPvpDefense} from '../src/neon/playable-heroes-core.js';
import {classPvpAttack,classPvpDefense} from '../src/neon/pvp-class-powers.js';
import {effectiveShieldedCritChance,shieldedCriticalMultiplier} from '../src/neon/anti-crit-shields.js';
import {vitalPulseHeal} from '../src/neon/vital-pets.js';
import {pvpWinnerByHealth} from '../src/neon/pvp-outcome-policy.js';
import {autoCombatModifiers} from '../src/neon/pvp-auto-strategy.js';

// Test extracts and executes the EXACT production hit() and 20-round loop,
// with real skill, crit, shield, pet and healing functions, but NO database or rewards.
const dbSource=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
const start=dbSource.indexOf('const hit=(from,to)=>{',dbSource.indexOf('export async function battle('));
const end=dbSource.indexOf('const pvpMetrics=',start);
assert.ok(start>0&&end>start&&end-start<12000,'canonical combat block not found');
const liveEngine=dbSource.slice(start,end);
for(const needle of ['heroPvpAttack(','classPvpAttack(','heroPvpDefense(','classPvpDefense(',
 'vitalPulseHeal(','effectiveShieldedCritChance(','shieldedCriticalMultiplier(',
 'autoCombatModifiers(','const autoDefenseFactor=','const roundCount='])
 assert.ok(liveEngine.includes(needle),'missing live calculation: '+needle);
const compile=new Function(
 'A','B','autoStrategyEnabled','autoCombatModifiers',
 'effectiveShieldedCritChance','shieldedCriticalMultiplier',
 'heroPvpAttack','heroPvpDefense','classPvpAttack','classPvpDefense','vitalPulseHeal','Math',
 ['const log=[];','let first=A.spd>=B.spd?A:B;',
  'let second=first===A?B:A;',liveEngine,
  'return {A,B,log,roundCount,decidedByLimit,ending};'].join('\n')
);
function rng(seed){
 let x=seed>>>0;
 return ()=>{x=(x+0x6d2b79f5)>>>0;let y=Math.imul(x^(x>>>15),1|x);
  y^=y+Math.imul(y^(y>>>7),61|y);return ((y^(y>>>14))>>>0)/4294967296};
}
function fighter(id,jid,{posture='equilibrada',gear=true,pets=true,shield=true,vital=true}={}){
 const f=buildFairFighter(id,{gear,level:100,awakening:5,mastery:5});
 return {
  jid,name:id,classId:f.hero?'warrior':id,classApplied:!f.hero,heroId:f.hero?id:null,
  heroGear:f.heroGear||{},heroState:{},heroMasteryStage:f.mastery||1,
  awakeningStage:f.awakening,awakeningState:{},lastProcAttack:0,attackIndex:0,
  hp:f.hp,maxHp:f.maxHp,atk:f.atk,def:f.def,spd:f.spd,crit:f.crit,
  shieldCritResist:shield?.11:0,shieldCritGuard:shield?.16:0,collabCrit:0,
  collabDamage:0,enchantDamage:gear?.04:0,
  petBonus:pets?{damage:.08,defense:.05,crit:.035,dodge:.03,healPct:.05,healCooldown:5}:
   {damage:0,defense:0,crit:0,dodge:0,healPct:0,healCooldown:0},
  petHealUses:0,petSpecies:pets?'guardiao_nucleo_vital':null,
  vitalPulseRate:vital?.05:0,vitalPulseUsed:false,autoPosture:posture
 };
}
function run(a,b,seed,{postureA='equilibrada',postureB='equilibrada',
 enabled=true,pets=true,shield=true,vital=true,gear=true}={}){
 const A=fighter(a,'A',{posture:postureA,pets,shield,vital,gear});
 const B=fighter(b,'B',{posture:postureB,pets,shield,vital,gear});
 const math=Object.create(Math);math.random=rng(seed);
 return compile(A,B,enabled,autoCombatModifiers,effectiveShieldedCritChance,
  shieldedCriticalMultiplier,heroPvpAttack,heroPvpDefense,
  classPvpAttack,classPvpDefense,vitalPulseHeal,math);
}
const pairs=[
 ['pecado_ban','samurai'],['pecado_diane','berserker'],
 ['pecado_meliodas','paladin'],['pecado_gowther','necromancer'],
 ['pecado_escanor','pecado_king'],['pecado_merlin','mage'],
 ['pecado_king','archer'],['warrior','assassin'],
 ['druid','mage'],['pecado_ban','pecado_meliodas'],
 ['samurai','paladin'],['pecado_diane','pecado_king']
];
test('flag OFF is byte-identical to ON with equilibrada in canonical battle()',()=>{
 for(const [a,b] of pairs)for(const seed of [1,2,3,17,122,20261116]){
  assert.deepEqual(run(a,b,seed,{enabled:false}),run(a,b,seed,{enabled:true}),
   a+' vs '+b+' seed '+seed);
 }
});
test('real HP, equipment, mastery, shields and pets are preserved by posture',()=>{
 for(const [a,b] of pairs.slice(0,8)){
  const baseline=run(a,b,55,{enabled:false});
  const changed=run(a,b,55,{postureA:'agressiva',postureB:'defensiva'});
  for(const key of ['atk','maxHp','heroMasteryStage','def','shieldCritResist'])
   assert.equal(changed.A[key],baseline.A[key],a+' '+key);
  assert.ok(changed.A.hp>=0&&changed.A.hp<=changed.A.maxHp);
  assert.ok(changed.B.hp>=0&&changed.B.hp<=changed.B.maxHp);
  assert.ok(changed.roundCount>=1&&changed.roundCount<=20);
  assert.ok(changed.log.every(x=>x.actualDamage===undefined||x.actualDamage>=0));
 }
});
test('posture, pet bonus and shields each alter real combat damage or criticals',()=>{
 let postureChanged=false,petChanged=false,shieldChanged=false;
 for(let seed=1;seed<=40;seed++){
  const a=run('pecado_ban','samurai',seed,{postureA:'equilibrada'});
  const p=run('pecado_ban','samurai',seed,{postureA:'agressiva'});
  postureChanged ||= JSON.stringify(a.log.map(x=>x.dmg))!==JSON.stringify(p.log.map(x=>x.dmg));
  const s=run('pecado_ban','samurai',seed,{shield:true});
  const n=run('pecado_ban','samurai',seed,{shield:false});
  shieldChanged ||= JSON.stringify(s.log.map(x=>x.crit))!==JSON.stringify(n.log.map(x=>x.crit));
  const w=run('pecado_ban','samurai',seed,{pets:true});
  const z=run('pecado_ban','samurai',seed,{pets:false});
  petChanged ||= JSON.stringify(w.log.map(x=>x.dmg))!==JSON.stringify(z.log.map(x=>x.dmg));
 }
 assert.ok(postureChanged);
 assert.ok(petChanged);
 assert.ok(shieldChanged);
});
test('mirrored live PvP audit: five stances vs equilibrium across 12 matchups',()=>{
 const postures=['equilibrada','agressiva','defensiva','tatica','adaptativa'];
 const report=[],extremeShifts=[];
 let total=0;
 for(const [a,b] of pairs){
  const wins=Object.fromEntries(postures.map(p=>[p,0]));
  for(let seed=1;seed<=110;seed++){
   const randomSeed=20261116+seed*101;
   for(const flipped of [false,true])for(const posture of postures){
    const result=flipped?
      run(b,a,randomSeed,{postureA:'equilibrada',postureB:posture}):
      run(a,b,randomSeed,{postureA:posture,postureB:'equilibrada'});
    const firstWins=pvpWinnerByHealth(result.A,result.B,.5).jid==='A';
    wins[posture]+=Number(flipped?!firstWins:firstWins);
    total++;
    assert.ok(result.A.hp>=0&&result.A.hp<=result.A.maxHp);
    assert.ok(result.B.hp>=0&&result.B.hp<=result.B.maxHp);
   }
  }
  const baseline=wins.equilibrada/220;
  const rates=Object.fromEntries(postures.map(p=>[p,Math.round(wins[p]/220*1000)/10]));
  const shifts=Object.fromEntries(postures.slice(1).map(p=>[p,Math.round((wins[p]/220-baseline)*1000)/10]));
  const maxShift=Math.max(...Object.values(shifts).map(Math.abs));
  if(maxShift>15)extremeShifts.push({pair:a+' vs '+b,maxShift,shifts});
  report.push({pair:a+' vs '+b,rates,shifts});
 }
 console.log('PVP_AUTO_LIVE_AUDIT '+JSON.stringify({total,report,extremeShifts}));
 assert.equal(total,pairs.length*110*2*5);
 assert.ok(report.every(x=>Object.values(x.rates).every(v=>v>=0&&v<=100)));
});
