import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const enchant=readFileSync(new URL('../src/neon/enchantments-alpha.js',import.meta.url),'utf8')
const forge=db.split('export async function forgeEquipmentStar(')[1]?.split('export const listStarForgeWeapons=')[0]||''
const upgrade=db.split('export async function upgradeEquipment(')[1]?.split('export async function equipItem(')[0]||''

test('forging keeps the same permanent stone rows and aborts the transaction if they change',()=>{
  assert.match(forge,/SELECT stone_id,quantity FROM equipment_enchantments WHERE jid=\$1 AND item_id=\$2 ORDER BY stone_id FOR UPDATE/)
  assert.match(forge,/await syncEffectiveGear\(c,jid,itemId\)/)
  assert.match(forge,/JSON\.stringify\(enchantments\)!==JSON\.stringify\(enchantmentsBefore\)/)
  assert.match(forge,/forja cancelada sem consumir recursos/)
  assert.match(forge,/origin,enchantments,before/)
  assert.doesNotMatch(forge,/(DELETE FROM|UPDATE) equipment_enchantments/)
})

test('level upgrades return the saved enchantments without consuming stones',()=>{
  assert.match(upgrade,/SELECT stone_id,quantity FROM equipment_enchantments/)
  assert.match(upgrade,/cash:Number\(money\?\.cash\|\|0\),enchantments,before/)
  assert.doesNotMatch(upgrade,/(DELETE FROM|UPDATE) equipment_enchantments/)
})

test('WhatsApp forging and upgrading show saved enchantments and their actual effect',()=>{
  assert.match(index,/import \{STONES,initEnchantments/)
  assert.match(index,/const enchantmentsReceipt=rows=>/)
  assert.match(index,/STONES\[row\.stone_id\]\.label/)
  assert.match(index,/enchantmentsReceipt\(result\.enchantments\)/)
  assert.match(index,/enchantmentsReceipt\(r\.enchantments\)/)
  assert.match(enchant,/pedra_precisao_alpha:\{name:'Pedra da Precisão',stat:'crit',value:\.01/)
  assert.match(enchant,/PRIMARY KEY\(jid,item_id,stone_id\)/)
})
