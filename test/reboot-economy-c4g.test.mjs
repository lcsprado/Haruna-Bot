import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V2_BINGO,assertBingoV2Release,validateBingoV2Edition,
 bingoV2TicketEligibility,planBingoV2Payouts} from '../src/neon/reboot-bingo-policy.js';
import {V2_AUCTION,assertV2AuctionReward,firstAuctionV2Catalog} from '../src/neon/reboot-auction-policy.js';
import {REBOOT_LEGACY_AUCTION_VOUCHERS,assertRebootItemAllowed,
 filterRebootStarterItems} from '../src/neon/reboot-classes-policy.js';
import {V2_DROP_RESALE,V2_BOX_CASH,rebootResaleUnit,rebootBoxCashRange,rebootBoxBatchLimit}
 from '../src/neon/reboot-sale-policy.js';
import {grantAuctionInventoryItem} from '../src/neon/auction-forged-rewards.js';

test('Bingo V2 começa barato, emissão total fixa, sem bônus de caixa para cada inscrito',()=>{
 assert.equal(V2_BINGO.ticket,500);
 assert.equal(V2_BINGO.cardLimit,1);
 assert.equal(V2_BINGO.weeklyEditions,1);
 assert.equal(V2_BINGO.cashPackagePerCard,0);
 const cash=Object.values(V2_BINGO.milestones).reduce((sum,x)=>sum+x.cash,0);
 assert.equal(cash,9000);
 assert.equal(cash,V2_BINGO.maxEmission);
});
test('Bingo V2 não inicia sem modo, banco isolado e autorização própria',()=>{
 assert.throws(()=>assertBingoV2Release({ALPHA_REBOOT_MODE:'classes_only'}),/bloqueado/);
 assert.throws(()=>assertBingoV2Release({ALPHA_REBOOT_BINGO_RELEASE:'approved-isolated-v2'}),/bloqueado/);
 assert.equal(assertBingoV2Release({ALPHA_REBOOT_MODE:'classes_only',
  ALPHA_REBOOT_BINGO_RELEASE:'approved-isolated-v2',ALPHA_REBOOT_DB_CONFIRMED:'isolated-v2'}),true);
 const t=Date.parse('2026-11-23T19:30:00-03:00');
 const ok=validateBingoV2Edition({id:'bingo_v2_20261123_1930',startAt:t,
  endAt:t+60*60*1000,now:t-60*1000});
 assert.equal(ok.ticketPrice,500);
 assert.throws(()=>validateBingoV2Edition({id:'bingo_alpha_halloween_20261031_v1',
   startAt:t,endAt:t+300000,now:t-1000}),/inválida/);
 assert.throws(()=>validateBingoV2Edition({id:'bingo_v2_20261123_1930',startAt:t,
  endAt:t+300000,now:t-1000,otherStarts:[t-86400000]}),/sete dias/);
});
test('uma cartela por jogador, pagamentos idempotentes e somatório até R$ 9 mil',()=>{
 assert.equal(bingoV2TicketEligibility({jid:'j1',entries:[]}).cost,500);
 assert.throws(()=>bingoV2TicketEligibility({jid:'j1',entries:['j1']}),/uma cartela/);
 assert.throws(()=>bingoV2TicketEligibility({jid:'j1',entries:[],started:true}),/encerrada/);
 const id='bingo_v2_20261123_1930';
 const wins=[{milestone:'row',jid:'j1'},{milestone:'twoRows',jid:'j2'},
  {milestone:'full',jid:'j3'}];
 const p=planBingoV2Payouts({editionId:id,winners:wins});
 assert.deepEqual(p.payments.map(x=>x.amount),[1500,2500,5000]);
 assert.equal(p.totalEditionEmission,9000);
 assert.equal(p.remainingBudget,0);
 assert.equal(new Set(p.payments.map(x=>x.key)).size,3);
 const replay=planBingoV2Payouts({editionId:id,winners:wins,settled:p.resolved});
 assert.equal(replay.payments.length,0);
 assert.throws(()=>planBingoV2Payouts({editionId:id,winners:[wins[0],wins[0]]}),/duplicado/);
 assert.throws(()=>planBingoV2Payouts({editionId:id,winners:[{milestone:'full',jid:'j2'}],
  settled:p.resolved}),/Conflito/);
});
test('novo leilão não oferece forja máxima, voucher ou Raid75',()=>{
 const lots=firstAuctionV2Catalog();
 assert.equal(lots.length,3);
 assert.ok(lots.every(l=>l.level===1&&l.stars===1&&l.opening>=1000));
 assert.ok(V2_AUCTION.weeklyEditions===1);
 assert.throws(()=>assertV2AuctionReward({...lots[0],stars:5}),/incompatível/);
 assert.throws(()=>assertV2AuctionReward({...lots[0],level:10}),/incompatível/);
 assert.throws(()=>assertV2AuctionReward({...lots[0],itemId:'chave_raid_75'}),/proibida/);
 assert.throws(()=>assertV2AuctionReward({...lots[0],itemId:'voucher_essencia_perfeicao_20261115'}),/proibida/);
 for(const id of REBOOT_LEGACY_AUCTION_VOUCHERS){
  assert.throws(()=>assertRebootItemAllowed(id,{enabled:true}),/indisponível/);
  assert.equal(assertRebootItemAllowed(id,{enabled:false}),true);
 }
 assert.deepEqual(filterRebootStarterItems([
  ['voucher_essencia_perfeicao_20261115'],['espada_aco']
 ],{enabled:true}),[['espada_aco']]);
});
test('venda de drop V2 baixa preço, mantém compra com revenda de 50%',()=>{
 assert.equal(rebootResaleUnit({price:0,rarity:'legendary'},{enabled:true}),8000);
 assert.equal(rebootResaleUnit({price:0,rarity:'epic'},{enabled:true}),2000);
 assert.equal(rebootResaleUnit({price:0,rarity:'rare'},{enabled:true}),800);
 assert.equal(rebootResaleUnit({price:0,rarity:'uncommon'},{enabled:true}),250);
 assert.equal(rebootResaleUnit({price:0,rarity:'common'},{enabled:true}),100);
 assert.equal(rebootResaleUnit({price:1200,rarity:'legendary'},{enabled:true}),600);
 assert.equal(rebootResaleUnit({price:1200,rarity:'legendary'},{enabled:false}),null);
 assert.deepEqual(rebootBoxCashRange('caixa_epica',[20000,60000],{enabled:true}),[800,2000]);
 assert.deepEqual(rebootBoxCashRange('caixa_epica',[20000,60000],{enabled:false}),[20000,60000]);
 assert.equal(rebootBoxBatchLimit({enabled:true}),25);
 assert.equal(rebootBoxBatchLimit({enabled:false}),5000);
 assert.equal(V2_DROP_RESALE.legendary,8000);
 assert.equal(V2_BOX_CASH.caixa_rara[1],1200);
});
test('sem forja ★5 no prêmio genérico do leilão V2, V1 preservada',async()=>{
 const calls=[];
 const client={query:async(q,params)=>{
  calls.push(String(q));
  if(String(q).startsWith('SELECT name,category FROM items'))return {rows:[{name:'Espada',category:'weapon'}]};
  return {rows:[],rowCount:1};
 }};
 const prior=process.env.ALPHA_REBOOT_MODE;
 try{
  process.env.ALPHA_REBOOT_MODE='classes_only';
  const r=await grantAuctionInventoryItem(client,'test','espada_aco',1);
  assert.equal(r.forged,false);
  assert.equal(calls.some(s=>s.includes('equipment_star_forges')),false);
  assert.equal(calls.some(s=>s.includes('INSERT INTO inventories')),true);
  await assert.rejects(()=>grantAuctionInventoryItem(client,'test','voucher_essencia_perfeicao_20261115',1),/indisponível/);
 }finally{
  if(prior==null)delete process.env.ALPHA_REBOOT_MODE;else process.env.ALPHA_REBOOT_MODE=prior;
 }
});
test('integrações de revenda individual, lote, inventário e caixa são todas protegidas',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
 const reward=readFileSync(new URL('../src/neon/auction-20261115-rewards.js',import.meta.url),'utf8');
 assert.equal((db.match(/if\(classesOnlyRebootEnabled\(\)\)unit=rebootResaleUnit\(item,\{enabled:true\}\)/g)||[]).length,2);
 assert.match(db,/r\.sell_unit=rebootResaleUnit\(r,\{enabled:true\}\)/);
 assert.match(db,/rebootBoxCashRange\(boxId,config\.cash\)/);
 assert.match(db,/qty>rebootBoxBatchLimit\(\)/);
 assert.match(reward,/assertRebootItemAllowed\(voucher\(0\)\)/);
 assert.match(reward,/assertRebootItemAllowed\(voucher\(1\)\)/);
 assert.match(reward,/assertRebootItemAllowed\(voucher\(2\)\)/);
 assert.match(reward,/if\(classesOnlyRebootEnabled\(\)\)return false/);
});
