// Reboot C4g — itens e regras propostas do primeiro leilão da temporada.
// Leilões antigos continuam apenas como histórico; este arquivo NÃO inicia eventos.
import {isRebootLegacyAuctionVoucher,isRebootCollabItemId} from './reboot-classes-policy.js';
export const V2_AUCTION=Object.freeze({
 maxLotsPerEdition:3,weeklyEditions:1,maxStars:1,maxLevel:1,
 lots:Object.freeze([
  Object.freeze({id:'v2_consumiveis',itemId:'pocao_g',qty:2,opening:1_000,stars:1,level:1}),
  Object.freeze({id:'v2_espada',itemId:'espada_aco',qty:1,opening:2_500,stars:1,level:1}),
  Object.freeze({id:'v2_armadura',itemId:'armadura_aco',qty:1,opening:2_500,stars:1,level:1})
 ])
});
export function assertV2AuctionReward(lot){
 if(!lot||typeof lot!=='object')throw new Error('Lote V2 inválido');
 const id=String(lot.itemId||'');
 if(isRebootLegacyAuctionVoucher(id)||isRebootCollabItemId(id)||
    /^(voucher_|chave_raid_75|pecado)/i.test(id))
    throw new Error('Recompensa proibida na temporada V2');
 if(!/^[a-z0-9_]{3,100}$/.test(id)||!Number.isSafeInteger(lot.qty)||lot.qty<1||lot.qty>5||
    !Number.isSafeInteger(lot.opening)||lot.opening<500||
    !Number.isSafeInteger(lot.stars)||lot.stars!==1||
    !Number.isSafeInteger(lot.level)||lot.level!==1)
    throw new Error('Lote incompatível com início Lv1 da V2');
 return true;
}
export function firstAuctionV2Catalog(){
 const seen=new Set();
 for(const lot of V2_AUCTION.lots){
  assertV2AuctionReward(lot);
  if(seen.has(lot.id))throw Error('Lote repetido');
  seen.add(lot.id);
 }
 if(seen.size>V2_AUCTION.maxLotsPerEdition)throw Error('Limite de lotes excedido');
 return V2_AUCTION.lots.map(x=>({...x}));
}
