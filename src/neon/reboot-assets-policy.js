// Economia patrimonial V2: valores candidatos, modo legado intacto.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js';
export const V2_ASSET_PRICES=Object.freeze({
 kitnet:25000,casa:60000,sobrado:150000,mansao:450000,cobertura:1000000,
 popular:35000,sedan_esportivo:75000,nivus:115000,jetta_gli:150000,suv_premium:195000,
 bmw_320i:300000,audi_a5:425000,porsche_911:650000,mercedes_c43:900000,
 superesportivo:1300000,lamborghini_revuelto:2600000,mclaren_p1:3900000,hipercarro:5000000,
 bicicleta:1500,moto_125:8000,moto_160:14000,moto_300:30000,moto_600:80000,moto_1000:190000
});
export function effectiveAsset(row,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled)return row;
 const price=V2_ASSET_PRICES[row?.id];
 if(!Number.isSafeInteger(price)||price<=0)throw new Error('Patrimônio sem preço V2.');
 return {...row,price};
}
export function assertV2MarketListing(quantity,price,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled)return;
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>25||
    !Number.isSafeInteger(price)||price<1||price>250000)
   throw new RangeError('Mercado 2.0: até 25 itens e R$ 250 mil por anúncio.');
}
export function v2DarkContractReward(level,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled)return null;
 return level>=80?{cash:2500,xp:500}:level>=50?{cash:1800,xp:350}:
   level>=20?{cash:1000,xp:200}:{cash:500,xp:100};
}
export function v2CityRobbery(level,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled)return null;
 return {reward:Math.min(2000,Math.round(350+level*20)),fine:Math.min(1800,Math.round(300+level*15))};
}
