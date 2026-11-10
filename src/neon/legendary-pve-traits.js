// Especializações PVE dos equipamentos lendários de Raids 40–70.
// Não altera atributos base, PvP, drops, dinheiro, forja ou equipamentos das collabs.
// Ativa somente com peça equipada, Lv.10 e pelo menos ★★★.
// Em Boss/Raid, uma arma concede dano OU uma armadura concede mitigação.
export const LEGENDARY_PVE_RULES=Object.freeze({
  excalibur:            Object.freeze({category:'weapon', boss:.10, raid:.03}),
  katana_divina:        Object.freeze({category:'weapon', boss:.03, raid:.10}),
  lamina_caos:          Object.freeze({category:'weapon', boss:.07, raid:.07}),
  machado_tita:         Object.freeze({category:'weapon', boss:.06, raid:.08}),
  foice_abismo:         Object.freeze({category:'weapon', boss:.05, raid:.10}),
  espada_aurora:        Object.freeze({category:'weapon', boss:.09, raid:.05}),
  exterminadora_eclipse:Object.freeze({category:'weapon', boss:.09, raid:.09}),
  armadura_titan:       Object.freeze({category:'armor', boss:.09, raid:.04}),
  armadura_divina:      Object.freeze({category:'armor', boss:.04, raid:.09}),
  couraca_caos:         Object.freeze({category:'armor', boss:.07, raid:.07}),
  armadura_tita_ancestral:Object.freeze({category:'armor', boss:.06, raid:.09}),
  manto_abismo_eterno:  Object.freeze({category:'armor', boss:.09, raid:.05}),
  armadura_aurora:      Object.freeze({category:'armor', boss:.08, raid:.07}),
  armadura_deus_eclipse:Object.freeze({category:'armor', boss:.09, raid:.09})
})
export const LEGENDARY_TRAIT_MAX=.10

// ★★★=1/3 do poder; ★★★★=2/3; ★★★★★=100%. Cada nova
// estrela reseta o nível da peça, portanto a passiva exige novo Lv.10.
export function legendaryPveTrait(itemId,level=1,stars=1,mode='raid'){
  const rule=LEGENDARY_PVE_RULES[String(itemId||'')]
  const lv=Number(level),star=Number(stars)
  const eligible=rule&&lv===10&&Number.isInteger(star)&&star>=3&&star<=5
  const rate=eligible?Number((Math.min(LEGENDARY_TRAIT_MAX,rule[mode==='boss'?'boss':'raid'])*(star-2)/3).toFixed(6)):0
  return Object.freeze({
    itemId:String(itemId||''),
    category:rule?.category||null,
    active:Boolean(eligible),
    damage:rule?.category==='weapon'?rate:0,
    reduction:rule?.category==='armor'?rate:0
  })
}
