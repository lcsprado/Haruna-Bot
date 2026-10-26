// Correção auditável da collab de 25/10. Somente leitura do ledger final,
// nunca calcula dano a partir do HP ajustado nem concede recompensas.
const PHASES=[
  ['preguica','Preguiça'],['gula','Gula'],['ganancia','Ganância'],
  ['inveja','Inveja'],['luxuria','Luxúria'],['ira','Ira'],
  ['soberba','Soberba'],['azazel','Azazel']
]
const fmt=n=>Number(n||0).toLocaleString('pt-BR')
const clean=s=>String(s||'Jogador').replace(/[\r\n*_~]/g,' ').trim().slice(0,65)

export function auditSetePecados25(state){
  if(!state||state.eventId!=='sete_pecados'||
     state.scheduleKey!=='sete-pecados-collab-20261025'||
     state.outcome!=='defeated'||!state.completedAt)return null
  const ledger=state.ledger||{}
  const players=Object.entries(ledger).map(([jid,p])=>({
    jid,name:clean(p?.name),phases:p?.phases||{}
  }))
  if(!players.length)return null
  const rounds=PHASES.map(([id,name])=>{
    const ranking=players.map(p=>({
      jid:p.jid,name:p.name,damage:Math.max(0,Number(p.phases[id]||0))
    })).filter(p=>p.damage>0).sort((a,b)=>b.damage-a.damage)
    return {id,name,ranking,total:ranking.reduce((n,p)=>n+p.damage,0)}
  })
  const total=rounds.reduce((n,r)=>n+r.total,0)
  const complete=players.filter(p=>PHASES.every(([id])=>Number(p.phases[id]||0)>=10000))
  return {rounds,total,complete}
}

export function formatSetePecados25Correction(state){
  const a=auditSetePecados25(state)
  if(!a)return null
  const soberba=a.rounds.find(r=>r.id==='soberba')
  const azazel=a.rounds.find(r=>r.id==='azazel')
  const ira=a.rounds.find(r=>r.id==='ira')
  if(!soberba||!azazel||!ira||!soberba.ranking.length)return null
  const rankLine=(p,i)=>(i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅')+
    ' '+(i+1)+'º '+p.name+' — '+fmt(p.damage)+' dano'
  const fmtRank=r=>r.ranking.map(rankLine).join('\n')
  return '⚖️📋 *RETIFICAÇÃO OFICIAL — SETE PECADOS (25/10)*\n\n'+
    'O boletim anterior mostrou apenas o TOP 3 e omitiu jogadores que participaram. *Essa omissão não significa falta de colaboração.*\n\n'+
    '👑 *7º PECADO — SOBERBA*\n'+
    '💥 Total registrado: *'+fmt(soberba.total)+'*\n'+fmtRank(soberba)+'\n\n'+
    '✅ *Augusto colaborou:* '+fmt(soberba.ranking.find(p=>p.name==='Augusto')?.damage||0)+
    ' de dano, acima do mínimo de 10.000. As 2 essências da Soberba já foram creditadas.\n\n'+
    '👹 *AZAZEL — RESULTADO FINAL*\n'+
    '💥 Total registrado: *'+fmt(azazel.total)+'*\n'+fmtRank(azazel)+'\n\n'+
    '🔥 *Ira:* '+fmt(ira.total)+' de dano real somado dos jogadores.\n'+
    '📊 *Dano total das oito fases:* '+fmt(a.total)+'.\n'+
    '🏆 *Concluíram os oito Bosses:* '+a.complete.map(p=>p.name).join(', ')+'.\n\n'+
    '🎁 A premiação já processada foi preservada; não houve crédito duplicado.\n'+
    '🩸 Na edição de 25/10 eram *2 essências por cada um dos 7 pecados* (14 possíveis); *não havia 7 essências extras* pelo encerramento.\n'+
    '📌 Os números acima foram conferidos no registro de dano individual do evento, sem estimativa de golpes.\n'+
    '✅ *Esta mensagem substitui os boletins incompletos anteriores.*'
}
