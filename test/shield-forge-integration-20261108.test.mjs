import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {ANTI_CRIT_SHIELDS,shieldForgeCost,antiCritShieldStats} from '../src/neon/anti-crit-shields.js'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const db=read('../src/neon/db.js')
const app=read('../src/neon/index.js')

test('seis escudos reconhecidos, quatro evoluções por modelo e preço definido',()=>{
  assert.equal(ANTI_CRIT_SHIELDS.length,6)
  assert.equal(shieldForgeCost('escudo_madeira',1),2000)
  assert.equal(shieldForgeCost('escudo_madeira',4),8000)
  assert.equal(shieldForgeCost('escudo_runico',1),22500)
  assert.equal(shieldForgeCost('escudo_runico',4),90000)
  assert.equal(shieldForgeCost('egide_celestial',1),50000)
  assert.equal(shieldForgeCost('bastiao_eclipse',1),125000)
  assert.equal(shieldForgeCost('escudo_runico',5),null)
  assert.equal(shieldForgeCost('qualquer',1),null)
})

test('forja melhora somente anti-crítico sem alterar atributos de ataque ou classes',()=>{
  for(const shield of ANTI_CRIT_SHIELDS){
    const low=antiCritShieldStats(shield.id,1,1)
    const stellar=antiCritShieldStats(shield.id,1,5)
    assert.ok(stellar.critResist>=low.critResist,shield.id)
    assert.ok(stellar.critGuard>=low.critGuard,shield.id)
    assert.ok(antiCritShieldStats(shield.id,10,5).critResist<=.20)
    assert.ok(antiCritShieldStats(shield.id,10,5).critGuard<=.30)
  }
  assert.equal(antiCritShieldStats('escudo_runico',10,5).critResist,.1044)
  assert.equal(antiCritShieldStats('bastiao_eclipse',10,5).critResist,.20)
})

test('os escudos entram na lista e a forja debita uma cópia e dinheiro atomicamente',()=>{
  const listing=db.split('export async function listStarForgeEquipment(')[1]?.split('export async function forgeEquipmentStar(')[0]||''
  const forge=db.split('export async function forgeEquipmentStar(')[1]?.split('export const listStarForgeWeapons=')[0]||''
  assert.match(listing,/ANTI_CRIT_SHIELDS\.map\(g=>g\.id\)/)
  assert.match(listing,/shieldForge\?stars<5/)
  assert.match(listing,/basicCopies>=2/)
  assert.match(listing,/Number\(r\.forged_level\)===10&&shieldDonorCopies>=1/)
  assert.match(listing,/Number\(r\.cash\)>=fee/)
  assert.match(forge,/return transaction\(async c=>/)
  assert.match(forge,/pg_advisory_xact_lock/)
  assert.match(forge,/if\(shieldForge\)/)
  assert.match(forge,/SELECT cash FROM wallets WHERE jid=\$1 FOR UPDATE/)
  assert.match(forge,/UPDATE inventories SET quantity=quantity-1/)
  assert.match(forge,/UPDATE wallets SET cash=cash-\$1/)
  assert.match(forge,/INSERT INTO equipment_star_forges/)
  assert.match(forge,/equipment_star_forge_shield/)
})

test('perfil e duelo PvP usam estrelas de escudo e bônus efetivos',()=>{
  assert.match(db,/const stars=await getEquipmentStarLevels\(jid,\[p\.weapon_id,p\.armor_id,p\.shield_id\]\)/)
  assert.match(db,/levels\[p\.shield_id\]\|\|1,stars\[p\.shield_id\]\|\|1/)
  assert.match(db,/shield_stars:Number\(sh\.stars\|\|1\)/)
  assert.match(db,/starLevel\(attackerJid,a\.shield_id\)/)
  assert.match(db,/starLevel\(defenderJid,b\.shield_id\)/)
  assert.match(app,/formatProfileShieldStars\(p\.shield_stars\|\|1\)/)
  assert.match(app,/latest\.shieldForge/)
  assert.match(app,/r\.shieldForge/)
  assert.match(app,/result\.cashSpent/)
})


test('forja de escudo executa em transação isolada sem ReferenceError, consumindo um doador e taxa',async()=>{
  // Executa a função real extraída do db.js contra um cliente SQL simulado.
  // Não conecta ao banco nem toca inventários de jogadores.
  const source=db.split('export async function forgeEquipmentStar(')[1]?.split('export const listStarForgeWeapons=')[0]
  assert.ok(source,'função de forja deve existir')
  const sqls=[]
  const client={async query(sql){
    const q=String(sql).replace(/\s+/g,' ').trim()
    sqls.push(q)
    if(q.includes('pg_advisory_xact_lock'))return {rows:[]}
    if(q.includes('FROM inventories inv JOIN items i'))return {rows:[{quantity:5,name:'Escudo Rúnico',category:'shield'}]}
    if(q.startsWith('SELECT stars,level FROM equipment_star_forges'))return {rows:[]}
    if(q.includes('FROM equipment_enchantments'))return {rows:[]}
    if(q.startsWith('SELECT quantity FROM equipment_upgrade_copies'))return {rows:[{quantity:0}]}
    if(q.startsWith('SELECT weapon_id,armor_id,shield_id FROM stats'))return {rows:[{shield_id:'escudo_runico'}]}
    if(q.includes('FROM bound_inventory_items'))return {rows:[{qty:0}]}
    if(q.includes('SUM(quantity)')&&q.includes('FROM equipment_upgrade_copies'))return {rows:[{qty:0}]}
    if(q.startsWith('SELECT cash FROM wallets'))return {rows:[{cash:100000}]}
    if(q.startsWith('UPDATE inventories SET quantity=quantity-1'))return {rowCount:1,rows:[{quantity:4}]}
    if(q.startsWith('UPDATE wallets SET cash='))return {rowCount:1,rows:[]}
    if(q.startsWith('INSERT INTO equipment_star_forges'))return {rowCount:1,rows:[]}
    if(q.startsWith('INSERT INTO transactions'))return {rowCount:1,rows:[]}
    throw new Error('SQL não simulado: '+q.slice(0,150))
  }}
  const sandbox={
    ANTI_CRIT_SHIELDS,RAID_GEAR_FORGE_ORIGINS:{},FORGE_STAR_MATERIALS:[],
    ensureUser:async()=>{},transaction:async action=>action(client),
    sevenSinsForgePlan:()=>{throw new Error('collab inesperado')},
    shieldForgeCost,equipmentStatsAtLevel:()=>({}),syncEffectiveGear:async()=>{},
    nowSql:'EXTRACT(EPOCH FROM NOW())::BIGINT'
  }
  const forge=vm.runInNewContext('async function forgeEquipmentStar('+source+'\nforgeEquipmentStar',sandbox)
  const result=await forge('fixture-player','escudo_runico',1)
  assert.equal(result.stars,2)
  assert.equal(result.copies,4)
  assert.equal(result.cashSpent,22500)
  assert.equal(result.shieldForge,true)
  assert.ok(sqls.some(sql=>sql.startsWith('UPDATE inventories SET quantity=quantity-1')))
  assert.ok(sqls.some(sql=>sql.startsWith('UPDATE wallets SET cash=')))
  assert.ok(sqls.some(sql=>sql.startsWith('INSERT INTO equipment_star_forges')))
  assert.ok(sqls.some(sql=>sql.startsWith('INSERT INTO transactions')))
})

test('forja de escudo protege equipamento vinculado/equipado sem cobrar taxa',async()=>{
  const source=db.split('export async function forgeEquipmentStar(')[1]?.split('export const listStarForgeWeapons=')[0]
  assert.ok(source)
  const sqls=[]
  const client={async query(sql){
    const q=String(sql).replace(/\s+/g,' ').trim()
    sqls.push(q)
    if(q.includes('pg_advisory_xact_lock'))return {rows:[]}
    if(q.includes('FROM inventories inv JOIN items i'))return {rows:[{quantity:5,name:'Escudo Rúnico',category:'shield'}]}
    if(q.startsWith('SELECT stars,level FROM equipment_star_forges'))return {rows:[]}
    if(q.includes('FROM equipment_enchantments'))return {rows:[]}
    if(q.startsWith('SELECT quantity FROM equipment_upgrade_copies'))return {rows:[{quantity:0}]}
    if(q.startsWith('SELECT weapon_id,armor_id,shield_id FROM stats'))return {rows:[{shield_id:'escudo_runico'}]}
    if(q.includes('FROM bound_inventory_items'))return {rows:[{qty:4}]}
    throw new Error('SQL não simulado: '+q.slice(0,150))
  }}
  const sandbox={
    ANTI_CRIT_SHIELDS,RAID_GEAR_FORGE_ORIGINS:{},FORGE_STAR_MATERIALS:[],
    ensureUser:async()=>{},transaction:async action=>action(client),
    sevenSinsForgePlan:()=>{throw new Error('collab inesperado')},
    shieldForgeCost,equipmentStatsAtLevel:()=>({}),syncEffectiveGear:async()=>{},
    nowSql:'EXTRACT(EPOCH FROM NOW())::BIGINT'
  }
  const forge=vm.runInNewContext('async function forgeEquipmentStar('+source+'\nforgeEquipmentStar',sandbox)
  await assert.rejects(forge('fixture-player','escudo_runico',1),/protegida/)
  assert.ok(!sqls.some(q=>/UPDATE (wallets|inventories)|INSERT INTO equipment_star_forges/.test(q)))
})
