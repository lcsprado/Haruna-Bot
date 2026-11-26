import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {RAID_WEAPON_BUILD_TIERS,V2_NEW_RAID_WEAPONS,v2RaidWeaponItemRows,v2RaidWeaponOrigins,v2RaidWeaponStats,expandV2RaidWeapons,expandedV2GearChance,V2_EXISTING_RAID_WEAPON_NAMES,v2RaidWeaponDisplayName} from '../src/neon/v2-raid-weapon-builds.js'
test('four archetypes per eligible tier, globally unique ids, exclusive sources',()=>{
 assert.equal(V2_NEW_RAID_WEAPONS.length,25)
 assert.equal(new Set(V2_NEW_RAID_WEAPONS.map(w=>w.id)).size,25)
 assert.deepEqual(RAID_WEAPON_BUILD_TIERS.map(t=>t.level),[15,20,25,30,40,50,60,65,70])
 for(const t of RAID_WEAPON_BUILD_TIERS){
  assert.deepEqual([...Object.keys(t.existing),...t.weapons.map(w=>w.role)].sort(),['berserker','necromancer','paladin','samurai'])
  for(const w of t.weapons){
   assert.equal(w.materialId,t.materialId)
   assert.equal(w.rarity,t.level<40?'epic':'legendary')
   assert.ok(w.atk<=Math.ceil(t.anchor*1.05))
   assert.ok(w.def<=Math.ceil(t.anchor*.23))
   assert.ok(w.hp<=Math.ceil(t.anchor*.71))
   assert.ok(w.crit<=.04)
   assert.ok(w.spd<=8)
   if(w.role==='berserker'){assert.equal(w.hp+w.def+w.crit+w.spd,0)}
  }
 }
})
test('seeding, stats, forging and legacy isolation',()=>{
 const rows=v2RaidWeaponItemRows(true),stats=v2RaidWeaponStats(true),origins=v2RaidWeaponOrigins(true)
 assert.equal(rows.length,25)
 for(const w of V2_NEW_RAID_WEAPONS){
  const r=rows.find(x=>x[0]===w.id)
  assert.equal(r[4],0)
  assert.equal(stats[w.id].atk,w.atk)
  assert.equal(origins[w.id].materialId,w.materialId)
 }
 assert.deepEqual(v2RaidWeaponItemRows(false),[])
 assert.deepEqual(v2RaidWeaponStats(false),{})
 assert.deepEqual(v2RaidWeaponOrigins(false),{})
})
test('one uniform drop roll, preserved individual old odds in all ordinary rate ranges',()=>{
 for(const tier of RAID_WEAPON_BUILD_TIERS){
  const old={level:tier.level,gear:[...Object.values(tier.existing),'old_armor',...(tier.level===60||tier.level===65||tier.level===70?['old_extra']:[])]}
  const next=expandV2RaidWeapons(old,true)
  assert.equal(next.gear.length,old.gear.length+tier.weapons.length)
  assert.equal(expandV2RaidWeapons(next,true),next)
  assert.equal(expandV2RaidWeapons(old,false),old)
  for(const chance of [0,.003,.005,.012,.025,.05,.12]){
   const expanded=expandedV2GearChance(next,chance)
   assert.ok(Math.abs(expanded/next.gear.length-chance/old.gear.length)<1e-12)
   assert.ok(expanded<=.30+1e-12)
   assert.equal(expandedV2GearChance(old,chance),chance)
  }
 }
 const starter={level:10,gear:null}
 assert.equal(expandV2RaidWeapons(starter,true),starter)
})
test('production integration points include all new ids and no new combat multipliers',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 assert.ok(db.includes('starterItems.push(...v2RaidWeaponItemRows(classesOnlyRebootEnabled()))'))
 assert.ok(db.includes('...v2RaidWeaponStats(classesOnlyRebootEnabled())'))
 assert.ok(db.includes('...v2RaidWeaponOrigins(classesOnlyRebootEnabled())'))
 for(const w of V2_NEW_RAID_WEAPONS)assert.ok(db.includes("WHEN '"+w.id+"' THEN '"+w.materialId+"'"))
 assert.ok(games.includes('expandV2RaidWeapons(candidateRaidConfig(raidConfig(level)),classesOnlyRebootEnabled())'))
 assert.ok(games.includes('expandedV2GearChance(cfg,loteReduced?raidLoteGearChance(normalChance):normalChance)'))
})

test('approved names are unique; V2 renames leave legacy and all existing item IDs intact',()=>{
 const newNames=V2_NEW_RAID_WEAPONS.map(w=>w.name)
 const existingNames=Object.values(V2_EXISTING_RAID_WEAPON_NAMES)
 assert.equal(new Set([...newNames,...existingNames]).size,36)
 assert.equal(v2RaidWeaponDisplayName('katana_divina','Katana Divina',true),'Shinkage')
 assert.equal(v2RaidWeaponDisplayName('katana_divina','Katana Divina',false),'Katana Divina')
 assert.equal(v2RaidWeaponDisplayName('armadura_divina','Armadura Divina',true),'Armadura Divina')
 assert.ok(newNames.includes('Ragnarok'))
 assert.ok(newNames.includes('Thanatos'))
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 for(const id of Object.keys(V2_EXISTING_RAID_WEAPON_NAMES))
  assert.ok(db.includes("v2RaidWeaponDisplayName('"+id+"',"))
 assert.ok(db.includes('v2RaidWeaponDisplayName(item[0],item[1],classesOnlyRebootEnabled())'))
})
