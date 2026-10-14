import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
test('Comando específico do elmo está disponível e isolado',()=>{
 assert.match(app,/\['uparitem','upgradeitem','melhoraritem','uparelmo','melhorarelmo','upgradeelmo'\]/)
 assert.match(app,/const helmetOnly=\['uparelmo','melhorarelmo','upgradeelmo'\]\.includes\(cmd\)/)
 assert.match(app,/helmetOnly\?items\.filter\(i=>i\.category==='helmet'\):items/)
 assert.match(app,/setQuickFlow\(chat,sender,'upgrade_select'/)
})
test('Elmos de evento são cadastrados na mesma evolução de armas e armaduras',()=>{
 for(const id of ['elmo_aurora','elmo_soberano_golem','elmo_labirinto_alpha'])
  assert.match(db,new RegExp(id+": \\{category:'helmet'"))
 assert.match(db,/i\.category IN \('weapon','armor','boots','helmet'\)/)
 assert.match(db,/const EQUIPMENT_MAX_LEVEL=10/)
 assert.match(db,/upgradeEquipment\(jid,itemId,targetLevel=null\)/)
 assert.match(db,/cost\+=equipmentUpgradeCost\(inv\.rows\[0\]\.rarity,lv\)/)
})
