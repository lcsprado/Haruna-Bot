import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const begin=db.indexOf('export async function cancelPetExpedition(jid,petId){')
const end=db.indexOf('export async function resolvePetExpeditions(jid){',begin)
const exit=begin>=0&&end>begin?db.slice(begin,end):''
const commandBegin=bot.indexOf("if(cmd==='expedicaopetsair'){")
const commandEnd=bot.indexOf("if(cmd==='expedicoespet'){",commandBegin)
const command=commandBegin>=0&&commandEnd>commandBegin?bot.slice(commandBegin,commandEnd):''
const menuBegin=bot.indexOf("if(flow.stage==='pet_expedition_exit_select'){")
const menuEnd=bot.indexOf("if(flow.stage==='pet_select'){",menuBegin)
const menu=menuBegin>=0&&menuEnd>menuBegin?bot.slice(menuBegin,menuEnd):''

test('new expedition-exit command is registered in pet router and import',()=>{
  assert.match(bot,/'expedicaopet','expedicoespet','expedicaopetsair'/)
  assert.match(bot,/startAllPetExpeditions, cancelPetExpedition,/)
  assert.match(bot,/\*!expedicaopetsair\* — escolher um pet/)
  assert.ok(command.length>0 && menu.length>0)
})

test('empty command presents ONLY currently running pets and asks for a numeric selection',()=>{
  assert.match(command,/getPetExpeditions\(sender\)/)
  assert.match(command,/filter\(x=>Number\(x\.ends_at\)>nowSec\)/)
  assert.match(command,/setQuickFlow\(chat,sender,'pet_expedition_exit_select',\{petIds:active\.map/)
  assert.match(command,/Responda somente o número/)
  assert.match(command,/cancela XP, dinheiro e itens/)
  assert.match(command,/Use \*?(!expedicoespet)/i)
})

test('selection maps list position to owner pet ID, without changing other pets',()=>{
  assert.match(menu,/const petId=Number\(petIds\[choice-1\]\)/)
  assert.match(menu,/cancelPetExpedition\(sender,petId\)/)
  assert.match(menu,/clearQuickFlow\(chat,sender\)/)
  assert.match(menu,/outros pets continuam em suas expedições/)
  assert.match(menu,/!expedicoespet/)
  assert.match(command,/cancelPetExpedition\(sender,Number\(requested\)\)/)
})

test('database cancellation is atomic, owner-scoped, and kept in the audit trail',()=>{
  assert.match(db,/ALTER TABLE pet_expeditions ADD COLUMN IF NOT EXISTS cancelled_at BIGINT/)
  assert.match(exit,/WHERE e\.jid=\$1 AND e\.pet_id=\$2 AND e\.resolved=FALSE/)
  assert.match(exit,/FOR UPDATE OF e,p/)
  assert.match(exit,/WHERE id=\$1 AND jid=\$2 AND resolved=FALSE AND ends_at>\$3/)
  assert.match(exit,/SET resolved=TRUE,cancelled_at=\$3/)
  assert.match(exit,/if\(changed\.rowCount!==1\) throw/)
})

test('completed expeditions are never cancelled or stripped of earned rewards',()=>{
  assert.match(exit,/if\(Number\(trip\.ends_at\)<=now\) throw/)
  assert.match(exit,/!expedicoespet para receber/)
  assert.doesNotMatch(exit,/UPDATE wallets|UPDATE pet_collection|INSERT INTO inventories|cash=cash\+/)
  assert.match(db,/export async function resolvePetExpeditions\(jid\)\{/)
  assert.match(db,/WHERE e\.jid=\$1 AND e\.resolved=FALSE AND e\.ends_at<=\$2/)
})

test('input validation prevents broad or accidental multi-expedition cancellation',()=>{
  assert.match(exit,/Number\.isSafeInteger\(id\)/)
  assert.match(command,/if\(!\/\^\[0-9\]\+\$\/\.test\(requested\)\)/)
  assert.match(menu,/Number\.isSafeInteger\(choice\)/)
  assert.doesNotMatch(exit,/DELETE FROM pet_expeditions/)
})
