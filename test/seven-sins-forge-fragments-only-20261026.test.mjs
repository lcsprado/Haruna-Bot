import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {sevenSinsForgePlan} from '../src/neon/seven-sins-forge-plan.js'
import {PECADOS_GEAR_IDS} from '../src/neon/sete-pecados-catalog.js'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const db=read('../src/neon/db.js')
const app=read('../src/neon/index.js')
const collab=read('../src/neon/sete-pecados-collab.js')
const forge=db.split('export async function forgeEquipmentStar(')[1].split('export const listStarForgeWeapons=')[0]
const upgrade=db.split('export async function upgradeEquipment(')[1].split('export async function equipItem(')[0]

test('14 equipamentos de collab elegiveis, com fragmento no lugar de copia',()=>{
  assert.equal(PECADOS_GEAR_IDS.length,14)
  assert.equal(new Set(PECADOS_GEAR_IDS).size,14)
  assert.match(db,/\.\.\.Object\.fromEntries\(PECADOS_GEAR_IDS\.map/)
  for(const id of PECADOS_GEAR_IDS)assert.ok(db.includes("WHEN '"+id+"' THEN 'fragmento_ascensao_pecados_20261024'"),id)
  assert.match(db,/collab:true/)
})

test('uma unica arma comum Lv.10 forja ★★ por 30 fragmentos sem consumir copia',()=>{
  const p=sevenSinsForgePlan({stars:1,commonLv10Copies:1,owned:1,fragments:30,requiredFragments:30})
  assert.equal(p.canForge,true)
  assert.equal(p.donorUpgradeRows,1)
  assert.equal(p.inventoryCopiesConsumed,0)
  assert.equal(p.requiredCopies,1)
  assert.equal(sevenSinsForgePlan({stars:1,commonLv10Copies:0,owned:1,fragments:300,requiredFragments:30}).canForge,false)
  assert.equal(sevenSinsForgePlan({stars:1,commonLv10Copies:1,owned:1,fragments:29,requiredFragments:30}).canForge,false)
})

test('estrela seguinte usa a propria peca forjada Lv.10; nenhuma copia comum adicional',()=>{
  for(const [stars,cost] of [[2,50],[3,80],[4,120]]){
    const p=sevenSinsForgePlan({stars,commonLv10Copies:0,forgedLevel:10,owned:1,fragments:cost,requiredFragments:cost})
    assert.equal(p.canForge,true,stars+' estrela')
    assert.equal(p.donorUpgradeRows,0)
    assert.equal(p.inventoryCopiesConsumed,0)
    assert.equal(sevenSinsForgePlan({stars,forgedLevel:9,owned:1,fragments:999,requiredFragments:cost}).canForge,false)
  }
  assert.equal(sevenSinsForgePlan({stars:5,forgedLevel:10,owned:1,fragments:1000}).canForge,false)
})

test('forja especial nao altera a mecanica de doadores das Raids normais',()=>{
  assert.match(forge,/const donors=collab\?sevenSinsForgePlan\(\{stars\}\)\.donorUpgradeRows:\(stars===1\?2:1\)/)
  assert.match(forge,/const units=collab\?\{rowCount:1/)
  assert.match(forge,/await syncEffectiveGear\(c,jid,itemId\)/)
  assert.match(forge,/equipment_star_forge_collab_fragments/)
  assert.match(db,/const canForge=collab\?special\.canForge:stars<5/)
  assert.match(app,/if\(!r\.collab&&\(r\.quantity<2\|\|r\.free<1\)\)/)
})

test('nenhum comando antigo ou upgrade usa Fragmentos da Ascensao para evoluir',()=>{
  assert.match(upgrade,/if\(payment!=='cash'\)/)
  assert.doesNotMatch(upgrade,/usingCollabFragments/)
  assert.doesNotMatch(collab,/growCollabHero\(/)
  assert.doesNotMatch(collab,/upgradeEquipment\(/)
  assert.match(collab,/Uso exclusivo: Forja Estelar/)
  assert.match(app,/Fragmentos substituem cópias extras/)
})

test('reiniciar nao recria copia Lv.10 fantasma de equipamento ja forjado',()=>{
  assert.match(db,/AND NOT EXISTS \(SELECT 1 FROM equipment_star_forges sf WHERE sf.jid=e.jid AND sf.item_id=e.item_id\)/)
  const positionForgeTable=db.indexOf('CREATE TABLE IF NOT EXISTS equipment_star_forges(')
  const positionLegacyImport=db.indexOf('SELECT e.jid,e.item_id,e.level,1 FROM equipment_upgrades e')
  assert.ok(positionForgeTable<positionLegacyImport)
})

test('companheiros da collab nao recebem o rotulo publico de personagem',()=>{
  assert.match(collab,/COMPANHEIROS DE AVENTURA/)
  assert.match(collab,/COMPANHEIRO REPETIDO/)
  assert.match(collab,/COMPANHEIRO DE AVENTURA/)
})
