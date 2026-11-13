import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code=fs.readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
const get=code.slice(code.indexOf('export async function getInventory('),code.indexOf('async function reconcileWebSaleCopies('));
const sale=code.slice(code.indexOf('export async function sellItem('),code.indexOf('export async function discardItemsBatch('));
test('Web inventory identifies equipped shields and reserves one copy',()=>{
  assert.match(get,/s\.shield_id=i\.item_id/);
  assert.match(get,/WHEN s\.shield_id=i\.item_id THEN 'shield'/);
  assert.match(sale,/stats\.shield_id===itemId \|\| activeRelic===itemId/);
});
test('Web manual sale accepts forged unequipped copies, while shield and relic stay protected in batch',()=>{
  assert.match(sale,/reconcileWebSaleCopies\(client,jid,itemId,owned,qty,equipped\)/);
  assert.match(sale,/stats\.shield_id===sel\.itemId \|\| activeRelic===sel\.itemId/);
});
