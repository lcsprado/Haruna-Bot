// Alpha Bot 2.0: preços candidatos, aplicados somente no modo classes_only.
// Nenhuma alteração de atributos, raridade, requisitos de cópia ou materiais.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
const V1_UPGRADE_BASE=Object.freeze({common:1500,uncommon:3000,rare:7000,epic:16000,legendary:40000,event:50000})
export const V2_GEAR_PRICE_RATE=Object.freeze({common:.7,uncommon:.6,rare:.5,epic:.4,legendary:.35,event:.35})
export const V2_UPGRADE_BASE=Object.freeze({common:300,uncommon:600,rare:1200,epic:2500,legendary:6000,event:8000})
const EQUIPMENT_CATEGORIES=new Set(['weapon','armor','shield','helmet','boots'])
export const V2_FORJA5_FEE=5000
export const V2_AUTO_FORGE_BASE_FEE=1000
export function equipmentCatalogPrice({category,rarity,price},{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled||!EQUIPMENT_CATEGORIES.has(category)||!(price>0))return price
 return Math.max(1,Math.ceil(price*(V2_GEAR_PRICE_RATE[rarity]??.5)))
}
export function equipmentUpgradeBase(rarity,{enabled=classesOnlyRebootEnabled()}={}){
 return (enabled?V2_UPGRADE_BASE:V1_UPGRADE_BASE)[String(rarity||'common')]??(enabled?500:2500)
}
export function equipmentUpgradeRefund(invested,{enabled=classesOnlyRebootEnabled()}={}){
 // Sem histórico de custo individual confiável, não pagar dinheiro por melhorias
 // que podem ter sido entregues gratuitamente; o item conserva revenda normal.
 return enabled?0:Math.floor(invested*.25)
}
export function effectiveShieldForgeFee(legacyFee,{enabled=classesOnlyRebootEnabled()}={}){
 return enabled?Math.ceil(legacyFee*.4):legacyFee
}
export function effectiveShopForge5Fee(legacyFee,{enabled=classesOnlyRebootEnabled()}={}){
 return enabled?V2_FORJA5_FEE:legacyFee
}
export function effectiveAutoForgeFee(cost,{enabled=classesOnlyRebootEnabled()}={}){
 return enabled?V2_AUTO_FORGE_BASE_FEE+Math.ceil(cost*.1/100)*100:25000+Math.ceil(cost*.1/1000)*1000
}
