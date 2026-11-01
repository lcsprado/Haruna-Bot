import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {selectEffectiveGear} from '../src/neon/equipment-star-logic.js'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const logic=readFileSync(new URL('../src/neon/equipment-star-logic.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const migration=db.split('CREATE TABLE IF NOT EXISTS equipment_star_forges(')[1]?.split('CREATE TABLE IF NOT EXISTS alpha_xp_boosts (')[0]||''
const forge=db.split('export async function forgeEquipmentStar(')[1]?.split('export const listStarForgeWeapons=')[0]||''
const upgrade=db.split('export async function upgradeEquipment(')[1]?.split('export async function equipItem(')[0]||''

test('starred Lv.1 is independent of paid ordinary Lv.10',()=>{
  assert.deepEqual(selectEffectiveGear(10,1,2),{level:10,stars:1})
  assert.deepEqual(selectEffectiveGear(1,1,2),{level:1,stars:2})
  assert.deepEqual(selectEffectiveGear(10,10,2),{level:10,stars:2})
  assert.deepEqual(selectEffectiveGear(10,9,2),{level:10,stars:1})
})

test('existing starred row gains its own Lv.1 without deleting upgrades',()=>{
  assert.match(migration,/level INTEGER NOT NULL DEFAULT 1/)
  assert.match(migration,/ALTER TABLE equipment_star_forges ADD COLUMN IF NOT EXISTS level/)
  assert.match(migration,/UPDATE equipment_star_forges SET level=1 WHERE level IS NULL/)
  assert.match(migration,/ALTER COLUMN level SET NOT NULL/)
  assert.doesNotMatch(migration,/(UPDATE|DELETE)\s+equipment_upgrade_copies/i)
  assert.doesNotMatch(migration,/UPDATE\s+equipment_upgrades/i)
})

test('star tier progression and donor consumption are guarded and atomic',()=>{
  assert.match(forge,/return transaction\(async c=>/)
  assert.match(forge,/pg_advisory_xact_lock/)
  assert.match(forge,/if\(stars>1&&level!==10\)/)
  assert.match(forge,/const donors=collab\?sevenSinsForgePlan\(\{stars\}\)\.donorUpgradeRows/)
  assert.match(forge,/const units=collab\?/)
  assert.match(forge,/if\(Number\(paid\?\.quantity\|\|0\)<donors\)/)
  assert.match(forge,/DELETE FROM equipment_upgrade_copies WHERE jid=\$1 AND item_id=\$2 AND level=10 AND quantity=\$3 RETURNING 1/)
  assert.match(forge,/quantity>\$3 RETURNING 1/)
  assert.match(forge,/VALUES\(\$1,\$2,\$3,1,/)
  assert.match(forge,/level=1,updated_at=EXCLUDED.updated_at/)
  assert.match(forge,/await syncEffectiveGear\(c,jid,itemId\)/)
})

test('ordinary upgrades never decrement a checked quantity to zero',()=>{
  assert.match(upgrade,/const oldQty=Number\(tiers.find/)
  assert.match(upgrade,/oldQty===1/)
  assert.match(upgrade,/DELETE FROM equipment_upgrade_copies WHERE jid=\$1 AND item_id=\$2 AND level=\$3 AND quantity=1 RETURNING 1/)
  assert.match(upgrade,/quantity>1 RETURNING 1/)
  assert.match(upgrade,/if\(!moved.rowCount\)/)
  assert.match(upgrade,/if\(isStar\)/)
  assert.match(upgrade,/UPDATE equipment_star_forges SET level=\$3/)
})

test('the WhatsApp forge menu discloses stars, level, shortages and Lv.1 reset',()=>{
  const menu=index.split("} else if(['forjar','forja','forjaestelar'].includes(cmd)){")[1]?.split("} else if(['uparitem'")[0]||''
  assert.match(menu,/r\.forged_level/)
  assert.match(menu,/r\.level10_copies/)
  assert.match(menu,/r\.needed/)
  assert.match(menu,/PRONTO PARA FORJAR/)
  assert.match(menu,/Falta:/)
  assert.match(menu,/Lv\.1/)
  assert.match(index,/if\(latest\.stars>1&&latest\.forged_level<10\)/)
  assert.match(index,/forgeEquipmentStar\(sender,chosen\.itemId,chosen\.stars\)/)
})

test('effective level and star bonus come from the same physical forged copy',()=>{
  assert.match(logic,/SELECT level,stars FROM equipment_star_forges/)
  assert.match(logic,/MAX\(level\),1/)
  assert.match(db,/Number\(r\.level\)===Number\(r\.effective\)/)
  assert.match(db,/multipliers\[level-1\]/)
  assert.match(db,/const starMult=1\+\.04\*\(starLevel-1\)/)
})

test('Raid HP uses stars only on real forged equipment level',()=>{
  // A forged Lv.1 must never lend ★★ HP to a separate ordinary Lv.10.
  const start=games.split('export async function startRaid(')[1]?.split('export async function raidRound(')[0]||''
  assert.ok(start,'Raid starting routine missing')
  assert.match(start,/SELECT jid,item_id,stars,level FROM equipment_star_forges/)
  assert.match(start,/Number\(forged\.level\)===lev\(itemId\)\?Number\(forged\.stars\):1/)
  assert.match(start,/const weaponStars=activeStars\(st\.weapon_id\)/)
  assert.match(start,/const armorStars=activeStars\(st\.armor_id\)/)
  assert.match(start,/const gearHp=Number\(w\?\.hp\|\|0\)\+Number\(a\?\.hp\|\|0\)\+Number\(b\?\.hp\|\|0\)\+Number\(h\?\.hp\|\|0\)/)
})

test('Titan armor HP preview follows real level rather than multiplying a maxed forged copy',()=>{
  const titanBaseHp=110
  const lv10Scale=2.5
  const twoStarMult=1.04
  assert.equal(Math.round(titanBaseHp*twoStarMult),114)
  assert.equal(Math.round(titanBaseHp*lv10Scale),275)
  assert.equal(Math.round(titanBaseHp*lv10Scale*twoStarMult),286)
  assert.deepEqual(selectEffectiveGear(10,1,2),{level:10,stars:1})
})


test('level-up restores actual max HP including equipped armor, helmet and star level',()=>{
  const levelup=db.split('async function applyExp(')[1]?.split('export function getEquipmentInfo(')[0]||''
  assert.ok(levelup,'XP processing routine missing')
  assert.match(levelup,/COALESCE\(ua\.level,1\)/)
  assert.match(levelup,/COALESCE\(uh\.level,1\)/)
  assert.match(levelup,/fw\.level=COALESCE\(uw\.level,1\)/)
  assert.match(levelup,/fa\.level=COALESCE\(ua\.level,1\)/)
  assert.match(levelup,/equipmentStatsAtLevel\(st\.armor_id,st\.armor_level,st\.armor_stars\)/)
  assert.match(levelup,/equipmentStatsAtLevel\(st\.helmet_id,st\.helmet_level\)/)
  assert.match(levelup,/Number\(st\?\.max_hp\|\|100\)\+levels\*8\+gearHp/)
  assert.match(levelup,/hp=\$5/)
  assert.doesNotMatch(levelup,/(?:^|\n)\s*hp=max_hp\+\$1/)
  // A pre-existing XP routine always refills HP; it must now refill to the equipped limit.
  assert.equal(2886+8+Math.round(230*2.5)+Math.round(260*2.5),4119)
})

test('WhatsApp upgrade menu visibly separates common armor from starred armor with correct HP',()=>{
  const menu=index.split("} else if(['uparitem','upgradeitem','melhoraritem'")[1]?.split("} else if(['equipar','equip'].includes(cmd))")[0]||''
  assert.match(menu,/equipmentCopyLabel\(i\)/)
  assert.match(menu,/gearStatsChanges\(gearStatsWithEnchants\(i\.current/)
  assert.match(index,/const forgeStarsIcon=stars=>/)
  assert.match(index,/const equipmentCopyLabel=i=>i\.sourceKind==='star'/)
  assert.match(index,/FORJADA/)
  assert.match(index,/COMUM/)
  assert.match(menu,/Lv\.'/)
  assert.match(menu,/Cada cópia mantém seus atributos/)
  assert.equal(Math.round(85*1.04),88)
  assert.equal(Math.round(85*1.1*1.04),97)
  assert.equal(Math.round(110*1.04),114)
  assert.equal(Math.round(110*1.1*1.04),126)
  assert.equal(Math.round(85*1.1),94)
  assert.equal(Math.round(110*1.1),121)
})

test('WhatsApp equip menu calculates each independent copy and labels the active tier',()=>{
  const menu=index.split('async function showEquipmentTypeMenu(chat,sender,reply,category){')[1]?.split('async function showSellMenu(chat,sender,reply){')[0]||''
  assert.match(menu,/i\.upgrade_distribution/)
  assert.match(menu,/equipmentStatsAtLevel\(i\.item_id,level,stars\)/)
  assert.match(menu,/forgeStarsIcon\(stars\)/)
  assert.match(menu,/activeCopyLabel\(isHelmet\?\{\.\.\.p,helmet_level:Number\(i\.equipment_level\|\|1\)\}:p,category\)/)
  assert.match(menu,/COMUM/)
  assert.match(menu,/FORJADA/)
  assert.doesNotMatch(menu,/copySummary\|\|/)
  const comparison=index.split("if(flow.stage==='equip_select'){")[1]?.split("if(flow.stage==='equip_compare_confirm'){")[0]||''
  assert.match(comparison,/Number\(up\?\.forged_level\|\|0\)===Number\(up\?\.level\|\|1\)/)
  assert.match(comparison,/forgeStarsIcon\(selectedStars\)/)
  assert.doesNotMatch(comparison,/up\?\.activeStars/)
})
