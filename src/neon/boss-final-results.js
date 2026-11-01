// Formatação pura: nunca paga recompensas, apenas apresenta a liquidação já gravada.
const fmt = value => Math.max(0,Math.round(Number(value)||0)).toLocaleString('pt-BR')
const safeName = value => String(value||'Jogador').replace(/[\r\n\t*_~`]/g,' ').trim().slice(0,55)||'Jogador'

export function isNaturalBossEndError(error){
  const message=String(error?.message||error||'')
  return message.includes('Não há Boss ativo.') ||
    message.includes('O Superboss semanal encerrou.')
}

export function bossSettlementSnapshot(state,rewards){
  return {
    bossName:String(state?.name||'Boss'),
    maxHp:Number(state?.maxHp||0),
    rewards:(rewards||[]).map(player=>({
      jid:player.jid,
      name:player.name,
      position:Number(player.position||0),
      damage:Number(player.damage||0),
      cash:Number(player.cash||0),
      exp:Number(player.exp||0),
      petXp:Number(player.petXp||0),
      petXpTeam:Array.isArray(player.petXpTeam)?player.petXpTeam:[],
      drops:Array.isArray(player.drops)?player.drops:[]
    }))
  }
}

export function weeklyBossResultMessages(state,maxLength=3500){
  if(state?.mode!=='completed'||!state?.weeklyCompleted||!Array.isArray(state?.result?.rewards)||!state.result.rewards.length) return []
  const rewards=[...state.result.rewards].sort((a,b)=>Number(a.position||0)-Number(b.position||0))
  const heading='🏆 *SUPERBOSS SEMANAL DERROTADO!*\n'+
    '👹 *'+safeName(state.result.bossName||state.name)+'*\n'+
    '❤️ HP eliminado: *'+fmt(state.result.maxHp||state.maxHp)+'*\n\n'+
    '🏅 *COLOCAÇÃO E PRÊMIOS*'
  const footer='\n\n✅ *Prêmios já creditados.* Esta mensagem não distribui recompensas novamente.'
  const messages=[]
  let current=heading
  for(const p of rewards){
    const rank=Number(p.position||0)
    const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'🏅'
    const drops=(p.drops||[]).map(d=>safeName(d.name)).filter(Boolean)
    const petXp=(p.petXpTeam||[]).length
      ?'\n🐾 '+p.petXpTeam.map(t=>safeName(t.name)+' +'+fmt(t.xp)+' XP').join(' • ')
      :(Number(p.petXp||0)>0?'\n🐾 +'+fmt(p.petXp)+' XP pet':'')
    const line='\n\n'+medal+' *'+rank+'º '+safeName(p.name)+'* — '+fmt(p.damage)+' dano'+
      '\n💰 R$ '+fmt(p.cash)+' • ✨ +'+fmt(p.exp)+' XP'+petXp+
      (drops.length?'\n🎁 '+drops.join(' + '):'')
    if(current.length+line.length+footer.length>maxLength && current!==heading){
      messages.push(current)
      current=heading+' *(continuação)*'
    }
    current+=line
  }
  messages.push(current+footer)
  return messages
}
