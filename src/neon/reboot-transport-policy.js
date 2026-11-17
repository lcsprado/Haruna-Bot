// Economia de transporte da V2 — pura, sem acesso a banco e DESLIGADA na V1.
import {rebootEconomyEnabled} from './reboot-economy-policy.js';

export const V2_TRANSPORT=Object.freeze({
  fareFactors:Object.freeze({uber:.55,ifood:.60}),
  taxRate:.10,operatingRate:.15,
  maxManualPaidVehicles:2,maxShiftHours:8
});
function factor(kind){
  const x=V2_TRANSPORT.fareFactors[kind];
  if(!Number.isFinite(x))throw new Error('Modalidade de transporte desconhecida.');
  return x;
}
export function v2TransportFare(amount,kind,{enabled=rebootEconomyEnabled()}={}){
  if(!Number.isSafeInteger(amount)||amount<0)throw new RangeError('Tarifa inválida');
  return enabled?Math.floor(amount*factor(kind)):amount;
}
export function v2ManualPaidFleet(garage,{enabled=rebootEconomyEnabled()}={}){
  if(!Array.isArray(garage))throw new TypeError('Garagem inválida');
  if(!enabled)return garage;
  // Garagem maior continua útil para reservas/CLT, mas não multiplica
  // a emissão de dinheiro em um único comando a cada 6 ou 9 minutos.
  return [...garage].sort((a,b)=>Number(b.price||0)-Number(a.price||0))
    .slice(0,V2_TRANSPORT.maxManualPaidVehicles);
}
export function v2TransportOperating(gross,{enabled=rebootEconomyEnabled()}={}){
  if(!Number.isSafeInteger(gross)||gross<0)throw new RangeError('Receita inválida');
  return enabled?Math.floor(gross*V2_TRANSPORT.operatingRate):0;
}
export function v2CltTripNet(gross,commission,kind,{enabled=rebootEconomyEnabled()}={}){
  if(!Number.isFinite(gross)||gross<0||!Number.isFinite(commission)||commission<0||commission>=1)
    throw new RangeError('Projeção CLT inválida');
  if(!enabled)return Math.max(1,Math.round(gross*(1-commission)*.90));
  const cash=gross*factor(kind)*(1-commission);
  return Math.max(1,Math.floor(cash*(1-V2_TRANSPORT.taxRate-V2_TRANSPORT.operatingRate)));
}
export function v2TravelSettlement(gross,{enabled=rebootEconomyEnabled(),legacyTaxMultiplier=1}={}){
  if(!Number.isSafeInteger(gross)||gross<0)throw new RangeError('Receita inválida');
  const taxRate=enabled?10:Math.min(100,10*Math.max(1,Number(legacyTaxMultiplier)||1));
  const tax=Math.floor(gross*taxRate/100);
  const operating=v2TransportOperating(gross,{enabled});
  return {gross,tax,taxRate,operating,total:gross-tax-operating};
}
