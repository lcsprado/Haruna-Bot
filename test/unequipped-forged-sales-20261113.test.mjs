import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {equipmentSalePolicy,equipmentSaleQuantityAllowed} from '../src/neon/equipment-sale-policy.js';
import {selectEffectiveGear} from '../src/neon/equipment-star-logic.js';

const code=fs.readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
const start=code.indexOf('async function reconcileUnequippedSaleCopies(');
const end=code.indexOf('export async function sellItem(',start);
assert.ok(start>=0&&end>start,'reconciliation must exist');
const reconcile=new Function('selectEffectiveGear',code.slice(start,end)+';return reconcileUnequippedSaleCopies')(selectEffectiveGear);
const sale=code.slice(end,code.indexOf('export async function discardItemsBatch(',end));

function mock({tiers=[],forge=null,binds=[]}={}){
  const state={tiers:tiers.map(x=>({...x})),forge:forge?{...forge}:null,binds:binds.map(x=>({...x}))};
  const client={async query(sql,args){
    if(sql.startsWith('SELECT level,quantity FROM equipment_upgrade_copies'))return {rows:state.tiers.map(x=>({...x}))};
    if(sql.startsWith('SELECT stars,level FROM equipment_star_forges'))return {rows:state.forge?[{...state.forge}]:[]};
    if(sql.startsWith('DELETE FROM equipment_upgrade_copies')){state.tiers=state.tiers.filter(x=>x.level!==args[2]);return {rows:[]}};
    if(sql.startsWith('UPDATE equipment_upgrade_copies SET')){state.tiers.find(x=>x.level===args[2]).quantity-=args[3];return {rows:[]}};
    if(sql.startsWith('DELETE FROM equipment_star_forges')){state.forge=null;return {rows:[]}};
    if(sql.startsWith('SELECT source_key,quantity FROM bound_inventory_items'))return {rows:state.binds.map(x=>({...x}))};
    if(sql.startsWith('DELETE FROM bound_inventory_items')){state.binds=state.binds.filter(x=>x.source_key!==args[2]);return {rows:[]}};
    if(sql.startsWith('UPDATE bound_inventory_items SET')){state.binds.find(x=>x.source_key===args[2]).quantity-=args[3];return {rows:[]}};
    throw new Error('Unexpected query: '+sql);
  }};
  return {client,state};
}

test('WhatsApp manual single and batch sales preserve equipped weapon, shield and active relic',()=>{
  assert.match(sale,/stats\.shield_id===itemId \|\| activeRelic===itemId/);
  assert.match(sale,/stats\.shield_id===sel\.itemId \|\| activeRelic===sel\.itemId/);
  assert.match(sale,/owned-equipped/);
  assert.match(sale,/const minimumKeep=equipped\?1:0/);
  assert.match(sale,/reconcileUnequippedSaleCopies\(client,jid,itemId,owned,qty,equipped\)/);
  assert.match(sale,/reconcileUnequippedSaleCopies\(client,jid,sel\.itemId,owned,sel\.qty,equipped\)/);
});
test('unequipped forged copy may be sold, clearing forge metadata',async()=>{
  const {client,state}=mock({forge:{stars:5,level:10}});
  await reconcile(client,'player','sword',1,1,0);
  assert.equal(state.forge,null);
});
test('equipped forged copy is preserved while all other copies are sold',async()=>{
  const {client,state}=mock({tiers:[{level:3,quantity:1}],forge:{stars:5,level:10},binds:[{source_key:'event',quantity:2}]});
  await reconcile(client,'player','sword',3,2,1);
  assert.equal(state.forge.stars,5);
  assert.deepEqual(state.tiers,[]);
  assert.equal(state.binds.reduce((sum,b)=>sum+b.quantity,0),1);
});
test('unequipped enhanced copies and forge sell without leaving ghost metadata',async()=>{
  const {client,state}=mock({tiers:[{level:10,quantity:1}],forge:{stars:4,level:10}});
  await reconcile(client,'player','sword',2,2,0);
  assert.equal(state.forge,null);
  assert.deepEqual(state.tiers,[]);
});
test('inconsistent metadata cancels sale',async()=>{
  const {client}=mock({tiers:[{level:10,quantity:2}],forge:{stars:5,level:10}});
  await assert.rejects(()=>reconcile(client,'player','sword',2,1,0),/inconsistentes/);
});

test('V2 manual sale exposes an unequipped forged or bound copy in both menus',()=>{
  for(const info of [{hasForge:true},{upgradedQuantity:1},{boundQuantity:1},{hasForge:true,boundQuantity:1}]){
    const p=equipmentSalePolicy({quantity:1,...info});
    assert.equal(p.maxSellable,1);
    assert.equal(p.canSellAll,true);
    assert.equal(p.regularSellable,0);
    assert.equal(equipmentSaleQuantityAllowed(p,1,1),true);
  }
});
test('V2 sale permits free enhanced duplicates while protecting equipped and explicitly unsellable items',()=>{
  const p=equipmentSalePolicy({quantity:3,equipped:true,upgradedQuantity:2,hasForge:true});
  assert.equal(p.maxSellable,2);
  assert.equal(p.regularSellable,0);
  assert.equal(equipmentSaleQuantityAllowed(p,2,3),true);
  assert.equal(equipmentSaleQuantityAllowed(p,3,3),false);
  assert.equal(equipmentSalePolicy({quantity:1,equipped:true,hasForge:true}).maxSellable,0);
  assert.equal(equipmentSalePolicy({quantity:1,sellable:false}).maxSellable,0);
  assert.equal(equipmentSalePolicy({quantity:1,upgradedQuantity:2}).maxSellable,0);
});
test('selling a weaker forged reserve preserves the stronger equipped normal copy',async()=>{
  const {client,state}=mock({tiers:[{level:10,quantity:1}],forge:{stars:2,level:5}});
  await reconcile(client,'player','garras_vazio',2,1,1);
  assert.equal(state.forge,null);
  assert.deepEqual(state.tiers,[{level:10,quantity:1}]);
});
test('both manual interfaces use the expanded sellable quantity; loot retains its conservative limit',()=>{
  const wpp=fs.readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  const web=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
  assert.ok(!wpp.includes('Vendas parciais permitem apenas cópias Lv.1'));
  assert.ok(web.includes('Number(i.sellable_quantity||0)'));
  assert.ok(web.includes('inv.regular_sellable_quantity??inv.sellable_quantity'));
  assert.ok(!web.includes("best?.kind==='normal'&&tiers.some"));
});
