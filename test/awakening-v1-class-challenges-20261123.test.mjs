import test from 'node:test';
import assert from 'node:assert/strict';
import {AWAKENING_CLASS_TRIALS,challengeQuests,eligibleAwakeningPvp} from '../src/neon/awakening-v1-challenges.js';
import {raidPaladinProtection} from '../src/neon/raid-cooperative-roles.js';

const at=(iso)=>Math.floor(Date.parse(iso)/1000);
const pvp=(id,when,foe='rival',level=80)=>({
 id,source:'pvp',happened_at:at(when),opponent_jid:foe,opponent_level:level,metrics:{}
});
const raid=(id,lv=50,metrics={},manual=true)=>({
 id,source:'raid',raid_level:lv,manual,metrics:{damage:4000,partySize:2,...metrics}
});
const boss=(id,metrics={})=>({
 id,source:'boss',metrics:{damage:5000,share:.20,attacks:10,...metrics}
});
const quests=(classId,stage,events)=>challengeQuests({classId,stage,events});
const amount=(q,label)=>q.find(x=>x.label.startsWith(label));

test('10 classes possuem provas individuais IV/V, sem reduzir os numeros V1 pactuados',()=>{
 assert.equal(Object.keys(AWAKENING_CLASS_TRIALS).length,10);
 for(const [id,roles] of Object.entries(AWAKENING_CLASS_TRIALS)){
  assert.equal(roles.length,4,id);
  assert.ok(roles.every(x=>x.iv>0&&x.v>x.iv),id);
  for(const stage of [4,5]){
   const q=quests(id,stage,[]);
   assert.equal(q.length,6,id);
   assert.equal(q.at(-2).target,2,id);
   assert.equal(q.at(-1).target,1,id);
  }
 }
 assert.equal(amount(quests('paladin',4,[]),'Vencer duelos').target,30);
 assert.equal(amount(quests('paladin',5,[]),'Vencer duelos').target,45);
 assert.equal(amount(quests('samurai',5,[]),'Vencer duelos').target,100);
 assert.equal(amount(quests('berserker',5,[]),'Vencer duelos').target,110);
});
test('limite de duas vitorias PvP por rival e por dia civil de Brasilia',()=>{
 const a=pvp(1,'2026-11-23T02:00:00Z');
 const b=pvp(2,'2026-11-23T02:30:00Z');
 const c=pvp(3,'2026-11-23T03:10:00Z'); // muda o dia em Brasilia
 const d=pvp(4,'2026-11-23T03:30:00Z');
 const e=pvp(5,'2026-11-23T04:00:00Z'); // terceira no mesmo dia
 const f=pvp(6,'2026-11-23T04:10:00Z','outro');
 assert.deepEqual(eligibleAwakeningPvp([e,b,f,c,a,d]).map(x=>x.id),[1,2,3,4,6]);
 const q=quests('paladin',4,[a,b,c,d,e,f]);
 assert.equal(amount(q,'Vencer duelos').done,5);
 assert.equal(amount(q,'Vencer adversários').done,2);
});
test('Paladino: bloquear dano real e proteger aliados, nunca contar Raidlote nem solo',()=>{
 const valid=raid(1,50,{alliedProtection:180,guardEligibleDamage:1000,alliesSaved:2,coopEligible:true});
 const invalid=raid(2,50,{alliedProtection:90,guardEligibleDamage:1000,alliesSaved:0,coopEligible:false});
 const solo=raid(3,50,{alliedProtection:300,guardEligibleDamage:1000,partySize:1});
 const lote=raid(4,50,{alliedProtection:300,guardEligibleDamage:1000,alliesSaved:3},false);
 const low=raid(5,40,{alliedProtection:300,guardEligibleDamage:1000,alliesSaved:4});
 const q=quests('paladin',4,[valid,invalid,solo,lote,low]);
 assert.equal(amount(q,'Proteger aliados').done,1);
 assert.equal(amount(q,'Impedir golpes').done,1);
 assert.equal(amount(q,'Vencer Raids cooperativas').done,1);
});
test('Paladino no estágio III pode iniciar proteção real para o IV',()=>{
 const guardian={jid:'pal',classId:'paladin',classApplied:true,awakeningStage:3,alive:true,hp:1000,maxHp:2000};
 const target={jid:'ally',classId:'samurai',alive:true,hp:200,maxHp:500};
 const p=raidPaladinProtection([guardian,target],target,900);
 assert.equal(p.absorbed,160);
 assert.equal(p.damage,740);
 assert.equal(guardian.hp,840);
});
test('Samurai: combos em Raid manual e duelos de elite exigem adversario apropriado',()=>{
 const a=raid(1,50,{skills:{'Postura Iai':3}});
 const b=raid(2,50,{skills:{'Postura Iai':1}});
 const c=raid(3,50,{skills:{'Postura Iai':5}},false);
 const q=quests('samurai',4,[a,b,c,pvp(1,'2026-11-23T15:00:00Z','r1',55),pvp(2,'2026-11-23T15:05:00Z','r2',49)]);
 assert.equal(amount(q,'Vencer Raids').done,2);
 assert.equal(amount(q,'Executar combinações').done,1);
 assert.equal(amount(q,'Vencer duelos contra').done,1);
});
test('Berserker: furia real de combate e Boss com contribuicao >=10%',()=>{
 const q=quests('berserker',4,[
  raid(1,50,{skills:{'Fúria de Sangue':4}}),
  raid(2,50,{skills:{'Fúria de Sangue':2}}),
  boss(1,{share:.11}),
  boss(2,{share:.06}),
  boss(3,{share:.18,attacks:1})
 ]);
 assert.equal(amount(q,'Vencer Raids ativando').done,1);
 assert.equal(amount(q,'Contribuir com dano').done,1);
});
test('Necromante: dreno exige cura real, Boss exige maldicao no combate',()=>{
 const q=quests('necromancer',5,[
  raid(1,60,{classHealing:120,skills:{'Drenagem de Almas':5}}),
  raid(2,60,{classHealing:0,skills:{'Drenagem de Almas':5}}),
  raid(3,50,{classHealing:100,skills:{'Drenagem de Almas':5}}),
  boss(4,{curseHits:2}),boss(5,{curseHits:0})
 ]);
 assert.equal(amount(q,'Vencer Raids recuperando').done,1);
 assert.equal(amount(q,'Usar Drenagem').done,1);
 assert.equal(amount(q,'Vencer Bosses').done,1);
});
test('cada classe exige prova final real, nao liberada pelo progresso comum',()=>{
 const paladin=quests('paladin',4,[raid(1,60,{alliedProtection:200,guardEligibleDamage:1000,alliesSaved:1,coopEligible:true})]);
 assert.equal(amount(paladin,'Concluir prova de proteção heroica').done,1);
 const fake=quests('paladin',4,[raid(1,60,{alliedProtection:200,guardEligibleDamage:1000,alliesSaved:0,coopEligible:true})]);
 assert.equal(amount(fake,'Concluir prova de proteção heroica').done,0);
 const samurai=quests('samurai',4,[{...pvp(1,'2026-11-23T15:00:00Z','rival',60),metrics:{criticalHits:2}}]);
 assert.equal(amount(samurai,'Concluir duelo').done,1);
 const berserker=quests('berserker',5,[raid(1,65,{skills:{'Fúria de Sangue':8}})]);
 assert.equal(amount(berserker,'Vencer incursão extrema').done,1);
 const necro=quests('necromancer',5,[boss(1,{curseHits:4,share:.17})]);
 assert.equal(amount(necro,'Amaldiçoar').done,1);
});
test('Despertar IV e V possuem contadores de etapas independentes; nao transferir Raidlote',()=>{
 const sample=Array.from({length:4},(_,i)=>raid(i+1,50,{skills:{'Postura Iai':5}}));
 const iv=quests('samurai',4,sample),v=quests('samurai',5,sample);
 assert.equal(amount(iv,'Vencer Raids').done,4);
 assert.equal(amount(v,'Vencer Raids').done,0);
 assert.equal(quests('samurai',3,sample).length,0);
});
