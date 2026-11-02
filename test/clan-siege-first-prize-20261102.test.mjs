import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIRST_SIEGE_INSIGNIA,FIRST_SIEGE_INSIGNIA_ID,grantFirstSiegeInsignias} from '../src/neon/clan-siege-first-prize.js';

function fakeClient({jids=['playerA','playerB']}={}){
  let claimed=false;
  const log=[];
  return {
    log,
    async query(sql,params){
      log.push({sql,params});
      if(sql.startsWith('INSERT INTO alpha_siege_first_victory')){
        if(claimed)return {rowCount:0,rows:[]};
        claimed=true;
        return {rowCount:1,rows:[{chat_jid:params[0]}]};
      }
      if(sql.startsWith('SELECT jid FROM alpha_siege_roster'))return {rowCount:jids.length,rows:jids.map(jid=>({jid}))};
      return {rowCount:1,rows:[]};
    }
  };
}
const M={id:17,chat_jid:'12345@g.us',winner_clan_id:'9'};
test('primeira guerra: dois campeões distintos e duas entregas vinculadas',async()=>{
  const client=fakeClient();
  const result=await grantFirstSiegeInsignias(client,M);
  assert.equal(result.id,FIRST_SIEGE_INSIGNIA_ID);
  assert.equal(result.count,2);
  const owned=client.log.filter(x=>x.sql.startsWith('INSERT INTO inventories'));
  const bound=client.log.filter(x=>x.sql.startsWith('INSERT INTO bound_inventory_items'));
  assert.deepEqual(owned.map(x=>x.params[0]),['playerA','playerB']);
  assert.deepEqual(bound.map(x=>x.params[0]),['playerA','playerB']);
  assert.match(bound[0].params[2],/^clan-siege:first-win:/);
});
test('primeira guerra: idempotência impede distribuir novamente para o grupo',async()=>{
  const client=fakeClient();
  assert.ok(await grantFirstSiegeInsignias(client,M));
  assert.equal(await grantFirstSiegeInsignias(client,{...M,id:18}),null);
  assert.equal(client.log.filter(x=>x.sql.startsWith('INSERT INTO inventories')).length,2);
});
test('primeira guerra: empate não consome o direito nem cria inventário',async()=>{
  const client=fakeClient();
  assert.equal(await grantFirstSiegeInsignias(client,{...M,winner_clan_id:null}),null);
  assert.equal(client.log.length,0);
});
test('primeira guerra: 1 ou 3 membros bloqueia conclusão transacional',async()=>{
  for(const jids of [['playerA'],['playerA','playerB','playerC'],['playerA','playerA']]){
    const client=fakeClient({jids});
    await assert.rejects(()=>grantFirstSiegeInsignias(client,M),/exatamente dois/);
    assert.equal(client.log.filter(x=>x.sql.startsWith('INSERT INTO inventories')).length,0);
  }
});
test('primeira guerra: catálogo mais forte e restrito a PvE',()=>{
  assert.equal(FIRST_SIEGE_INSIGNIA.boss,.07);
  assert.equal(FIRST_SIEGE_INSIGNIA.raidAttack,.07);
  assert.equal(FIRST_SIEGE_INSIGNIA.bossCrit,.03);
  assert.equal(FIRST_SIEGE_INSIGNIA.raidCrit,.03);
  assert.equal(FIRST_SIEGE_INSIGNIA.raid,.02);
  assert.equal(FIRST_SIEGE_INSIGNIA.pvp,undefined);
  assert.match(FIRST_SIEGE_INSIGNIA.effect,/sem PvP/);
});
test('primeira guerra: premiação dispara somente ao terminar com vencedor',()=>{
  const siege=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
  assert.match(siege,/r\.finished&&r\.winner\?await grantFirstSiegeInsignias\(conn,updated\):null/);
  assert.match(siege,/alpha_siege_first_victory/);
});
test('primeira guerra: item é não vendável, não empilhável e individual',()=>{
  const client=fakeClient();
  return grantFirstSiegeInsignias(client,M).then(()=>{
    const insert=client.log.find(x=>x.sql.startsWith('INSERT INTO items'));
    assert.match(insert.sql,/FALSE,FALSE/);
    assert.equal(insert.params[4],'event');
    assert.ok(client.log.every(x=>!x.sql.includes('UPDATE wallets')));
  });
});
