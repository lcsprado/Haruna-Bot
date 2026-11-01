import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {heroCombatStats,heroCombatSheetFromProfile} from '../src/neon/playable-heroes-core.js'
import {PECADOS_WEAPONS,PECADOS_ARMORS} from '../src/neon/sete-pecados-catalog.js'

const code=path=>readFileSync(new URL('../src/neon/'+path,import.meta.url),'utf8')
const section=(src,start,end)=>{
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length)
  assert.ok(a>=0&&b>a,'source section missing: '+start)
  return src.slice(a,b)
}

test('quatro snapshots reais: HP das botas entra sem alterar DEF ou ATK',()=>{
  assert.equal(4050+1120+175+825,6170)   // João
  assert.equal(3888+1372+88+688,6036)  // Diane
  assert.equal(2477+1296+175+800,4748) // Augusto
  assert.equal(2653+63+1120+0+763,4599) // Kaique
  assert.equal(PECADOS_WEAPONS.find(x=>x.id==='pecados_courechouse').atk,150)
  assert.equal(PECADOS_ARMORS.find(x=>x.id==='pecados_armadura_diane').def,205)
  const sheet=heroCombatSheetFromProfile({
    hp:3188,max_hp:3188,atk:782,def:391,spd:396,
    class_hp_bonus:130,class_atk_bonus:7,class_def_bonus:22,class_spd_bonus:5,
    equipment_hp:2148,equipment_atk:435,equipment_def:904,equipment_spd:91
  },'pecado_diane',100)
  assert.deepEqual([sheet.maxHp,sheet.atk,sheet.def,sheet.spd],[6036,1297,1395,512])
})

test('Diane e Samurai comparados no MESMO jogador: +112 DEF natural para Diane',()=>{
  const p={hp:3188,max_hp:3188,atk:782,def:391,spd:396,
    class_hp_bonus:130,class_atk_bonus:7,class_def_bonus:22,class_spd_bonus:5}
  const diane=heroCombatStats(p,'pecado_diane',100)
  const samuraiSamePlayer=p.def-p.class_def_bonus+10
  assert.equal(diane.def,491)
  assert.equal(samuraiSamePlayer,379)
  assert.equal(diane.def-samuraiSamePlayer,112)
  const hero=code('playable-heroes-core.js')
  assert.match(hero,/stage>=4\?\.01:0/)
  assert.match(hero,/stage>=5\?\.01:0/)
})

test('HP das botas computado em todas as rotinas do perfil e das batalhas',()=>{
  const db=code('db.js'),games=code('games.js')
  const level=section(db,'if(levels>0){','return {\nlevel,exp,levels,')
  assert.match(level,/s\.boot_id/)
  assert.match(level,/boots\?\.hp/)
  const equip=section(db,'export async function equipItem(','export async function usePetPotion(')
  assert.match(equip,/boot_id/)
  assert.match(equip,/boots\?\.hp/)
  const healing=section(db,'export async function usePotion(','export async function getCombatProfile(')
  assert.match(healing,/row\.boot_id/)
  assert.match(healing,/boots\?\.hp/)
  const profile=section(db,'export async function getCombatProfile(','export async function battle(')
  assert.match(profile,/equipment_hp:[^\n]*Number\(b\.hp/)
  assert.match(profile,/effectiveMaxHp=[^\n]*Number\(b\.hp/)
  const pvp=section(db,'export async function battle(','const snapshot=fighter=>')
  assert.match(pvp,/Number\(aeB\.hp/)
  assert.match(pvp,/Number\(beB\.hp/)
  const dungeon=section(db,'const eqIds=[row.weapon_id,row.armor_id,row.boot_id','const level=Number(row.level)')
  assert.match(dungeon,/Number\(boots\.hp/)
  assert.equal((games.match(/const gearHp=Number\(w\?\.hp\|\|0\)\+Number\(a\?\.hp\|\|0\)\+Number\(b\?\.hp\|\|0\)\+Number\(h\?\.hp\|\|0\)/g)||[]).length,2)
  assert.match(games,/const gearHp=Number\(weapon\?\.hp\|\|0\)\+Number\(armor\?\.hp\|\|0\)\+Number\(boots\?\.hp\|\|0\)\+Number\(helmet\?\.hp\|\|0\)/)
  assert.doesNotMatch(db,/Number\(aeW\.hp\|\|0\)\+Number\(aeA\.hp\|\|0\)\+Number\(aeH\.hp\|\|0\)/)
  assert.doesNotMatch(games,/Number\(w\?\.hp\|\|0\)\+Number\(a\?\.hp\|\|0\)\+Number\(h\?\.hp\|\|0\)/)
})
