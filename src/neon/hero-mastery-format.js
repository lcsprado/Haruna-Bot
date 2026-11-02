import {HERO_SKILL_GUIDE,HERO_PVP_SKILL_GUIDE,heroMasteryNext} from './playable-heroes-core.js'

const formatNumber=value=>Number(value||0).toLocaleString('pt-BR')

// Só exibe poderes de estágios pagos e liberados. Boss/Raid e PvP têm versões distintas.
export function formatPlayableHeroMasteryEffects(sheet){
  if(!sheet)return []
  const guide=HERO_SKILL_GUIDE[sheet.heroId],pvp=HERO_PVP_SKILL_GUIDE[sheet.heroId]
  if(!guide||!pvp)return []
  const stage=Math.max(1,Math.min(5,Math.floor(Number(sheet.masteryStage)||1)))
  const roman=['I','II','III','IV','V'],keys=['passive','special','ultimate']
  const lines=['','🌟 *MAESTRIA '+roman[stage-1]+' — PODERES LIBERADOS*','⚔️ *Boss/Raid*']
  for(let i=0;i<Math.min(stage,3);i++)lines.push('✅ '+roman[i]+' — '+guide[keys[i]])
  if(stage>=4)lines.push('✅ IV — +1% de dano (respeitando o teto de combate).')
  if(stage>=5)lines.push('✅ V — +1% adicional de dano (respeitando o teto de combate).')
  lines.push('','🏟️ *PvP — versões limitadas*')
  for(let i=0;i<Math.min(stage,3);i++)lines.push('✅ '+roman[i]+' — '+pvp[keys[i]])
  if(stage>=4)lines.push('✅ IV — +0,5% de dano (respeitando o limite por ataque).')
  if(stage>=5)lines.push('✅ V — +0,5% adicional de dano (respeitando o limite por ataque).')
  const next=heroMasteryNext(stage)
  if(next)lines.push('','🔓 *Próxima maestria '+roman[next.stage-1]+':* '+
    formatNumber(next.xp)+' XP + R$ '+formatNumber(next.cost)+
    ' • faltam '+formatNumber(Math.max(0,next.xp-Number(sheet.masteryXp||0)))+' XP.')
  else lines.push('','🏆 Maestria máxima liberada.')
  return lines
}
