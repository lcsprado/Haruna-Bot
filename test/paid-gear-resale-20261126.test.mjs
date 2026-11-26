import test from 'node:test'
import assert from 'node:assert/strict'
import {paidGearSaleSteps,paidGearRefund,paidGearSaleMarker} from '../src/neon/paid-gear-resale.js'
const up=(kind,from,to,amount)=>({type:'equipment_upgrade',note:'garras_vazio '+kind+' Lv.'+from+'->Lv.'+to,amount})
test('refund includes real donor and star upgrade debits after forge',()=>{
 const rows=[up('COPY',1,2,2500),up('COPY',5,6,12500),up('COPY',6,7,15000),up('COPY',7,8,17500),up('COPY',8,9,20000),up('COPY',9,10,22500),{type:'equipment_star_forge',note:'garras_vazio ★1->★2; Lv.1',amount:0},up('STAR',1,6,37500)]
 // The isolated Lv.2 copy has no proven path to the donor tier and is not counted.
 const steps=paidGearSaleSteps({rows,quantity:1,forge:{level:6,stars:2},itemId:'garras_vazio'})
 assert.equal(paidGearRefund(steps,1),62500)
})
test('free upgrades do not yield refund and mixed copies sell unpaid first',()=>{
 const rows=[up('COPY',1,5,25000)]
 const steps=paidGearSaleSteps({rows,quantity:3,tiers:[{level:5,quantity:2}]})
 assert.equal(paidGearRefund(steps,1),0)
 assert.equal(paidGearRefund(steps,2),0)
 assert.equal(paidGearRefund(steps,3),12500)
})
test('partial sale preserves equipped copy and prevents repeat refund',()=>{
 const rows=[up('COPY',1,3,7500),up('COPY',1,10,112500)]
 const steps=paidGearSaleSteps({rows,quantity:2,tiers:[{level:3,quantity:1},{level:10,quantity:1}],equipped:true})
 assert.equal(paidGearRefund(steps,1),3750)
 rows.push({type:'sale',note:'garras_vazio x1'+paidGearSaleMarker(steps,1,1),amount:26750})
 assert.equal(paidGearRefund(paidGearSaleSteps({rows,quantity:1,tiers:[{level:10,quantity:1}]}),1),56250)
})
test('legacy sales clear uncertain basis, and full liquidation clears old investment',()=>{
 const rows=[up('COPY',1,5,25000),{type:'sale',note:'garras_vazio x1|lv:5',amount:23000},up('COPY',1,3,7500)]
 const steps=paidGearSaleSteps({rows,quantity:1,tiers:[{level:3,quantity:1}]})
 assert.equal(paidGearRefund(steps,1),3750)
 rows.push({type:'sale',note:'garras_vazio x1'+paidGearSaleMarker(steps,1,0),amount:26750})
 assert.equal(paidGearRefund(paidGearSaleSteps({rows,quantity:1,tiers:[{level:3,quantity:1}]}),1),0)
})
test('shop forge excludes purchase component already covered by base resale',()=>{
 const rows=[{type:'equipment_shop_forge5',note:'garras_vazio 5star Lv10 | estoque_inicial 0 | principal_Lv 1 | doadoras_Lv nenhuma | compra 46000 | aprimoramento 112500 (principal 112500,doadoras 0,fusoes 0) | forja 5000 | servico 1000',amount:164500}]
 const steps=paidGearSaleSteps({rows,quantity:1,forge:{level:10,stars:5}})
 assert.equal(paidGearRefund(steps,1),59250)
})
