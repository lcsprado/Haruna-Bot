// Relatório detalhado do PvP: não altera dano, regras nem recompensas.
const fmt=value=>Math.max(0,Number(value)||0).toLocaleString('pt-BR')
const percent=value=>(Math.max(0,Number(value)||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'
const name=value=>String(value||'Jogador')
function openingLine(icon,p){
  if(!p)return `${icon} *Dados iniciais indisponíveis*`
  const bonus=p.petPvpBonus
  const pet=p.petName
    ?`🐾 ${p.petName} — PvP: 💥 +${percent(bonus?.damage)} dano • 🛡️ -${percent(bonus?.defense)} recebido • 🎯 +${percent(bonus?.crit)} p.p. CRIT • 🌀 ${percent(bonus?.dodge)} esquiva${Number(bonus?.speed||0)>0?` • 👢 +${fmt(bonus.speed)} VEL`:''}`
    :'🐾 Sem pet apto para bônus individuais no PvP'
  return `${icon} *${name(p.name)}*\n❤️ ${fmt(p.hp)}/${fmt(p.maxHp)} • ⚔️ ${fmt(p.atk)} • 🛡️ ${fmt(p.def)}\n🎯 ${percent(p.crit)} CRIT • 👢 ${fmt(p.spd)} VEL\n${pet}`
}
export function formatPvpBattleReport(r){
  if(!r?.ok||!r?.winner||!r?.loser)throw new Error('Resultado de PvP inválido.')
  const attacker=r.opening?.attacker||null
  const defender=r.opening?.defender||null
  const events=Array.isArray(r.log)?r.log:[]
  const roundCount=Math.max(0,Number(r.roundCount)||events.reduce((n,e)=>Math.max(n,Number(e.round)||0),0))
  const damage=new Map(),crits=new Map(),dodges=new Map(),petHeals=new Map(),classHeals=new Map()
  const petExtraDamage=new Map(),petDamageBlocked=new Map(),petCrits=new Map(),petDodges=new Map()
  const add=(map,key,value=1)=>map.set(key,(map.get(key)||0)+value)
  for(const e of events){
    if(e.petHeal){add(petHeals,e.fromJid||e.from,Number(e.heal)||0);continue}
    if(e.classHeal){add(classHeals,e.fromJid||e.from,Number(e.heal)||0);continue}
    add(damage,e.fromJid||e.from,Math.max(0,Number(e.actualDamage??e.dmg)||0))
    add(petExtraDamage,e.fromJid||e.from,Math.max(0,Number(e.petExtraDamage)||0))
    add(petDamageBlocked,e.toJid||e.to,Math.max(0,Number(e.petDamageBlocked)||0))
    if(e.petCrit)add(petCrits,e.fromJid||e.from)
    if(e.petDodge)add(petDodges,e.toJid||e.to)
    if(e.crit)add(crits,e.fromJid||e.from)
    if(e.dodged)add(dodges,e.toJid||e.to)
  }
  const lines=['⚔️ *BATALHA DO ALPHA BOT*','','📋 *CONDIÇÕES INICIAIS*',
    openingLine('🟢',attacker),'',openingLine('🔴',defender)]
  if(attacker&&defender){
    const first=attacker.spd>=defender.spd?attacker.name:defender.name
    lines.push(`⚡ Primeiro ataque: *${name(first)}*`)
  }
  lines.push('',`⚔️ *COMBATE — ${roundCount} RODADA(S)*`)
  let previousRound=null
  for(const e of events){
    const round=Number(e.round)||1
    if(round!==previousRound){lines.push('',`🔹 *Rodada ${round}*`);previousRound=round}
    if(e.petHeal){
      lines.push(`💚 Pet de ${name(e.from)} curou *+${fmt(e.heal)} HP* — ❤️ ${fmt(e.hp)}`)
    }else if(e.classHeal){
      lines.push(`⚜️ ${name(e.from)} recuperou *+${fmt(e.heal)} HP* (habilidade da classe) — ❤️ ${fmt(e.hp)}`)
    }else if(e.dodged){
      lines.push(`🌀 ${name(e.to)} esquivou de ${name(e.from)} — ❤️ ${fmt(e.hp)}`)
    }else{
      const prefix=e.crit?'💥 CRÍTICO! ':'⚔️ '
      lines.push(`${prefix}${name(e.from)} → ${name(e.to)}: *${fmt(e.dmg)} dano* — ❤️ ${fmt(e.hp)}`)
    }
  }
  lines.push('','📊 *RESUMO DO DUELO*')
  for(const p of [attacker,defender].filter(Boolean)){
    const key=p.jid||p.name
    const healed=(petHeals.get(key)||0)+(classHeals.get(key)||0)
    lines.push(`${name(p.name)}: 💥 ${fmt(damage.get(key)||0)} dano efetivo • 🎯 ${fmt(crits.get(key)||0)} crítico(s) • 🌀 ${fmt(dodges.get(key)||0)} esquiva(s) • 💚 +${fmt(healed)} HP curados`)
  }
  lines.push('','🐾 *RESULTADO REAL DOS PETS NO PVP*')
  for(const p of [attacker,defender].filter(Boolean)){
    const key=p.jid||p.name
    if(!p.petName){lines.push(`${name(p.name)}: sem pet principal apto.`);continue}
    lines.push(`${name(p.name)} (${name(p.petName)}): 💥 +${fmt(petExtraDamage.get(key)||0)} dano extra direto • 🛡️ ${fmt(petDamageBlocked.get(key)||0)} dano bloqueado • 🎯 ${fmt(petCrits.get(key)||0)} crítico(s) ativados pelo pet • 🌀 ${fmt(petDodges.get(key)||0)} esquiva(s) • 💚 ${fmt(petHeals.get(key)||0)} HP curados pelo pet`)
  }
  lines.push('_Dano extra direto não inclui o aumento adicional causado pelos críticos ativados pelo pet._')
  if(r.ending&&attacker&&defender){
    lines.push(`❤️ HP ao fim das trocas: ${name(attacker.name)} ${fmt(r.ending.attackerHp)} • ${name(defender.name)} ${fmt(r.ending.defenderHp)}`)
  }
  if(r.decidedByLimit)lines.push('⚖️ Limite de 20 rodadas: vitória decidida pelo HP restante.')
  lines.push('',
    `🏆 *Vencedor: ${name(r.winner.name)}* — ❤️ ${fmt(r.winner.hp)} HP restante`,
    `💰 Prêmio: R$ ${fmt(r.reward)}`,
    `✨ EXP: +${fmt(r.winExp?.awardedGain??r.winXpGain??40)} vencedor / +${fmt(r.loseExp?.awardedGain??r.loseXpGain??15)} derrotado`)
  if(Number(r.winExp?.boostBonus||0)>0)lines.push(`⚡ Bônus pessoal de XP do vencedor: +${fmt(r.winExp.boostBonus)} (incluído no total)`)
  if(Number(r.loseExp?.boostBonus||0)>0)lines.push(`⚡ Bônus pessoal de XP do derrotado: +${fmt(r.loseExp.boostBonus)} (incluído no total)`)
  if(Number(r.eventMultiplier||1)>1)lines.push(`🔥 Evento de recompensa x${String(r.eventMultiplier).replace('.',',')} ativo`)
  if(Number(r.winExp?.levels||0)>0)lines.push(`⬆️ ${name(r.winner.name)} subiu ${fmt(r.winExp.levels)} nível(is)!`)
  if(Number(r.loseExp?.levels||0)>0)lines.push(`⬆️ ${name(r.loser.name)} subiu ${fmt(r.loseExp.levels)} nível(is)!`)
  return lines.join('\n')
}
