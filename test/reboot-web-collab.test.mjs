import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSevenSinsSchedule,getWebEventCenter} from '../src/neon/web-event-center.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('calendário Web V2 não expõe eventos dos Pecados nem lê seu ledger',async()=>{
  const now=Date.parse('2026-10-20T12:00:00-03:00');
  const normal=buildSevenSinsSchedule(now,{reboot:false});
  const reboot=buildSevenSinsSchedule(now,{reboot:true});
  assert.ok(normal.length>0,'Edição anterior preservada quando reboot desligado');
  assert.deepEqual(reboot,[],'Não expor programação da collab');
  const queryable={query:()=>{throw Error('Não pode consultar DB antes da edição de Mimics')}};
  const result=await getWebEventCenter(queryable,'test-jid',now,{reboot:true});
  assert.deepEqual(result.sevenSins,[]);
  assert.ok(result.mimic,'Mimics independentes preservados');
  assert.ok(result.saturdayRaid,'Caçada normal de sábado preservada');
  assert.equal(result.readOnly,true);
});

test('Web V2 filtra inventário público e catálogo de relíquias no servidor',()=>{
  const api=source('src/neon/web-api.js');
  const relics=source('src/neon/relics.js');
  assert.match(api,/allItemRows\.rows\|\|\[\]\)\.filter\(item=>!classesOnlyRebootEnabled\(\)\|\|!isRebootCollabItemId\(item\.id\)\)/);
  assert.match(api,/relics:classesOnlyRebootEnabled\(\)/);
  assert.match(relics,/activeRelic\(queryable,jid\)[\s\S]*?if\(classesOnlyRebootEnabled\(\)&&isRebootCollabItemId\(id\)\)return null/);
  assert.match(relics,/owned\.rows\.filter\(r=>!classesOnlyRebootEnabled\(\)\|\|!isRebootCollabItemId\(r\.item_id\)\)/);
  assert.match(relics,/selectRelic\(jid,itemId\)\{\s*assertRebootItemAllowed\(itemId\)/);
});

test('Leilão da collab não compete com o leilão Alpha atual na V2',()=>{
  const api=source('src/neon/web-api.js');
  const legacy=source('src/neon/auction-bonus-20261101.js');
  const gateway=source('src/neon/auction-bonus-20261101-1500.js');
  assert.match(gateway,/from '\.\/auction-20261115-2100\.js'/);
  assert.match(api,/classesOnlyRebootEnabled\(\)\?getCurrentAuctionWebStatus:getAuctionWebStatus/);
  assert.match(api,/classesOnlyRebootEnabled\(\)\?placeCurrentAuctionWebBid:placeAuctionWebBid/);
  assert.match(legacy,/startAuctionAlphaScheduler\(sock\)\{\s*if\(classesOnlyRebootEnabled\(\)\)return/);
  assert.match(legacy,/handleAuctionAlphaCommand\(\{cmd,args,sender,name,chat,reply,web=false\}\)\{\s*if\(classesOnlyRebootEnabled\(\)\)return false/);
  assert.match(legacy,/async function tick\(sock\)\{\s*if\(classesOnlyRebootEnabled\(\)\)return/);
});
