// Ensaio offline candidato; não é execução integral de raidRound.
import {PLAYER_CLASSES,classAttack,classDefense,classCritBonus,petCombatSpecialty} from '../src/neon/game-catalog.js';
import {classCombatGrowth} from '../src/neon/class-combat-balance.js';
import {effectivePveCritChance} from '../src/neon/boss-crit-resistance.js';
import {VITAL_PETS,applyVitalCombatHp} from '../src/neon/vital-pets.js';
import {playerPotionHealAmount} from '../src/neon/player-potions.js';
import {chooseEconomicPetPotion} from '../src/neon/pet-potion-economy.js';
import {V2_CONSUMABLE_PRICES} from '../src/neon/reboot-progression-rewards.js';
import {raidPlayerDefenseCoefficient,raidPetDamageMultiplier} from '../src/neon/raid-pet-mitigation.js';
const ids=['paladin','necromancer','samurai','berserker'];
export const RAID70_COST_SCENARIOS=Object.freeze([
 {lv:90,stage:4,w:{atk:102,crit:.035},a:{def:103,hp:150,crit:.01},up:5,stars:1,pet:'quimera_rubra',petLv:50,baseEnergy:470,limit:20},
 {lv:100,stage:5,w:{atk:118,crit:.04},a:{def:117,hp:185,crit:.02},up:10,stars:5,pet:'serafim_vida_abissal',petLv:100,baseEnergy:495,limit:60}
]);
function rng(seed){let x=seed>>>0;return ()=>{x=(x+0x6d2b79f5)>>>0;let y=Math.imul(x^(x>>>15),1|x);y^=y+Math.imul(y^(y>>>7),61|y);return ((y^(y>>>14))>>>0)/4294967296}}
function petBonus(species,level){
 const b=petCombatSpecialty(species),growth=b.raid?.25:.50,cap=b.raid?.15:.10;
 const scale=1+Math.min(growth,(level-1)*growth/99),f=k=>Math.min(cap,Number(b[k]||0)*scale);
 return {damage:f('damage')+f('bossDamage'),hp:f('hp'),crit:f('crit'),defense:f('defense'),dodge:f('dodge'),healPct:f('healPct'),healCooldown:b.healCooldown};
}
export function simulateRaid70Cost(s,n,seed,{balance=true,petMultiplier=null}={}){
 if(![3,4].includes(n))throw Error('Raid70 exige 3 ou 4 neste ensaio');
 const random=rng(seed),target=Math.round(1600000*(1+.12*(n-1)));let hp=target;
 const coef=balance?raidPlayerDefenseCoefficient(70,{enabled:true}):.22;
 const mult=petMultiplier??(balance?raidPetDamageMultiplier(70,{enabled:true}):.7);
 const m=[1,1.1,1.22,1.36,1.52,1.7,1.9,2.1,2.3,2.5][s.up-1]*(1+.04*(s.stars-1));
 const profile=VITAL_PETS.find(x=>x.species===s.pet),petMax=profile.hpBase+(s.petLv-1)*(profile.hpGrowth+2),petEnergy=s.baseEnergy+(s.petLv-1)*2;
 const bonus=petBonus(s.pet,s.petLv);
 const stock=Object.keys(V2_CONSUMABLE_PRICES).filter(k=>k.startsWith('pocao_pet')).map(item_id=>({item_id,quantity:999}));
 const players=ids.slice(0,n).map(id=>{
  const c=PLAYER_CLASSES[id],g=classCombatGrowth(id,s.lv);
  const baseHp=100+(s.lv-1)*8+c.hp+g.hp+[0,0,30,75,135,215][s.stage]+Math.round((Number(s.w.hp||0)+Number(s.a.hp||0))*m);
  const maxHp=applyVitalCombatHp(baseHp,baseHp,bonus.hp,0).maxHp;
  return {id,hp:maxHp,maxHp,atk:10+(s.lv-1)*2+c.atk+g.atk+[0,0,6,15,27,43][s.stage]+Math.round(s.w.atk*m),def:5+s.lv-1+c.def+g.def+[0,0,6,15,27,43][s.stage]+Math.round(s.a.def*m),crit:.1+Number(s.w.crit||0)*m+Number(s.a.crit||0)*m+classCritBonus(id,true,s.stage,'raid'),state:{},last:0,used:0,petHp:petMax,energy:petEnergy,turns:0,petCost:0,energyCost:0,damage:0};
 });
 const result=(win,round)=>{
  const elixir=players.reduce((a,p)=>a+p.used,0),petCost=players.reduce((a,p)=>a+p.petCost,0),energyCost=players.reduce((a,p)=>a+p.energyCost,0);
  return {win,round,damage:target-hp,elixir,petCost,energyCost,total:elixir*V2_CONSUMABLE_PRICES.elixir_supremo+petCost+energyCost};
 };
 for(let round=1;round<=375;round++){
  const alive=players.filter(p=>p.hp>0);if(!alive.length)return result(false,round);
  for(const p of alive){
   if(p.energy<1&&p.petHp>0){p.energy=petEnergy;p.energyCost+=V2_CONSUMABLE_PRICES.energetico_pet}
   p.active=p.petHp>0&&p.energy>0;if(p.active){p.energy--;p.turns++}
   const pb=p.active?bonus:{},critical=random()<effectivePveCritChance(p.crit+(pb.crit||0),.30);
   const raw=Math.max(5,Math.floor(p.atk*(.82+random()*.38))),baseDmg=Math.max(5,Math.floor(raw*(1+(pb.damage||0))*3*(critical?1.5:1)));
   const hit=classAttack({classId:p.id,applied:true,damage:baseDmg,critical,hp:p.hp,maxHp:p.maxHp,attackIndex:round,context:'raid',lastProcAttack:p.last,awakeningStage:s.stage,awakeningState:p.state});
   p.last=hit.lastProcAttack;p.state=hit.awakeningState;p.hp=Math.min(p.maxHp,p.hp+hit.heal);
   const dmg=Math.min(hp,hit.damage);p.damage+=dmg;hp-=dmg;if(hp<=0)return result(true,round);
  }
  const special=random()<.22;
  for(const p of alive){
   const pb=p.active?bonus:{},dodge=(pb.dodge||0)>0&&random()<pb.dodge;
   const raw=Math.max(1,Math.round((320-p.def*coef)*(.82+random()*.36)*(1-(pb.defense||0))));
   const hit=dodge?0:Math.max(1,Math.round(raw*(special?1.55:random()<.05?1.5:1)));
   const aura=p.id!=='paladin'&&alive.some(x=>x.id==='paladin'&&x.hp>0);
   const r=classDefense({classId:p.id,applied:true,damage:aura?Math.round(hit*.98):hit,context:'raid',hp:p.hp,maxHp:p.maxHp,awakeningStage:s.stage,awakeningState:p.state});
   p.state=r.awakeningState;p.hp=Math.max(0,p.hp-r.damage+Number(r.healAfter||0));
   if(p.active){
    p.petHp=Math.max(0,p.petHp-Math.max(1,Math.round(320*(.28+random()*.20)*(special?1.25:1)*(1-(pb.defense||0))*mult)));
    if(p.petHp/petMax<.35){
     const chosen=chooseEconomicPetPotion(stock,petMax-p.petHp,{currentHp:p.petHp,maxHp:petMax,imminentDamage:Math.ceil(320*.60*mult)});
     p.petHp=Math.min(petMax,p.petHp+chosen.heal);p.petCost+=chosen.price;
    }
    if(p.petHp>0&&p.hp>0&&pb.healPct>0&&p.turns%pb.healCooldown===0&&p.hp/p.maxHp<.70)p.hp=Math.min(p.maxHp,p.hp+Math.round(p.maxHp*pb.healPct));
   }
   if(p.hp<=0&&p.used<s.limit){p.used++;p.hp=Math.min(p.maxHp,playerPotionHealAmount('elixir_supremo',p.maxHp))}
  }
 }
 return result(false,375);
}
export function raid70CostReport({samples=60,seed=91827,balance=true,petMultiplier=null}={}){
 return RAID70_COST_SCENARIOS.flatMap(s=>[3,4].map(n=>{
  const r=Array.from({length:samples},(_,i)=>simulateRaid70Cost(s,n,seed+i,{balance,petMultiplier}));
  const avg=k=>Math.round(r.reduce((a,x)=>a+x[k],0)/r.length);
  return {level:s.lv,party:n,samples,wins:r.filter(x=>x.win).length,rounds:avg('round'),elixirs:avg('elixir'),petCost:avg('petCost'),energyCost:avg('energyCost'),totalCost:avg('total')};
 }));
}
