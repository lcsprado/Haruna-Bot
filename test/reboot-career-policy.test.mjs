import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V2_CAREER_PAY,v2CareerRoleFactor,v2CareerBase,v2CareerGross,careerWorkGross,careerWorkXp}
 from '../src/neon/reboot-career-policy.js';
test('salários de carreira V2 por faixas e promoção profissional',()=>{
 assert.equal(v2CareerBase(1),1400);
 assert.equal(v2CareerBase(20),1400);
 assert.equal(v2CareerBase(21),1900);
 assert.equal(v2CareerBase(250),5500);
 assert.equal(v2CareerBase(251),7000);
 assert.equal(v2CareerRoleFactor(1),1);
 assert.equal(v2CareerRoleFactor(4),2.35);
 assert.equal(v2CareerGross(1,1),1400);
 assert.equal(v2CareerGross(251,4),16450);
 assert.throws(()=>v2CareerBase(0),RangeError);
});
test('bônus de evento histórico não afeta V2; rotina V1 preservada',()=>{
 const normal=v2CareerGross(100,4);
 assert.equal(v2CareerGross(100,4,1.5),Math.round(normal*1.15));
 assert.equal(careerWorkGross({enabled:true,level:100,careerMultiplier:4,legacyPayCap:15000,
  eventMoneyMultiplier:3,performanceFactor:1.5}),v2CareerGross(100,4,1.5));
 assert.equal(careerWorkGross({enabled:false,level:100,careerMultiplier:4,legacyPayCap:15000,
  eventMoneyMultiplier:2,performanceFactor:1.5}),75000);
});
test('XP profissional da V2 tem faixa 20–30 e sem multiplicador global',()=>{
 assert.equal(careerWorkXp(0,{enabled:true,legacyXpMultiplier:3}),20);
 assert.equal(careerWorkXp(.999,{enabled:true,legacyXpMultiplier:3}),30);
 assert.equal(careerWorkXp(0,{enabled:false,legacyXpMultiplier:3}),75);
 assert.equal(careerWorkXp(.999,{enabled:false,legacyXpMultiplier:3}),120);
 assert.equal(V2_CAREER_PAY.cooldownMinutes,30);
 assert.throws(()=>careerWorkXp(1,{enabled:true}),RangeError);
});
test('trabalhar V2 calcula salário e XP sem cron de bônus histórico',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
 const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
 const start=db.indexOf('export async function work('),end=db.indexOf('export async function deposit(',start);
 const work=db.slice(start,end);
 assert.match(work,/careerWorkGross\(\{level,legacyPayCap:payCap,careerMultiplier:newRank.mult/);
 assert.match(work,/careerWorkXp\(Math.random\(\),\{legacyXpMultiplier:xpMultiplier\}/);
 assert.match(work,/const moneyMultiplier=classesOnlyRebootEnabled\(\)\?1:/);
 assert.match(work,/const xpMultiplier=classesOnlyRebootEnabled\(\)\?1:/);
 assert.match(work,/const taxRate=classesOnlyRebootEnabled\(\)\?10:/);
 assert.match(wa,/v2CareerRoleFactor\(r.rank.mult\)/);
});
