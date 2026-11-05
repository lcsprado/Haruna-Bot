import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const span=(text,begin,end)=>{
  const start=text.indexOf(begin)
  assert.ok(start>=0,begin+' not found')
  const finish=text.indexOf(end,start+begin.length)
  assert.ok(finish>start,end+' not found')
  return text.slice(start,finish)
}
const helper=span(db,"async function summonLegendaryPetTx(client,jid,altar){","export async function summonLegendaryPet(jid,materialId){")
const single=span(db,"export async function summonLegendaryPet(jid,materialId){","export const LEGENDARY_PET_BULK_LIMIT")
const batch=span(db,"export async function summonLegendaryPetsBulk(jid,materialId,requested='todos'){","export async function adoptPet(){")
const handler=span(bot,"} else if(['invocarpet','altarpets','altarpets','lojalendaria'].includes(cmd)){","} else if(cmd==='lojaraid'){")
const flow=span(bot,"if(flow.stage==='legendary_pet_bulk_confirm'){","if(flow.stage==='support_menu'){")

test('single summons and bulk share exact original pet roll and duplicate logic',()=>{
 assert.match(single,/summonLegendaryPetTx\(client,jid,altar\)/)
 assert.match(batch,/summonLegendaryPetTx\(client,jid,altar\)/)
 assert.match(helper,/const roll=Math\.random\(\)\*100/)
 assert.match(helper,/const forcedKey='forced_summon:'/)
 assert.match(helper,/const specialGuaranteeKey='raid50_fenix_once_/)
 assert.match(helper,/const sphinxKey='raid65_esfinge_once_/)
 assert.match(helper,/const duplicate=\(await client\.query/)
 assert.match(helper,/const fragmentRefund=Math\.max\(1,Math\.floor\(summonCost\*fragmentRate\)\)/)
 assert.match(helper,/INSERT INTO transactions/)
})

test('serializes owner and commits entire batch in one transaction',()=>{
 assert.match(batch,/return transaction\(async client=>\{/)
 assert.match(batch,/SELECT jid FROM users WHERE jid=\$1 FOR UPDATE/)
 assert.match(single,/SELECT jid FROM users WHERE jid=\$1 FOR UPDATE/)
 assert.match(batch,/while\(rolls\.length<amount && current\.material\+current\.universal>=cost\)/)
 assert.match(batch,/current=await balances\(\)/)
 assert.match(batch,/const newPets=rolls\.filter\(r=>!r\.duplicate\)/)
})

test('bulk retains original first-local-then-universal material spending and refunds',()=>{
 assert.match(helper,/const missing=Math\.max\(0,summonCost-owned\)/)
 assert.match(helper,/if\(missing\)await client\.query\("UPDATE inventories SET quantity=quantity-\$1 WHERE jid=\$2 AND item_id='fragmento_universal_raid'"/)
 assert.match(helper,/INSERT INTO inventories\(jid,item_id,quantity\)/)
 assert.match(helper,/UPDATE wallets SET cash=cash\+\$1/)
 assert.match(batch,/remaining:current/)
 assert.match(batch,/fragmentRefund=rolls\.reduce/)
})

test('maximum 30 per operation; no zero-cost rerolls or unlimited loop',()=>{
 assert.match(db,/export const LEGENDARY_PET_BULK_LIMIT=30/)
 assert.match(batch,/if\(before\.material\+before\.universal<cost\)/)
 assert.match(batch,/!Number\.isSafeInteger\(amount\)\|\|amount<1\|\|amount>LEGENDARY_PET_BULK_LIMIT/)
 assert.match(batch,/while\(rolls\.length<amount/)
 assert.match(batch,/hitLimit:rolls\.length===LEGENDARY_PET_BULK_LIMIT/)
})

test('bulk command requires user confirmation; choice 3 in menu is explicit',()=>{
 assert.match(handler,/String\(args\[1\]\|\|''\)\.trim\(\)\.toLowerCase\(\)/)
 assert.match(handler,/setQuickFlow\(chat,sender,'legendary_pet_bulk_confirm'/)
 assert.match(handler,/Nenhum material será consumido antes de confirmar/)
 assert.match(flow,/if\(flow\.stage==='legendary_pet_bulk_confirm'\)/)
 assert.match(flow,/if\(input==='2'\)/)
 assert.match(flow,/if\(input!=='1'\)/)
 assert.match(flow,/summonLegendaryPetsBulk\(sender,flow\.data\.materialId,flow\.data\.amount\|\|'todos'\)/)
 assert.match(flow,/if\(input==='3'\)/)
 assert.match(bot,/\*!invocarpet 10 todos\*/)
})

test('batch receipt is a single summary and lists new pet IDs',()=>{
 const r=span(bot,'function legendaryPetBulkReceipt(result){','async function handleQuickGameFlow(')
 assert.match(r,/result\.newPets\.length/)
 assert.match(r,/result\.duplicateCount/)
 assert.match(r,/result\.cashRefund/)
 assert.match(r,/result\.fragmentRefund/)
 assert.match(r,/p\.name.*p\.id/)
 assert.match(r,/result\.remaining\.material/)
 assert.match(r,/result\.remaining\.universal/)
})
