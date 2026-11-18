// Política candidata Alpha Bot 2.0: não altera recompensas/resgates da V1.
// Sem I/O, novas tabelas ou alteração de HP restaurado por consumível.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'

export const V2_CONSUMABLE_PRICES=Object.freeze({
 pocao_p:200,pocao_m:450,pocao_g:950,elixir_supremo:2500,
 pocao_pet_comum:250,pocao_pet_rara:600,pocao_pet_epica:1100,
 pocao_pet_suprema:2400,pocao_pet_full:7500,energetico_pet:3500
})
export const V2_NPC_PRICES=Object.freeze({
 pocao_ressurreicao:9000,selo_guardiao:6000,oleo_sombras:7500,
 elixir_disciplina:12000,elixir_sombras:12000,
 pergaminho_virtude:20000,tomo_proibido:20000,pergaminho_experiencia:9000,
 nucleo_pedra:2500,escama_vulcanica:4000,olho_abissal:6500,
 nucleo_titan:10000,essencia_rei_abissal:16000
})
export function consumableCatalogPrice(id,original,{enabled=classesOnlyRebootEnabled()}={}){
 return enabled?(V2_CONSUMABLE_PRICES[id]??original):original
}
// Somente preço exclusivo do NPC. Itens sem preço alternativo já vêm do
// catálogo efetivo do banco e NÃO devem receber desconto de versão novamente.
export function effectiveNpcBasePrice(offer,item,{enabled=classesOnlyRebootEnabled()}={}){
 const original=Number(offer?.npcPrice||item?.price||0)
 return enabled&&offer?.npcPrice?(V2_NPC_PRICES[offer.id]??original):original
}

const STARTER_REWARDS=Object.freeze({
 5:[['pocao_m',2]],10:[['caixa_sorte',1],['chave_raid_10',1]],
 15:[['pocao_pet_rara',2]],20:[['caixa_rara',1],['pocao_g',1]],
 25:[['energetico_pet',1]],30:[['caixa_rara',1],['elixir_supremo',1]],
 35:[['pocao_pet_epica',1]],40:[['caixa_rara',1],['pocao_g',2]],
 45:[['pocao_pet_suprema',1]],50:[['caixa_epica',1],['chave_raid_30',1]],
 55:[['pocao_pet_suprema',1]],60:[['caixa_rara',1],['elixir_supremo',1]],
 65:[['energetico_pet',1]],70:[['caixa_rara',1],['pocao_pet_suprema',1]],
 75:[['pocao_pet_full',1]],80:[['caixa_rara',1],['elixir_supremo',1]],
 85:[['pocao_pet_suprema',1]],90:[['caixa_rara',1],['energetico_pet',1]],
 95:[['elixir_supremo',1]],100:[['pergaminho_reclassificacao',1],['caixa_epica',2],['chave_raid_50',1]]
})
export function rebootLevelReward(milestone){
 const level=Number(milestone)
 if(!Number.isSafeInteger(level)||level<5)return null
 if(level<=100){
  if(level%5!==0)return null
  return {cash:level===100?15000:1000+500*(level/5-1),
    items:STARTER_REWARDS[level].map(x=>[...x])}
 }
 if(level<200){
  if(level%10!==0)return null
  return {cash:Math.min(12000,8000+500*((level-110)/10)),
    items:[['caixa_rara',1],['pocao_pet_suprema',1]]}
 }
 if(level%20!==0)return null
 const items=[['caixa_epica',1],['elixir_supremo',1]]
 if(level===200)items.push(['pergaminho_reclassificacao',1])
 return {cash:Math.min(15000,12000+300*((level-200)/20)),items}
}
