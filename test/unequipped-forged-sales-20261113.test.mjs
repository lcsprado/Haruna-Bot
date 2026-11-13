import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code=fs.readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
const start=code.indexOf('async function reconcileUnequippedSaleCopies(');
const end=code.indexOf('export async function sellItem(',start);
assert.ok(start>=0&&end>start,'reconciliation must exist');
const reconcile=new Function(code.slice(start,end)+';return reconcileUnequippedSaleCopies')();
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
