import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CLAN_MAX_LEVEL,clanXpForLevel,clanLevelFromXp,clanBenefits,clanProgress,
 applyClanXpBonus,applyClanDamageBonus,applyClanDefenseBonus,
 clanBenefitsForUser,clanBenefitsForPlayers,clanMemberParticipation,clanMemberEligible,
 formatClanMemberParticipation,recordClanCoopVictory,formatClanProgress
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
 assert.deepEqual(two,{level:2,xpPct:.4,damagePct:0,defensePct:0});
 assert.deepEqual(clanBenefits(5),{level:5,xpPct:1.6,damagePct:1,defensePct:0});
 assert.deepEqual(clanBenefits(10),{level:10,xpPct:3.6,damagePct:2,defensePct:.5});
 assert.deepEqual(clanBenefits(15),{level:15,xpPct:5.6,damagePct:3,defensePct:.5});
 assert.deepEqual(clanBenefits(20),{level:20,xpPct:7.6,damagePct:4,defensePct:1});
 assert.deepEqual(clanBenefits(30),{level:30,xpPct:11.6,damagePct:6,defensePct:1.5});
 assert.deepEqual(clanBenefits(50),{level:50,xpPct:19.6,damagePct:10,defensePct:2.5});
});

test('XP nao duplica e combat bonus retorna numeros inteiros',()=>{
 const max=clanBenefits(50);
 assert.equal(applyClanXpBonus(10000,max),11960);
 assert.equal(applyClanDamageBonus(10000,max),11000);
 assert.equal(applyClanDefenseBonus(10000,max),9750);
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

test('liberação por doação OU Raid cooperativa e nunca pelo total do clã',async()=>{
 const queries=[];
 const c={query:async(sql,params)=>{
  queries.push({sql,params});
  const all=[
   {jid:'donor',clan_id:1,xp:clanXpForLevel(20),donated:'1000',coop_wins:0},
   {jid:'raider',clan_id:1,xp:clanXpForLevel(20),donated:'0',coop_wins:3},
   {jid:'new',clan_id:1,xp:clanXpForLevel(50),donated:'999',coop_wins:2},
   {jid:'other',clan_id:2,xp:clanXpForLevel(10),donated:'1500',coop_wins:0}
  ];
  return {rows:all.filter(x=>params[0].includes(x.jid))};
 }};
 const benefits=await clanBenefitsForPlayers(c,['donor','raider','new','other','former']);
 assert.equal(benefits.get('donor').xpPct,7.6);
 assert.equal(benefits.get('raider').damagePct,4);
 assert.equal(benefits.get('new').xpPct,0,'clã de alto nível não permite carona');
 assert.equal(benefits.get('other').damagePct,2);
 assert.equal(benefits.get('former').damagePct,0);
 assert.equal((await clanBenefitsForUser(c,'donor')).defensePct,1);
 assert.equal((await clanBenefitsForUser(c,'new')).xpPct,0);
 assert.equal((await clanBenefitsForUser(c,'former')).xpPct,0);
 const status=await clanMemberParticipation(c,'raider');
 assert.equal(status.eligible,true);
 assert.equal(status.coopWins,3);
 assert.ok(formatClanMemberParticipation(status).includes('Bônus liberados'));
 assert.equal((await clanMemberParticipation(c,'new')).eligible,false);
 assert.equal(clanMemberEligible({donated:999,coopWins:2}),false);
 assert.equal(clanMemberEligible({donated:1000,coopWins:0}),true);
 assert.equal(clanMemberEligible({donated:0,coopWins:3}),true);
 assert.ok(queries.every(x=>x.sql.includes('d.clan_id=m.clan_id')&&x.sql.includes('r.clan_id=m.clan_id')));
});
test('crédito cooperativo só em Raid manual, com 2+ do mesmo clã e 2% do dano',async()=>{
 const group=new Map([['a',1],['b',1],['c',2],['d',2]]);
 const seen=new Set(),writes=[];
 const client={query:async(sql,params)=>{
  writes.push({sql,params});
  const clans=new Map();
  for(const jid of params[0]){
    const clan=group.get(jid);
    if(!clan)continue;
    if(!clans.has(clan))clans.set(clan,[]);
    clans.get(clan).push(jid);
  }
  const rows=[];
  for(const [clan,jids] of clans){
    if(jids.length<2)continue;
    for(const jid of jids){
      const key=[clan,jid,params[1]].join(':');
      if(!seen.has(key)){seen.add(key);rows.push({jid});}
    }
  }
  return {rows};
 }};
 const p=[{jid:'a',damage:60},{jid:'b',damage:60},{jid:'c',damage:4800},{jid:'d',damage:80}];
 const total=p.reduce((sum,x)=>sum+x.damage,0);
 assert.ok(p[0].damage/total<.02);
 assert.equal(await recordClanCoopVictory(client,{raidKey:'raid-1',participants:p,manual:true}),0,'abaixo de 2% nao credita');
 assert.equal(writes.length,1);
 const valid=[{jid:'a',damage:600},{jid:'b',damage:400},{jid:'c',damage:3000}];
 assert.equal(await recordClanCoopVictory(client,{raidKey:'raid-2',participants:valid,manual:true}),2);
 assert.equal(await recordClanCoopVictory(client,{raidKey:'raid-2',participants:valid,manual:true}),0,'mesma raid nao duplica');
 assert.equal(await recordClanCoopVictory(client,{raidKey:'raid-3',participants:valid,manual:false}),0,'Raidlote nao conta');
 assert.equal(await recordClanCoopVictory(client,{raidKey:'raid-4',participants:[{jid:'a',damage:1000}],manual:true}),0);
 const before=writes.length;
 assert.equal(await recordClanCoopVictory(client,{raidKey:'raid-5',participants:[{jid:'a',damage:1000},{jid:'c',damage:1000}],manual:true}),0,'clãs distintos nao contam');
 assert.equal(writes.length,before+1);
});
