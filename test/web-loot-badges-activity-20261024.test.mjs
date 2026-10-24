import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8')
const api=await readFile(new URL('../src/neon/web-api.js',import.meta.url),'utf8')

function frontLootHelpers(ui){
  const start=app.indexOf('function lootRewardIsPotion(item){')
  const end=app.indexOf('function setLootReveal(value){',start)
  assert.ok(start>=0 && end>start)
  return new Function('ui',app.slice(start,end)+'\nreturn {lootSafeSellQty,lootSellCandidates,removeSoldLootEntries}')(ui)
}
function exampleUI(){
  return {data:{inventory:[
    {item_id:'espada_aco',rarity:'rare',quantity:4,sellable_quantity:4,sellable:true,upgrade_distribution:[{level:10,quantity:2},{level:1,quantity:2}]},
    {item_id:'bota_relampago',rarity:'epic',quantity:2,sellable_quantity:1,sellable:true,equipped:true,upgrade_distribution:[{level:1,quantity:2}]},
    {item_id:'excalibur',rarity:'legendary',quantity:3,sellable_quantity:3,sellable:true},
    {item_id:'pocao_m',rarity:'uncommon',quantity:5,sellable_quantity:5,sellable:true},
    {item_id:'insignia_eclipse',rarity:'event',quantity:1,sellable_quantity:1,sellable:false}
  ]},lootReveal:{items:[
    {itemId:'espada_aco',qty:3,rarity:'rare'},
    {itemId:'bota_relampago',qty:2,rarity:'epic'},
    {itemId:'excalibur',qty:3,rarity:'legendary'},
    {itemId:'pocao_m',qty:2,rarity:'uncommon'},
    {itemId:'insignia_eclipse',qty:1,rarity:'event'}
  ]}}
}

test('bulk box sale preserves legendary, insignias, upgraded and equipped gear',()=>{
  const ui=exampleUI()
  const {lootSellCandidates}=frontLootHelpers(ui)
  const selections=lootSellCandidates().map(x=>[x.itemId,x.qty])
  assert.deepEqual(selections,[['espada_aco',2],['bota_relampago',1],['pocao_m',2]])
  assert.ok(!selections.some(x=>x[0]==='excalibur'||x[0]==='insignia_eclipse'))
})

test('selling one reward leaves other box rewards in the modal',()=>{
  const ui=exampleUI()
  const {removeSoldLootEntries}=frontLootHelpers(ui)
  removeSoldLootEntries([{itemId:'espada_aco',qty:2}])
  assert.equal(ui.lootReveal.items.length,5)
  assert.equal(ui.lootReveal.items[0].qty,1)
  assert.equal(ui.lootReveal.items[2].qty,3)
})

test('Web supports a single active server-validated event insignia',()=>{
  assert.match(api,/import \{relicStatus,selectRelic,relicCatalog\} from '\.\/relics\.js'/)
  assert.match(api,/case 'relic\.equip': return selectRelic\(jid,/)
  assert.match(api,/case 'relic\.unequip': return selectRelic\(jid,'nenhuma'\)/)
  assert.match(api,/\/api\/v1\/me\/relics/)
  assert.match(app,/data-relic-equip/)
  assert.match(app,/data-relic-unequip/)
  assert.match(app,/\['relics','⚜️ Insígnias'\]/)
})

test('all nonlegendary loot sales require explicit user confirmation',()=>{
  assert.match(app,/data-loot-sell-batch/)
  assert.match(app,/confirm\('Vender '\+units/)
  assert.match(app,/sellLootSelection\(entries\.map/)
  assert.match(api,/case 'item\.sellBatch'/)
  assert.match(api,/item\.rarity==='legendary' \|\| item\.rarity==='event'/)
})

function activityFormatter(){
  const start=api.indexOf('async function sendWebGroupActivity(')
  const end=api.indexOf('\nasync function startRaidServerRun',start)
  assert.ok(start>0 && end>start)
  const sent=[]
  const brl=n=>'R$ '+Math.abs(Math.round(Number(n)||0)).toLocaleString('pt-BR')
  const callback=new Function('playerDisplayName','webItemName','brl','db','enqueueWebAction',
    api.slice(start,end)+'\nreturn sendWebGroupActivity')(
      async()=>'Jogador Teste',async(id)=>id,brl,{},
      async(database,{payload})=>{sent.push(payload.text)}
    )
  return {send:async(action,result,body={})=>{
    const before=sent.length
    await callback({jid:'test@s.whatsapp.net',chatJid:'test@g.us'},action,body,result)
    return sent.length>before?sent[sent.length-1]:null
  }}
}
test('group notices include actual contract, robbery, RPS and expedition results',async()=>{
  const {send}=activityFormatter()
  assert.match(await send('contract.accept',{contract:{title:'Mãos Leves',description:'Realize um roubo',cash:500,xp:400,target:1},reward_cash:500,reward_xp:400}),/Mãos Leves/)
  assert.match(await send('rob',{ok:true,success:true,amount:4700,targetName:'Outro Jogador'}),/R\$ 4\.700/)
  const failed=await send('rob',{ok:true,success:false,fine:100,targetName:'Outro Jogador'})
  assert.match(failed,/FALHOU/)
  assert.doesNotMatch(failed,/CONSEGUIU/)
  assert.equal(await send('rob',{ok:false,remaining:90}),null)
  assert.match(await send('game.rps',{choice:'papel',bot:'pedra',result:'vitoria'}),/VITÓRIA/)
  assert.match(await send('pet.expedition.start',{pet_name:'Fênix',hours:4,cash_reward:300,pet_xp:120}),/Fênix/)
  assert.match(await send('pet.expedition.resolve',[{name:'Fênix',xp:240,cash:300,level:12}]),/240/)
})
