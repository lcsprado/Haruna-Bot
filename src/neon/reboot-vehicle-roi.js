// Alpha Bot C4b — projeção de retorno de veículos, sem preços aplicados.
import {v2TransportFare,v2CltTripNet} from './reboot-transport-policy.js';
export const V2_ROI_ASSUMPTIONS=Object.freeze({
 manualActionsPerActiveDay:Object.freeze([1,3,6]),
 targetPaybackActiveDays:45,
 uberRideFactor:(.85+1+1.25+1.6)/4,
 ifoodDeliveryFactor:(.85+1+1.25+1.5)/4,
 uberExpectedTipFactor:1+.22*.125,
 ifoodExpectedTipFactor:1+.18*.10
});
export function expectedManualVehicleNet({price,min,max,kind,actions=3}={}){
 if(!Number.isSafeInteger(price)||price<1||!Number.isFinite(min)||min<0||
    !Number.isFinite(max)||max<min||!Number.isInteger(actions)||actions<1||actions>100)
   throw new RangeError('Veículo/quantidade inválidos');
 const ride=kind==='uber'?V2_ROI_ASSUMPTIONS.uberRideFactor:
   kind==='ifood'?V2_ROI_ASSUMPTIONS.ifoodDeliveryFactor:null;
 if(ride===null)throw new RangeError('Modalidade inválida');
 const tip=kind==='uber'?V2_ROI_ASSUMPTIONS.uberExpectedTipFactor:
   V2_ROI_ASSUMPTIONS.ifoodExpectedTipFactor;
 const expectedLegacyGross=Math.round((min+max)/2*ride*tip);
 const gross=v2TransportFare(expectedLegacyGross,kind,{enabled:true});
 const tax=Math.floor(gross*.10),operating=Math.floor(gross*.15);
 const netPerAction=gross-tax-operating;
 const netPerActiveDay=netPerAction*actions;
 return {netPerAction,netPerActiveDay,actions,
   paybackActiveDays:netPerActiveDay?Math.ceil(price/netPerActiveDay):null,
   hypotheticalPriceCeiling45Days:Math.floor(netPerActiveDay*45/100)*100};
}
export function expectedCltVehicleNet({price,min,max,kind,driver}={}){
 if(!Number.isSafeInteger(price)||price<1||!Number.isFinite(min)||min<0||
    !Number.isFinite(max)||max<min||!driver||!Number.isFinite(driver.intervalMin)||
    driver.intervalMin<1||!Number.isFinite(driver.efficiency)||driver.efficiency<=0||
    driver.efficiency>1||!Number.isFinite(driver.commission)||
    driver.commission<0||driver.commission>=1||!Number.isSafeInteger(driver.price)||
    driver.price<0)throw new RangeError('Motorista/veículo inválido');
 const ride=kind==='uber'?V2_ROI_ASSUMPTIONS.uberRideFactor:
   kind==='ifood'?V2_ROI_ASSUMPTIONS.ifoodDeliveryFactor:null;
 if(ride===null)throw new RangeError('Modalidade inválida');
 const tip=kind==='uber'?V2_ROI_ASSUMPTIONS.uberExpectedTipFactor:
   V2_ROI_ASSUMPTIONS.ifoodExpectedTipFactor;
 const gross=(min+max)/2*ride*tip*driver.efficiency;
 const trips=Math.floor(480/driver.intervalMin);
 const netPerTrip=v2CltTripNet(gross,driver.commission,kind,{enabled:true});
 const shiftNet=trips*netPerTrip;
 return {trips,netPerTrip,shiftNet,combinedCapital:price+driver.price,
   paybackActiveDays:shiftNet?Math.ceil((price+driver.price)/shiftNet):null};
}
