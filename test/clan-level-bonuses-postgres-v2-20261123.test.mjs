import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
 clanBenefitsForPlayers,clanBenefitsForUser,clanMemberParticipation,
 recordClanCoopVictory
} from '../src/neon/clan-level-bonuses.js';

test('PostgreSQL isolado: bônus por doação OU 3 vitórias cooperativas, sem farmar',async t=>{
 const url=process.env.CLAN_V2_TEST_DATABASE_URL;
 if(!url){t.skip('Banco descartável exclusivo do CI não configurado');return;}
 const pool=new pg.Pool({connectionString:url,max:2});
 try{
  await pool.query('CREATE TABLE clans(id BIGSERIAL PRIMARY KEY,xp BIGINT NOT NULL)');
  await pool.query('CREATE TABLE clan_members(jid TEXT PRIMARY KEY,clan_id BIGINT NOT NULL REFERENCES clans(id))');
  await pool.query('CREATE TABLE clan_donations(id BIGSERIAL PRIMARY KEY,clan_id BIGINT NOT NULL,donor_jid TEXT NOT NULL,amount BIGINT NOT NULL)');
  await pool.query(`CREATE TABLE clan_coop_raid_credits(
    clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    jid TEXT NOT NULL,raid_key TEXT NOT NULL,
    PRIMARY KEY(clan_id,jid,raid_key))`);
  await pool.query('INSERT INTO clans(id,xp) VALUES(1,405000),(2,7105000)');
  await pool.query("INSERT INTO clan_members(jid,clan_id) VALUES('a',1),('b',1),('c',2),('donor',1),('half',1)");
  await pool.query("INSERT INTO clan_donations(clan_id,donor_jid,amount) VALUES(1,'donor',400),(1,'donor',600),(1,'half',999),(2,'a',999999)");
  let perks=await clanBenefitsForPlayers(pool,['a','b','c','donor','half','former']);
  assert.equal(perks.get('donor').xpPct,3.6,'R$1000 acumulados liberam');
  assert.equal(perks.get('a').damagePct,0,'sem contribuição individual não libera');
  assert.equal(perks.get('half').xpPct,0,'R$999 não libera');
  assert.equal(perks.get('former').xpPct,0);
  assert.equal((await clanMemberParticipation(pool,'a')).donated,0,'doações em outro clã não contam');
  const team=[{jid:'a',damage:50},{jid:'b',damage:50},{jid:'c',damage:200}];
  assert.equal(await recordClanCoopVictory(pool,{raidKey:'manual:1',participants:team,manual:false}),0,'RaidLote não conta');
  assert.equal(await recordClanCoopVictory(pool,{raidKey:'manual:1',participants:[{jid:'a',damage:100}],manual:true}),0,'solo não conta');
  assert.equal(await recordClanCoopVictory(pool,{raidKey:'manual:1',participants:[{jid:'a',damage:1},{jid:'b',damage:1},{jid:'c',damage:100}],manual:true}),0,'<2% de dano não conta');
  for(let round=1;round<=3;round++){
   assert.equal(await recordClanCoopVictory(pool,{raidKey:'manual:'+round,participants:team,manual:true}),2);
   assert.equal(await recordClanCoopVictory(pool,{raidKey:'manual:'+round,participants:team,manual:true}),0,'idempotência');
  }
  assert.equal((await clanMemberParticipation(pool,'a')).coopWins,3);
  assert.equal((await clanMemberParticipation(pool,'b')).eligible,true);
  perks=await clanBenefitsForPlayers(pool,['a','b','c','donor','half']);
  assert.equal(perks.get('a').xpPct,3.6);
  assert.equal(perks.get('b').damagePct,2);
  assert.equal(perks.get('c').xpPct,0,'jogador de outro clã sozinho não recebe');
  assert.equal((await clanBenefitsForUser(pool,'half')).xpPct,0);
  await pool.query("UPDATE clan_members SET clan_id=2 WHERE jid='b'");
  assert.equal((await clanMemberParticipation(pool,'b')).coopWins,0,'créditos do clã anterior não transferem');
  assert.equal((await clanBenefitsForUser(pool,'b')).xpPct,0,'ao mudar de clã perde desbloqueio do antigo');
  assert.equal((await clanBenefitsForUser(pool,'a')).xpPct,3.6);
 }finally{await pool.end();}
});
