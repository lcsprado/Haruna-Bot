// Torre Infinita — prototipo isolado de mineracao, nao ligado a comandos ou ao banco.
// Sem alteracao de producao, atributos, inventario ou atividades existentes.
export const MINING_DURATION_SECONDS=4*60*60

// Chances de uma (1) pedra por expedicao completa, NUNCA por hora.
export const MINING_PICKAXES=Object.freeze({
  ferro:Object.freeze({name:'Picareta de Ferro',stoneChancePercent:3,ore:4}),
  prata:Object.freeze({name:'Picareta de Prata',stoneChancePercent:6,ore:5}),
  ouro:Object.freeze({name:'Picareta de Ouro',stoneChancePercent:10,ore:6}),
  abissal:Object.freeze({name:'Picareta Abissal',stoneChancePercent:15,ore:8})
})

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
    stoneChancePercent:pickaxe.stoneChancePercent,ore:pickaxe.ore})
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
    return {status:'running',remainingSeconds:MINING_DURATION_SECONDS-(now-startedAt),stoneId:null,ore:0}
  if(!validRoll(stoneRoll)||!validRoll(kindRoll))
    throw new RangeError('Sorteios devem ser números entre 0 e 1.')
  const drop=stoneRoll<quote.stoneChancePercent/100
  if(!drop)return {status:'done',ore:quote.ore,stoneId:null}
  const roll=kindRoll*100
  let sum=0
  for(const stone of MINING_STONE_TABLE){
    sum+=stone.weight
    if(roll<sum)return {status:'done',ore:quote.ore,stoneId:stone.id}
  }
  throw new Error('Tabela de pedras inválida.')
}
