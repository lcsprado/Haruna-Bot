// Alpha Bot 2.0 — limita ganho de dinheiro ao vender drops e abrir caixas.
// Só V2: o sistema anterior preserva preços e quantidade de operações.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js';
export const V2_DROP_RESALE=Object.freeze({
 legendary:8_000,epic:2_000,rare:800,uncommon:250,common:100
});
export const V2_BOX_CASH=Object.freeze({
 caixa_sorte:Object.freeze([100,400]),
 caixa_rara:Object.freeze([400,1_200]),
 caixa_epica:Object.freeze([800,2_000])
});
export function rebootResaleUnit(item,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled)return null;
 const price=Number(item?.price);
 if(!Number.isSafeInteger(price)||price<0)throw new RangeError('Preço inválido');
 if(price>0)return Math.max(1,Math.floor(price*.5));
 return V2_DROP_RESALE[String(item?.rarity||'common').toLowerCase()]??100;
}
export function rebootBoxCashRange(boxId,original,{enabled=classesOnlyRebootEnabled()}={}){
 if(!Array.isArray(original)||original.length!==2||
    !original.every(Number.isSafeInteger)||original[0]<0||original[1]<original[0])
   throw new RangeError('Faixa de caixa inválida');
 return enabled?(V2_BOX_CASH[boxId]||[0,0]):original;
}
export function rebootBoxBatchLimit({enabled=classesOnlyRebootEnabled()}={}){
 return enabled?25:5000;
}
