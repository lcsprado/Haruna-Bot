import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SIEGE_EVENT_CASH,SIEGE_EVENT_TROPHY_ID,brtSiegeDay,isSiegeEvent20261104,
  grantSiegeEventRewards,ensureSiegeEventRewardsSchema}
  from '../src/neon/clan-siege-event-rewards-20261104.js';

const eventStart=Date.parse('2026-11-04T21:00:00-03:00');
const base={id:9,status:'completed',rules_version:5,created_by:'system:siege-daily-20h',
  created_at:eventStart,blue_clan_id:5,red_clan_id:7,winner_clan_id:5};
function fake({members=[
 {jid:'a',clan_id:5},{jid:'b',clan_id:5},
 {jid:'c',clan_id:7},{jid:'d',clan_id:7}
],walletMissing=false}={}){
 const claims=new Set(),logs=[],money=new Map();
 return {logs,money,async query(sql,params=[]){
  logs.push({sql,params});
  if(sql.startsWith('SELECT jid,clan_id FROM alpha_siege_roster'))
   return {rows:members,rowCount:members.length};
  if(sql.startsWith('INSERT INTO alpha_siege_rewards_20261104')){
   const key=params[0]+':'+params[1];
   if(claims.has(key))return {rows:[],rowCount:0};
   claims.add(key);return {rows:[{jid:params[1]}],rowCount:1};
  }
  if(sql.startsWith('UPDATE wallets SET cash=')){
   if(walletMissing)return {rows:[],rowCount:0};
   money.set(params[0],(money.get(params[0])||0)+params[1]);
   return {rows:[{jid:params[0]}],rowCount:1};
  }
  return {rows:[],rowCount:1};
 }};
}
test('datas são do horário de Brasília, não do servidor UTC',()=>{
 assert.equal(brtSiegeDay(eventStart),'2026-11-04');
 assert.equal(brtSiegeDay(Date.parse('2026-11-05T02:59:00Z')),'2026-11-04');
 assert.equal(brtSiegeDay(Date.parse('2026-11-05T03:00:00Z')),'2026-11-05');
 assert.ok(isSiegeEvent20261104(base));
 assert.equal(isSiegeEvent20261104({...base,rules_version:1}),false);
 assert.equal(isSiegeEvent20261104({...base,created_by:'someone'}),false);
 assert.equal(isSiegeEvent20261104({...base,created_at:eventStart+86400000}),false);
});
test('V5 04/11: 2 campeões ganham 5m e troféu, 2 vices recebem 1m; sem insígnia',async()=>{
 const conn=fake(),r=await grantSiegeEventRewards(conn,base);
 assert.deepEqual([r.winners,r.losers,r.trophies,r.draws,r.paid],[2,2,2,0,12000000]);
 assert.deepEqual([...conn.money.entries()].sort(),[['a',5000000],['b',5000000],['c',1000000],['d',1000000]]);
 const item=conn.logs.find(x=>x.sql.startsWith('INSERT INTO items('));
 assert.ok(item);assert.equal(item.params[0],SIEGE_EVENT_TROPHY_ID);
 assert.match(item.sql,/FALSE,FALSE/);
 assert.match(item.params[2],/Sem atributos, sem efeito de combate/);
 assert.equal(conn.logs.filter(x=>x.sql.startsWith('INSERT INTO bound_inventory_items')).length,2);
 assert.equal(conn.logs.filter(x=>x.sql.startsWith('INSERT INTO inventories')).length,2);
 assert.equal(conn.logs.filter(x=>x.sql.startsWith('UPDATE wallets')).length,4);
 assert.ok(!conn.logs.some(x=>/UPDATE users SET|UPDATE clans SET|insignia_primeiros_conquistadores/.test(x.sql)));
});
test('empate dá 1,5m a cada um e não cria troféu',async()=>{
 const conn=fake(),r=await grantSiegeEventRewards(conn,{...base,winner_clan_id:null});
 assert.deepEqual([r.winners,r.losers,r.draws,r.trophies,r.paid],[0,0,4,0,6000000]);
 assert.ok([...conn.money.values()].every(x=>x===SIEGE_EVENT_CASH.draw));
 assert.equal(conn.logs.filter(x=>x.sql.startsWith('INSERT INTO items')).length,0);
});
test('chave composta evita duplicar carteira e inventário mesmo com reexecução',async()=>{
 const conn=fake();
 const one=await grantSiegeEventRewards(conn,base);
 const second=await grantSiegeEventRewards(conn,base);
 assert.equal(one.paid,12000000);assert.equal(second.paid,0);
 assert.equal(conn.logs.filter(x=>x.sql.startsWith('UPDATE wallets')).length,4);
 assert.equal(conn.logs.filter(x=>x.sql.startsWith('INSERT INTO inventories')).length,2);
});
test('escalação inválida ou falta de carteira bloqueia transação',async()=>{
 for(const members of [[{jid:'a',clan_id:5}],[{jid:'a',clan_id:5},{jid:'a',clan_id:5},
   {jid:'c',clan_id:7},{jid:'d',clan_id:7}]]){
  await assert.rejects(()=>grantSiegeEventRewards(fake({members}),base),/exatamente dois participantes/);
 }
 await assert.rejects(()=>grantSiegeEventRewards(fake({walletMissing:true}),base),/carteira ausente/);
});
test('tabela de entrega tem chave composta e anúncio só é preparado para a edição',async()=>{
 const db={async query(sql){assert.match(sql,/PRIMARY KEY\(match_id,jid\)/);}};
 await ensureSiegeEventRewardsSchema(db);
 const source=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
 assert.match(source,/await ensureSiegeEventRewardsSchema\(db\)/);
 assert.match(source,/r\.finished\?await grantSiegeEventRewards\(conn,updated\):null/);
 assert.match(source,/brtSiegeDay\(created\)===SIEGE_EVENT_DATE/);
 assert.match(source,/PRÊMIOS CREDITADOS/);
});
