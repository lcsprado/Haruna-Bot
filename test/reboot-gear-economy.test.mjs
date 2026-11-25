import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {planStoneApplication} from '../src/neon/enchantment-stones-catalog.js'
import {equipmentCatalogPrice,equipmentUpgradeBase,equipmentUpgradeRefund,effectiveShieldForgeFee,effectiveShopForge5Fee,effectiveAutoForgeFee} from '../src/neon/reboot-gear-economy.js'
import {candidateShopCatalogItem} from '../src/neon/reboot-economy-policy.js'
import {rebootResaleUnit} from '../src/neon/reboot-sale-policy.js'
import {planShopForge5,shopForge5ServiceFee} from '../src/neon/shop-forge5-plan.js'
import {planInventoryAutoForge} from '../src/neon/auto-forge-inventory-plan.js'
import {shieldForgeCost} from '../src/neon/anti-crit-shields.js'
const yes={enabled:true},no={enabled:false}
test('V2 reduz preços de equipamentos compráveis sem transformar drops em itens compráveis',()=>{
 const rows=[['espada_madeira','Madeira','','weapon',1500,'common'],['espada_ferro','Ferro','','weapon',5000,'uncommon'],['espada_aco','Aço','','weapon',12000,'rare'],['espada_flamas','Chamas','','weapon',60000,'epic']]
 assert.deepEqual(rows.map(r=>candidateShopCatalogItem(r,yes)[4]),[1050,3000,6000,24000])
 for(const r of rows)assert.equal(candidateShopCatalogItem(r,no),r)
 assert.equal(candidateShopCatalogItem(['excalibur','Excalibur','','weapon',0,'legendary'],yes)[4],0)
 assert.equal(candidateShopCatalogItem(['chave_raid_70','Chave','','special',390000,'legendary'],yes)[4],60000)
 assert.equal(candidateShopCatalogItem(['pocao_g','Poção','','consumable',3000,'rare'],yes)[4],950)
})
test('aprimorar Lv1-10 usa base única, progressiva e preserva V1',()=>{
 assert.deepEqual(['common','uncommon','rare','epic','legendary','event'].map(r=>45*equipmentUpgradeBase(r,yes)),[13500,27000,54000,112500,270000,360000])
 assert.equal(45*equipmentUpgradeBase('legendary',no),1800000)
 assert.equal(equipmentUpgradeRefund(270000,yes),0)
 assert.equal(equipmentUpgradeRefund(1800000,no),450000)
 assert.equal(effectiveShieldForgeFee(22500,yes),9000)
 assert.equal(effectiveShopForge5Fee(500000,yes),5000)
 assert.equal(effectiveAutoForgeFee(13500,yes),2400)
})
test('forja5 e autoforja cobram os mesmos custos V2 em proposta e execução, sem destruir cópia protegida',()=>{
 const old=process.env.ALPHA_REBOOT_MODE
 process.env.ALPHA_REBOOT_MODE='classes_only'
 try{
  const p=planShopForge5({itemId:'espada_madeira',category:'weapon',rarity:'common',price:1050,quantity:0,tiers:[],cash:200000,bank:0,upgradeBase:equipmentUpgradeBase('common')})
  assert.equal(p.total,131750)
  assert.equal(p.serviceFee,shopForge5ServiceFee())
  assert.equal(p.buyCopies,5)
  assert.equal(p.upgrades,405*300)
  const a=planInventoryAutoForge({itemId:'espada_madeira',category:'weapon',rarity:'common',quantity:2,bound:0,equipped:false,tiers:[],cash:100000,bank:0,upgradeBase:equipmentUpgradeBase('common'),shopStandard:true,materials:0})
  assert.equal(a.starsAfter,2)
  assert.equal(a.upgrades,40500)
  assert.equal(a.serviceFee,5100)
  assert.equal(a.total,45600)
  assert.equal(shieldForgeCost('escudo_runico',1),9000)
 }finally{
  if(old===undefined)delete process.env.ALPHA_REBOOT_MODE
  else process.env.ALPHA_REBOOT_MODE=old
 }
})
test('revender material de Raid não cria dinheiro lendário e item não vendável nunca tem preço de revenda',()=>{
 for(const id of ['nucleo_pedra','essencia_eclipse','coroa_abissal'])for(const rarity of ['uncommon','legendary']){
  assert.equal(rebootResaleUnit({id,price:0,rarity},yes),100)
  assert.equal(rebootResaleUnit({item_id:id,price:0,rarity},yes),100)
 }
 assert.equal(rebootResaleUnit({price:0,rarity:'legendary',sellable:false},yes),0)
 assert.equal(rebootResaleUnit({price:0,rarity:'legendary'},yes),8000)
 assert.equal(rebootResaleUnit({price:6000,rarity:'rare'},yes),3000)
})
test('runtime compartilha base de custos e mantém encantamento com uma pedra, sem tarifa surpresa',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 assert.equal(db.includes('UPGRADE_BASE_COST'),false)
 assert.match(db,/const base=equipmentUpgradeBase\(rarity\)/)
 assert.match(db,/upgradeBase:equipmentUpgradeBase\(inv.rarity\)/)
 assert.match(db,/upgradeBase:equipmentUpgradeBase\(item.rarity\)/)
 const e=readFileSync(new URL('../src/neon/enchantments-alpha.js',import.meta.url),'utf8')
 assert.match(e,/async function applyStone\(jid,stoneId,itemId,expectedReplaceId=null\)\{\s*assertRebootItemAllowed\(itemId\)/)
 assert.match(e,/const plan=planStoneApplication\(current,stoneId\)/)
 assert.match(e,/if\(!plan\)throw Error/)
 assert.equal(planStoneApplication([{stone_id:'pedra_forca_alpha',quantity:3}],'pedra_forca_alpha'),null)
 assert.equal(planStoneApplication([{stone_id:'pedra_furia_alpha',quantity:2}],'pedra_precisao_alpha'),null)
 assert.deepEqual(planStoneApplication([{stone_id:'pedra_forca_alpha',quantity:3}],'pedra_forca_rara_alpha'),{replaceId:'pedra_forca_alpha',totalAfter:3})
 assert.doesNotMatch(e.slice(e.indexOf('async function applyStone('),e.indexOf('const ENCHANT_FLOW_MINUTES')),/UPDATE wallets|debitCash/)
 assert.match(e,/UPDATE inventories SET quantity=quantity-1/)
 assert.match(e,/Não há cobrança em dinheiro/)
})
