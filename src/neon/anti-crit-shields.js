// Escudos são equipamentos anti-crítico, não alteram atributos-base de heróis ou classes.
// Resistência reduz a chance efetiva (em pontos percentuais); guarda reduz somente
// o bônus do dano crítico, nunca o dano normal.
export const ANTI_CRIT_SHIELDS=Object.freeze([
  Object.freeze({id:'escudo_madeira',name:'Escudo de Madeira',category:'shield',rarity:'common',price:4000,critResist:.02,critGuard:.04,description:'Anti-crítico básico: -2 p.p. de chance de crítico inimigo e -4% do bônus crítico recebido.'}),
  Object.freeze({id:'escudo_ferro',name:'Escudo de Ferro',category:'shield',rarity:'uncommon',price:15000,critResist:.04,critGuard:.07,description:'-4 p.p. de chance de crítico inimigo e -7% do bônus crítico recebido.'}),
  Object.freeze({id:'escudo_runico',name:'Escudo Rúnico',category:'shield',rarity:'rare',price:45000,critResist:.06,critGuard:.10,description:'-6 p.p. de chance de crítico inimigo e -10% do bônus crítico recebido.'}),
  Object.freeze({id:'egide_celestial',name:'Égide Celestial',category:'shield',rarity:'epic',price:0,critResist:.09,critGuard:.14,description:'Drop raro da Raid 70: -9 p.p. de chance de crítico inimigo e -14% do bônus crítico recebido.'}),
  Object.freeze({id:'bastiao_eclipse',name:'Bastião do Eclipse',category:'shield',rarity:'legendary',price:0,critResist:.12,critGuard:.18,description:'Recompensa exclusiva do Cerco ao Castelo de 14/11/2026: -12 p.p. de chance de crítico inimigo e -18% do bônus crítico recebido. Não vendido na loja.'})
]);
const SHIELDS_BY_ID=Object.freeze(Object.fromEntries(ANTI_CRIT_SHIELDS.map(shield=>[shield.id,shield])));
// +50% de eficácia no Lv.10. Este crescimento especial evita os 2,5x
// aplicados aos atributos de armas e armaduras.
export function antiCritShieldStats(itemId,level=1){
  const shield=SHIELDS_BY_ID[String(itemId||'')];
  if(!shield)return null;
  const lv=Math.max(1,Math.min(10,Math.trunc(Number(level)||1)));
  const growth=1+.5*((lv-1)/9);
  return {
    critResist:Number(Math.min(.20,shield.critResist*growth).toFixed(6)),
    critGuard:Number(Math.min(.30,shield.critGuard*growth).toFixed(6))
  };
}
export function effectiveShieldedCritChance(chance,resistance=0){
  const base=Math.max(0,Math.min(1,Number(chance)||0));
  const amount=Math.max(0,Math.min(.20,Number(resistance)||0));
  // Preserve uma chance residual de até 5% para que anti-crítico não vire
  // imunidade; chances naturalmente inferiores a 5% não aumentam.
  return Math.max(Math.min(.05,base),base-amount);
}
export function shieldedCriticalMultiplier(criticalMultiplier=1.6,critGuard=0){
  const mult=Math.max(1,Number(criticalMultiplier)||1);
  const reduction=Math.max(0,Math.min(.30,Number(critGuard)||0));
  return 1+(mult-1)*(1-reduction);
}
