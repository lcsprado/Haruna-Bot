import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIEGE_SHIELD_REWARD_DATE,SIEGE_SHIELD_REWARD_ITEM_ID,
  isSiegeShieldRewardMatch,eligibleForSiegeShield,
  grantSiegeShieldReward,ensureSiegeShieldRewardSchema
} from '../src/neon/clan-siege-shield-reward-20261114.js';

const mkMatch=(overrides={})=>({
  id:1401,status:'completed',rules_version:5,
  created_by:'system:siege-daily-20h',
  created_at:Date.parse('2026-11-14T21:30:00-03:00'),
  blue_clan_id:101,red_clan_id:202,winner_clan_id:101,
  ...overrides
});
const roster=[
  {jid:'a@s.whatsapp.net',clan_id:101},
  {jid:'b@s.whatsapp.net',clan_id:101},
  {jid:'c@s.whatsapp.net',clan_id:202},
  {jid:'d@s.whatsapp.net',clan_id:202}
];
function fakeConn(turns=[3,2,3,4]){
  const claimed=new Set(),inventory=[],bound=[],items=[];
  let queries=0;
  return {
    claimed,inventory,bound,items,get queries(){return queries;},
    async query(sql,args=[]){
      queries++;
      if(sql.includes('FROM alpha_siege_roster'))return {rows:roster};
      if(sql.includes('FROM alpha_siege_moves'))
        return {rows:roster.map((x,i)=>({jid:x.jid,turns:turns[i]}))};
      if(sql.startsWith('INSERT INTO items')){items.push(args);return {rowCount:1};}
      if(sql.startsWith('INSERT INTO alpha_siege_shield_rewards_20261114')){
        if(claimed.has(args[0]))return {rowCount:0};
        claimed.add(args[0]);return {rowCount:1};
      }
      if(sql.startsWith('INSERT INTO inventories')){inventory.push(args);return {rowCount:1};}
      if(sql.startsWith('INSERT INTO bound_inventory_items')){bound.push(args);return {rowCount:1};}
      throw new Error('Query inesperada: '+sql);
    }
  };
}
test('só guerra semanal V5 de 14/11; nunca a guerra de 07/11',()=>{
  assert.equal(SIEGE_SHIELD_REWARD_DATE,'2026-11-14');
  assert.equal(SIEGE_SHIELD_REWARD_ITEM_ID,'bastiao_eclipse');
  assert.equal(isSiegeShieldRewardMatch(mkMatch()),true);
  assert.equal(isSiegeShieldRewardMatch(mkMatch({created_at:Date.parse('2026-11-07T21:30:00-03:00')})),false);
  assert.equal(isSiegeShieldRewardMatch(mkMatch({rules_version:4})),false);
  assert.equal(isSiegeShieldRewardMatch(mkMatch({status:'active'})),false);
  assert.equal(isSiegeShieldRewardMatch(mkMatch({created_by:'usuario'})),false);
});
test('só campeões com ao menos duas rodadas recebem o escudo',()=>{
  const m=mkMatch();
  assert.equal(eligibleForSiegeShield(m,101,2),true);
  assert.equal(eligibleForSiegeShield(m,101,1),false);
  assert.equal(eligibleForSiegeShield(m,202,6),false);
  assert.equal(eligibleForSiegeShield(mkMatch({winner_clan_id:null}),101,6),false);
});
test('entrega dois escudos uma única vez, sem acumular inventário após reprocessamento',async()=>{
  const db=fakeConn();
  const m=mkMatch();
  const first=await grantSiegeShieldReward(db,m);
  assert.equal(first.eligible,2);
  assert.equal(first.delivered,2);
  assert.deepEqual(db.inventory.map(x=>x[0]),['a@s.whatsapp.net','b@s.whatsapp.net']);
  assert.deepEqual(db.inventory.map(x=>x[1]),['bastiao_eclipse','bastiao_eclipse']);
  assert.equal(db.bound.length,2);
  assert.equal(db.items.length,1);
  assert.equal(db.items[0][3],'shield');
  assert.equal(db.items[0][4],'legendary');
  const second=await grantSiegeShieldReward(db,m);
  assert.equal(second.delivered,0);
  assert.equal(db.inventory.length,2);
  assert.equal(db.bound.length,2);
});
test('não premia empate nem quem jogou apenas uma rodada',async()=>{
  const draw=fakeConn();
  assert.deepEqual((await grantSiegeShieldReward(draw,mkMatch({winner_clan_id:null}))).delivered,0);
  assert.equal(draw.inventory.length,0);
  const lowParticipation=fakeConn([1,0,4,4]);
  const result=await grantSiegeShieldReward(lowParticipation,mkMatch());
  assert.equal(result.eligible,0);
  assert.equal(result.delivered,0);
  assert.equal(lowParticipation.items.length,0);
});
test('nenhum efeito colateral fora da data da premiação',async()=>{
  const db=fakeConn();
  assert.equal(await grantSiegeShieldReward(db,mkMatch({created_at:Date.parse('2026-11-21T21:30:00-03:00')})),null);
  assert.equal(db.queries,0);
});
test('cria controle único por jogador para evitar o segundo Bastião',async()=>{
  const sql=[];
  await ensureSiegeShieldRewardSchema({query:async q=>{sql.push(q);return {rowCount:0};}});
  assert.match(sql[0],/jid TEXT PRIMARY KEY/);
  assert.match(sql[0],/alpha_siege_shield_rewards_20261114/);
});
