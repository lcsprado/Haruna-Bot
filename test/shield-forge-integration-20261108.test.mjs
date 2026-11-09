import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ANTI_CRIT_SHIELDS,shieldForgeCost,antiCritShieldStats} from '../src/neon/anti-crit-shields.js'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const db=read('../src/neon/db.js')
const app=read('../src/neon/index.js')

test('cinco escudos reconhecidos, quatro evoluções por modelo e preço definido',()=>{
  assert.equal(ANTI_CRIT_SHIELDS.length,5)
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
  assert.match(listing,/basicCopies>=1/)
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
  assert.match(app,/forgeStarsIcon\(p\.shield_stars\|\|1\)/)
  assert.match(app,/latest\.shieldForge/)
  assert.match(app,/r\.shieldForge/)
  assert.match(app,/result\.cashSpent/)
})
