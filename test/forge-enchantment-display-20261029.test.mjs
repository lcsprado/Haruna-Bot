import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {gearStatsWithEnchants} from '../src/neon/equipment-enchant-view.js'
const stones={
  furia:{stat:'damage',value:.02},
  forca:{stat:'atk',value:5},
  fortaleza:{stat:'def',value:5},
  agilidade:{stat:'spd',value:2},
  precisao:{stat:'crit',value:.01}
}
test('forja Lv.10 -> Lv.1 mostra os encantamentos com atributos da nova base',()=>{
  const original={atk:200,def:0,spd:0,crit:.05}
  const after={atk:80,def:0,spd:0,crit:.02}
  const rows=[{stone_id:'forca',quantity:2},{stone_id:'precisao',quantity:1},{stone_id:'furia',quantity:1}]
  assert.deepEqual(gearStatsWithEnchants(after,rows,stones),{atk:90,def:0,spd:0,crit:.03})
  assert.equal(after.atk,80)
  assert.equal(original.atk,200)
})
test('encantamentos de diferentes categorias somam sem mutar a base',()=>{
  const base={atk:0,def:20,spd:10,crit:0}
  const rows=[{stone_id:'fortaleza',quantity:2},{stone_id:'agilidade',quantity:1},{stone_id:'nao_existe',quantity:3}]
  assert.deepEqual(gearStatsWithEnchants(base,rows,stones),{atk:0,def:30,spd:12,crit:0})
  assert.deepEqual(base,{atk:0,def:20,spd:10,crit:0})
})
test('teto seguro no recibo e modelo não perde pedras na transação',()=>{
  assert.equal(gearStatsWithEnchants({atk:1},[{stone_id:'forca',quantity:99}],stones).atk,16)
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const forge=db.split('export async function forgeEquipmentStar(')[1]?.split('export const listStarForgeWeapons=')[0]||''
  assert.match(forge,/SELECT stone_id,quantity FROM equipment_enchantments WHERE jid=\$1 AND item_id=\$2 ORDER BY stone_id FOR UPDATE/)
  assert.match(forge,/JSON\.stringify\(enchantments\)!==JSON\.stringify\(enchantmentsBefore\)/)
  assert.doesNotMatch(forge,/(DELETE FROM|UPDATE) equipment_enchantments/)
})
test('mensagens de WhatsApp exibem base e encantamentos juntos',()=>{
  const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(source,/gearStatsWithEnchants\(result\.after,result\.enchantments,STONES\)/)
  assert.match(source,/gearStatsWithEnchants\(r\.stats,r\.enchantments,STONES\)/)
})
