import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {gearStatsWithEnchants} from '../src/neon/equipment-enchant-view.js'

// Evita regressao: 4 estrelas +12%, 5 estrelas +16%.
// A pedra de Precisao acrescenta 1 ponto percentual (nao 1% relativo).
const source=readFileSync(new URL('../src/neon/enchantments-alpha.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const base={atk:150,spd:16,crit:0.025}
function stats(level,stars){
  const mult=[1,1.10,1.22,1.36,1.52,1.70,1.90,2.10,2.30,2.50][level-1]
  const sm=1+0.04*(stars-1)
  return {atk:Math.round(base.atk*mult*sm),spd:Math.round(base.spd*mult*sm),crit:Number((base.crit*mult*sm).toFixed(6))}
}
const onePrecision=[{stone_id:'precision',quantity:1}]
const stones={precision:{stat:'crit',value:0.01}}
test('enchantment preview uses active star tier, never just common gear stats',()=>{
  assert.match(source,/getEquipmentStarLevels\(jid,ids\)/)
  assert.match(source,/equipmentStatsAtLevel\(itemId,level,stars\)/)
  assert.match(source,/previewEquipmentEnchantment\(r\.item_id,r\.level,enchantByItem\.get\(r\.item_id\)\|\|\[\],stoneId,starLevels\[r\.item_id\]\|\|1\)/)
  assert.match(db,/Number\(r\.level\)===Number\(r\.effective\)\?Number\(r\.stars\):1/)
})
test('Courechouse 4 stars Lv.10 before stone applies 12 percent then +1pp crit',()=>{
  const before=stats(10,4)
  const after=gearStatsWithEnchants(before,onePrecision,stones)
  assert.deepEqual(before,{atk:420,spd:45,crit:0.07})
  assert.equal(Math.round(after.crit*10000)/100,8)
})
test('Courechouse 5 stars Lv.1 and Lv.10 retain precision with correct final stats',()=>{
  const first=gearStatsWithEnchants(stats(1,5),onePrecision,stones)
  const final=gearStatsWithEnchants(stats(10,5),onePrecision,stones)
  assert.deepEqual(first,{atk:174,spd:19,crit:0.039})
  assert.deepEqual({atk:final.atk,spd:final.spd},{atk:435,spd:46})
  assert.ok(Math.abs(final.crit-0.0825)<1e-10)
})
