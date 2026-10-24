// Insígnias semanais independentes por data. Só uma pode ficar equipada.
const THEMES=[
  {name:'Vigília de Obsidiana',icon:'🗿'},
  {name:'Coração Vulcânico',icon:'🌋'},
  {name:'Juramento Glacial',icon:'❄️'},
  {name:'Tempestade Primordial',icon:'⚡'}
]
function theme(weekendKey){
  const date=Date.parse(String(weekendKey)+'T12:00:00-03:00')
  if(!Number.isFinite(date))return null
  return THEMES[Math.floor(date/(7*86400000))%THEMES.length]
}
export function weeklyInsignia(weekendKey,champion=false){
  const key=String(weekendKey||'')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return null
  const t=theme(key)
  if(!t)return null
  const suffix=key.replace(/-/g,'')
  const pretty=key.slice(8,10)+'/'+key.slice(5,7)+'/'+key.slice(0,4)
  const name=t.icon+' Insígnia '+t.name+' — '+(champion?'Soberano':'Guardião')+' '+pretty
  return {
    id:'insignia_semanal_'+suffix+'_'+(champion?'campeao':'guardiao'),
    name,
    effect:champion?'👑 +3% dano e +1 p.p. de crítico em Boss/Raid (sem PvP)':'🛡️ +1% dano em Boss/Raid (sem PvP)',
    boss:champion?.03:.01,raidAttack:champion?.03:.01,
    bossCrit:champion?.01:0,raidCrit:champion?.01:0,
    rarity:champion?'Lendário Exclusivo':'Evento Único'
  }
}
export function weeklyInsigniaFromId(itemId){
  const match=/^insignia_semanal_(\d{4})(\d{2})(\d{2})_(campeao|guardiao)$/.exec(String(itemId||''))
  if(!match)return null
  const key=match[1]+'-'+match[2]+'-'+match[3]
  const result=weeklyInsignia(key,match[4]==='campeao')
  return result?.id===itemId?result:null
}