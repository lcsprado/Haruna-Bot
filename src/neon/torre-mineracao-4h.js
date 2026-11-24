// Torre Infinita — prototipo isolado de mineracao, nao ligado a comandos ou ao banco.
// Sem alteracao de producao, atributos, inventario ou atividades existentes.
export const MINING_DURATION_SECONDS=4*60*60
export const MINING_GUARANTEED_REWARD=Object.freeze({cash:800,xp:250})

// Chances de uma (1) pedra por expedicao completa, NUNCA por hora.
// Madeira, Ferro e Aco na loja; Ouro no Cerco; Diamante no primeiro evento.
// Precos de loja em estudo econômico; premios de evento/Cerco nao vendidos.
// Sem integracao real com carteira ou loja; nenhum preco esta ativo.
export const MINING_PICKAXES=Object.freeze({
  madeira:Object.freeze({name:'Picareta de Madeira',source:'loja',purchaseCash:2000,stoneChancePercent:3,ore:4,maxUses:4,fullRepairCash:1200}),
  ferro:Object.freeze({name:'Picareta de Ferro',source:'loja',purchaseCash:7500,stoneChancePercent:6,ore:5,maxUses:5,fullRepairCash:3000}),
  aco:Object.freeze({name:'Picareta de Aço',source:'loja',purchaseCash:20000,stoneChancePercent:10,ore:6,maxUses:6,fullRepairCash:6000}),
  ouro:Object.freeze({name:'Picareta de Ouro',source:'cerco',purchaseCash:null,stoneChancePercent:12,ore:7,maxUses:7,fullRepairCash:10000}),
  diamante:Object.freeze({name:'Picareta de Diamante',source:'evento_inaugural',purchaseCash:null,stoneChancePercent:15,ore:8,maxUses:8,fullRepairCash:15000})
})
export const MINING_PICKAXE_SOURCES=Object.freeze({
  loja:'Loja de Picaretas',
  evento_inaugural:'Primeiro evento de mineração',
  cerco:'Cerco do Clã'
})
// Cotacao de compra somente para as tres picaretas de loja.
// Nunca aplicar valores de mercado a picaretas exclusivas de premio.
export function miningPurchaseQuote(pickaxeId){
  const quote=miningQuote(pickaxeId)
  if(quote.source!=='loja'||!Number.isSafeInteger(quote.purchaseCash)||quote.purchaseCash<=0)
    throw new Error('Essa picareta e exclusiva de evento ou Cerco e nao esta a venda.')
  return Object.freeze({pickaxeId,name:quote.name,priceCash:quote.purchaseCash,
    stoneChancePercent:quote.stoneChancePercent,durationSeconds:quote.durationSeconds})
}

export function miningPickaxesBySource(source){
  if(!Object.hasOwn(MINING_PICKAXE_SOURCES,source))throw new Error('Origem de picareta inválida.')
  return Object.entries(MINING_PICKAXES).filter(([,p])=>p.source===source).map(([id,p])=>Object.freeze({id,...p}))
}

// IDs das pedras ja existentes no Alpha Bot; nao cria novos buffs.
export const MINING_STONE_TABLE=Object.freeze([
  Object.freeze({id:'pedra_forca_alpha',weight:30}),
  Object.freeze({id:'pedra_fortaleza_alpha',weight:25}),
  Object.freeze({id:'pedra_agilidade_alpha',weight:20}),
  Object.freeze({id:'pedra_precisao_alpha',weight:15}),
  Object.freeze({id:'pedra_furia_alpha',weight:10})
])
export const MINING_INCOMPATIBLE_ACTIVITIES=Object.freeze(['raidlote','carpinar','dormir','minerar'])

const validRoll=(roll)=>Number.isFinite(roll)&&roll>=0&&roll<1
export function miningQuote(pickaxeId){
  const pickaxe=MINING_PICKAXES[pickaxeId]
  if(!pickaxe)throw new Error('Picareta inválida.')
  return Object.freeze({pickaxeId,name:pickaxe.name,durationSeconds:MINING_DURATION_SECONDS,
    stoneChancePercent:pickaxe.stoneChancePercent,ore:pickaxe.ore,source:pickaxe.source,
    purchaseCash:pickaxe.purchaseCash,
    guaranteedCash:MINING_GUARANTEED_REWARD.cash,guaranteedXp:MINING_GUARANTEED_REWARD.xp,
    maxUses:pickaxe.maxUses,fullRepairCash:pickaxe.fullRepairCash})
}


// Desgaste por jornada, sem item de conserto. A aplicacao definitiva
// devera persistir os usos por jogador/picareta e cobrar na mesma transacao.
export function miningRepairQuote(pickaxeId,usesRemaining){
  const pickaxe=miningQuote(pickaxeId)
  if(!Number.isSafeInteger(usesRemaining)||usesRemaining<0||usesRemaining>pickaxe.maxUses)
    throw new RangeError('Durabilidade da picareta inválida.')
  const missing=pickaxe.maxUses-usesRemaining
  return Object.freeze({pickaxeId,usesRemaining,missingUses:missing,
    costCash:Math.ceil(missing*pickaxe.fullRepairCash/pickaxe.maxUses),
    usesAfterRepair:pickaxe.maxUses})
}
export function miningStartQuote(pickaxeId,usesRemaining){
  const quote=miningRepairQuote(pickaxeId,usesRemaining)
  if(quote.usesRemaining===0)throw new Error('Picareta sem durabilidade. Repare usando dinheiro.')
  return Object.freeze({...miningQuote(pickaxeId),usesBefore:usesRemaining,usesAfter:usesRemaining-1})
}

// A mesma exclusao mutua devera ser testada nos dois sentidos no banco antes da ativacao.
export function miningActivityGuard({mining=false,raidlote=false,carpinar=false,dormir=false}={}){
  const active=MINING_INCOMPATIBLE_ACTIVITIES.filter(id=>Boolean(({minerar:mining,raidlote,carpinar,dormir})[id]))
  return Object.freeze({canStartMining:active.length===0,active})
}

// Sorteio acontece uma unica vez no encerramento natural da expedicao.
// Sortear ANTES de encerrar ou ao consultar status seria vulneravel a exploits.
export function settleMiningExpedition({pickaxeId,startedAt,now,stoneRoll,kindRoll}={}){
  const quote=miningQuote(pickaxeId)
  if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(now)||now<startedAt)
    throw new RangeError('Horário inválido da expedição.')
  if(now-startedAt<MINING_DURATION_SECONDS)
    return {status:'running',remainingSeconds:MINING_DURATION_SECONDS-(now-startedAt),stoneId:null,ore:0,cash:0,xp:0}
  if(!validRoll(stoneRoll)||!validRoll(kindRoll))
    throw new RangeError('Sorteios devem ser números entre 0 e 1.')
  const drop=stoneRoll<quote.stoneChancePercent/100
  if(!drop)return {status:'done',ore:quote.ore,stoneId:null,cash:quote.guaranteedCash,xp:quote.guaranteedXp}
  const roll=kindRoll*100
  let sum=0
  for(const stone of MINING_STONE_TABLE){
    sum+=stone.weight
    if(roll<sum)return {status:'done',ore:quote.ore,stoneId:stone.id,cash:quote.guaranteedCash,xp:quote.guaranteedXp}
  }
  throw new Error('Tabela de pedras inválida.')
}
