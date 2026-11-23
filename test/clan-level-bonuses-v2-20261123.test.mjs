import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CLAN_MAX_LEVEL,clanXpForLevel,clanLevelFromXp,clanBenefits,clanProgress,
 applyClanXpBonus,applyClanDamageBonus,applyClanDefenseBonus,
 clanBenefitsForUser,clanBenefitsForPlayers,formatClanProgress
} from '../src/neon/clan-level-bonuses.js';

test('nivel inicial sem doacao e primeiro nivel exige R$ 25 mil',()=>{
 assert.equal(clanLevelFromXp(0),1);
 assert.equal(clanLevelFromXp(24999),1);
 assert.equal(clanLevelFromXp(25000),2);
 assert.equal(clanXpForLevel(2),25000);
 assert.equal(clanXpForLevel(3),55000);
 assert.equal(clanXpForLevel(5),130000);
 assert.equal(clanXpForLevel(10),405000);
 assert.equal(clanXpForLevel(50),7105000);
});

test('os niveis seguintes sao progressivamente mais caros e tem cap 50',()=>{
 for(let level=2;level<CLAN_MAX_LEVEL;level++){
  const current=clanXpForLevel(level)-clanXpForLevel(level-1);
  const next=clanXpForLevel(level+1)-clanXpForLevel(level);
  assert.ok(next>current);
  assert.equal(clanLevelFromXp(clanXpForLevel(level)),level);
 }
 assert.equal(clanLevelFromXp(1e10),50);
 assert.equal(clanProgress(1e10).nextLevel,null);
});

test('cada nivel melhora XP, mas dano/defesa PvE sao liberados a cada marco',()=>{
 const one=clanBenefits(1),two=clanBenefits(2);
 assert.deepEqual(one,{level:1,xpPct:0,damagePct:0,defensePct:0});
 assert.deepEqual(two,{level:2,xpPct:.1,damagePct:0,defensePct:0});
 assert.deepEqual(clanBenefits(10),{level:10,xpPct:.9,damagePct:.5,defensePct:0});
 assert.deepEqual(clanBenefits(15),{level:15,xpPct:1.4,damagePct:.5,defensePct:.5});
 assert.deepEqual(clanBenefits(30),{level:30,xpPct:2.9,damagePct:1.5,defensePct:1});
 assert.deepEqual(clanBenefits(50),{level:50,xpPct:4.9,damagePct:2.5,defensePct:1.5});
});

test('XP nao duplica e combat bonus retorna numeros inteiros',()=>{
 const max=clanBenefits(50);
 assert.equal(applyClanXpBonus(10000,max),10490);
 assert.equal(applyClanDamageBonus(10000,max),10250);
 assert.equal(applyClanDefenseBonus(10000,max),9850);
 assert.equal(applyClanXpBonus(10000,clanBenefits(1)),10000);
 assert.equal(applyClanDamageBonus(0,max),0);
});

test('bonus coletivo nao depende do cofre e sempre devolve progresso consistente',()=>{
 const status=clanProgress(406000);
 assert.equal(status.level,10);
 assert.equal(status.nextLevel,11);
 assert.equal(status.remainingXp,clanXpForLevel(11)-406000);
 assert.ok(status.progressPercent>=0);
 assert.ok(formatClanProgress(406000).includes('Nível: *10/50*'));
 assert.ok(formatClanProgress(0).includes('faltam *R$ 25.000*'));
 assert.ok(formatClanProgress(10000000).includes('Nível máximo'));
});

test('so os membros presentes recebem o beneficio, fora do cla e zero',async()=>{
 const queries=[];
 const c={query:async(sql,params)=>{
  queries.push({sql,params});
  if(params.length===1&&typeof params[0]==='string'){
   return {rows:params[0]==='membro'?[{xp:clanXpForLevel(20)}]:[]};
  }
  return {rows:[{jid:'membro',xp:clanXpForLevel(20)},{jid:'parceiro',xp:clanXpForLevel(10)}]};
 }};
 assert.equal((await clanBenefitsForUser(c,'membro')).xpPct,1.9);
 assert.equal((await clanBenefitsForUser(c,'ex-membro')).xpPct,0);
 const benefits=await clanBenefitsForPlayers(c,['membro','parceiro','ex-membro']);
 assert.equal(benefits.get('membro').damagePct,1);
 assert.equal(benefits.get('parceiro').damagePct,.5);
 assert.equal(benefits.get('ex-membro').damagePct,0);
 assert.equal(queries.at(-1).params[0].length,3);
});
