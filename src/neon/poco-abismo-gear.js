// Equipamentos exclusivos do Poço do Abismo.
// Os atributos base são comparados a equipamentos recentes de topo;
// cada drop será concedido já ★★★★★ Lv.10, nunca como peça comum.
// Evite misturar a chance de drop e o cadastro de itens.
export const POCO_ABISMO_GEAR = Object.freeze([
  Object.freeze({
    id:'poco_lamina_abismo_20261116',name:'Cortajuramentos',
    category:'weapon',rarity:'legendary',
    atk:228,def:83,hp:0,spd:0,crit:0,
    description:'Arma lendária do Poço do Abismo. +228 ATK e +83 DEF base. Drop recebido forjado ★★★★★ Lv.10.'
  }),
  Object.freeze({
    id:'poco_armadura_eclipse_20261116',name:'Couraça das Cem Cicatrizes',
    category:'armor',rarity:'legendary',
    atk:0,def:196,hp:568,spd:0,crit:0,
    description:'Armadura lendária do Poço do Abismo. +196 DEF e +568 HP base. Drop recebido forjado ★★★★★ Lv.10.'
  }),
  Object.freeze({
    id:'poco_elmo_soberano_20261116',name:'Elmo do Vigia Sem Olhos',
    category:'helmet',rarity:'legendary',
    atk:0,def:140,hp:437,spd:0,crit:0,
    description:'Elmo lendário do Poço do Abismo. +140 DEF e +437 HP base. Drop recebido forjado ★★★★★ Lv.10.'
  }),
  Object.freeze({
    id:'poco_escudo_eternidade_20261116',name:'Escudo das Correntes Partidas',
    category:'shield',rarity:'legendary',price:0,
    atk:0,def:0,hp:0,spd:0,crit:0,
    critResist:.125,critGuard:.185,
    description:'Escudo lendário anti-crítico. Base: -12,5 p.p. chance de crítico e -18,5% bônus de dano crítico. Drop ★★★★★ Lv.10.'
  }),
  Object.freeze({
    id:'poco_botas_vazio_20261116',name:'Botas do Retorno Impossível',
    category:'boots',rarity:'legendary',
    atk:0,def:0,hp:86,spd:17,crit:.02,
    description:'Botas lendárias do Poço do Abismo. +17 VEL, +86 HP e +2% crítico base. Drop forjado ★★★★★ Lv.10.'
  })
]);
export const POCO_ABISMO_GEAR_IDS=Object.freeze(POCO_ABISMO_GEAR.map(x=>x.id));
export const POCO_ABISMO_GEAR_ID_SET=new Set(POCO_ABISMO_GEAR_IDS);
export function pocoGearById(id){return POCO_ABISMO_GEAR.find(g=>g.id===id)||null}
