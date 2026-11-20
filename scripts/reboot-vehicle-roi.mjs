#!/usr/bin/env node
// Reproduzível apenas a partir do catálogo versionado, sem dados de jogadores.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {effectiveAsset} from '../src/neon/reboot-assets-policy.js';
import {expectedManualVehicleNet,expectedCltVehicleNet} from '../src/neon/reboot-vehicle-roi.js';

function block(source,begin,end){
 const a=source.indexOf(begin);
 if(a<0)throw new Error('Catálogo não encontrado: '+begin);
 const b=source.indexOf(end,a+begin.length);
 if(b<0)throw new Error('Fim do catálogo não encontrado: '+begin);
 return source.slice(a,b);
}
export function auditVehicleRoi(source,{currentV2Prices=false}={}){
 const cars=block(source,'export const CARS=[','\n]');
 const motos=block(source,'export const MOTORCYCLES=[','\n]');
 const faresUber=block(source,'export const UBER_TIERS={','\n}');
 const faresIfood=block(source,'const IFOOD_FARES={','\n}');
 const cltUber=block(source,'export const CLT_UBER_TYPES=[','\n]');
 const cltIfood=block(source,'export const CLT_IFOOD_TYPES=[','\n]');
 const catalog=s=>[...s.matchAll(/\{id:'([^']+)',name:'([^']+)',price:(\d+)\}/g)]
   .map(m=>({id:m[1],name:m[2],price:Number(m[3])}));
 const uberFares=Object.fromEntries([...faresUber.matchAll(/(\w+):\{category:'[^']+',min:(\d+),max:(\d+)\}/g)]
   .map(m=>[m[1],{min:Number(m[2]),max:Number(m[3])}]));
 const ifoodFares=Object.fromEntries([...faresIfood.matchAll(/(\w+):\[(\d+),(\d+)\]/g)]
   .map(m=>[m[1],{min:Number(m[2]),max:Number(m[3])}]));
 const drivers=s=>[...s.matchAll(/\{id:'([^']+)',name:'([^']+)',price:(\d+),intervalMin:(\d+),efficiency:([\d.]+),commission:([\d.]+)\}/g)]
   .map(m=>({id:m[1],name:m[2],price:Number(m[3]),intervalMin:Number(m[4]),
     efficiency:Number(m[5]),commission:Number(m[6])}));
 const c=catalog(cars).map(row=>effectiveAsset(row,{enabled:currentV2Prices})),m=catalog(motos).map(row=>effectiveAsset(row,{enabled:currentV2Prices})),du=drivers(cltUber),di=drivers(cltIfood);
 if(c.length!==13||m.length!==6||Object.keys(uberFares).length!==13||
  Object.keys(ifoodFares).length!==6||du.length!==3||di.length!==3)
   throw new Error('Quantidade de modelos alterada: exigir revisão');
 const calc=(models,fares,kind,drivers)=>models.map(vehicle=>{
   const fare=fares[vehicle.id];
   if(!fare)throw new Error('Tarifa não encontrada para '+vehicle.id);
   return {...vehicle,
     manual:[1,3,6].map(actions=>({actions,...expectedManualVehicleNet({...vehicle,...fare,kind,actions})})),
     clt:drivers.map(driver=>({driverId:driver.id,
       ...expectedCltVehicleNet({...vehicle,...fare,kind,driver})}))
   };
 });
 return {readOnly:true,catalogPricesChanged:currentV2Prices,actualPlayerRevenueUsed:false,
   cars:calc(c,uberFares,'uber',du),motorcycles:calc(m,ifoodFares,'ifood',di),
   warning:'Retorno teórico em dias ATIVOS, não receita garantida; taxa de operação e impostos já descontados. '+(currentV2Prices?'Preços V2 candidatos.':'Preços legados de referência.')};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8');
 const result=auditVehicleRoi(source);
 if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(result,null,2)+'\n');
 else{
   process.stdout.write('C4b: ROI DE VEÍCULOS — HIPÓTESE OFFLINE, NÃO APLICADA\n');
   for(const row of [result.cars[0],result.cars.at(-1),result.motorcycles[0],result.motorcycles.at(-1)]){
     process.stdout.write(row.name+' preço R$ '+row.price.toLocaleString('pt-BR')+
       '; manual 3 ações/dia ativo: '+row.manual[1].paybackActiveDays+
       ' dias; CLT com motorista comum: '+row.clt[0].paybackActiveDays+' dias ativos\n');
   }
 }
}
