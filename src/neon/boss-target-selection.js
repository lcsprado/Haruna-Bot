// Escolha explícita do alvo: a sessão automática NÃO pode migrar silenciosamente
// do Eclipse para o Superboss semanal quando ambos estão ativos.
export const BOSS_TARGETS=Object.freeze({
  event:Object.freeze({number:1,label:'Boss de Evento',aliases:['1','evento','eclipse','imperador','60k','60000','60mil']}),
  weekly:Object.freeze({number:2,label:'Superboss Semanal',aliases:['2','semanal','superboss','golem','maior','150k','150000','150mil']}),
  common:Object.freeze({number:3,label:'Boss Comum',aliases:['3','comum']})
})
const clean=s=>String(s??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
export function parseBossAttackSelection(args,targets){
  const input=Array.isArray(args)?args:[]
  const valid=Array.isArray(targets)?targets.filter(t=>BOSS_TARGETS[t?.target]):[]
  const tokens=input.map(clean).filter(Boolean)
  const usePet=!tokens.some(t=>t==='sempet'||t==='sozinho')
  const picks=tokens.filter(t=>t!=='sempet'&&t!=='sozinho')
  if(picks.length>1)return {error:'Informe apenas um Boss: !atacar 1 ou !atacar 2.',usePet}
  if(valid.length===0)return {error:'Nenhum Boss disponível. Consulte !boss.',usePet}
  if(picks.length===0)return valid.length===1?{target:valid[0].target,usePet}:{choose:true,usePet}
  const type=Object.keys(BOSS_TARGETS).find(k=>BOSS_TARGETS[k].aliases.includes(picks[0]))
  if(!type)return {error:'Boss desconhecido. Use !boss para consultar os alvos.',usePet}
  if(!valid.some(x=>x.target===type))return {error:'Este Boss não está ativo. Use !boss para consultar os disponíveis.',usePet}
  return {target:type,usePet}
}
export function formatBossTargetMenu(targets,prefix='!'){
  const list=(Array.isArray(targets)?targets:[]).filter(t=>BOSS_TARGETS[t?.target])
  const lines=list.map(t=>{
    const type=BOSS_TARGETS[t.target]
    const name=String(t.name||type.label).replace(/[\r\n*_~]/g,' ').slice(0,65)
    const hp=Math.max(0,Math.floor(Number(t.hp)||0)).toLocaleString('pt-BR')
    const maxHp=Math.max(0,Math.floor(Number(t.maxHp)||0)).toLocaleString('pt-BR')
    return type.number+'. '+name+' — '+hp+'/'+maxHp+' HP\n⚔️ *'+prefix+'atacar '+type.number+'*'
  })
  return '👹 *ESCOLHA QUAL BOSS ATACAR*\n\n'+lines.join('\n\n')
    +'\n\n🐾 Pet participa normalmente. Para ir sem pet: *'+prefix+'atacar 1 sempet* ou *'+prefix+'atacar 2 sempet*.'
}
