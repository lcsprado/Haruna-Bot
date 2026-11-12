// Relatório detalhado do PvP: não altera dano, regras nem recompensas.
import {PECADOS_HEROES} from './sete-pecados-catalog.js'
import {getPlayerClass} from './game-catalog.js'
const heroName=id=>PECADOS_HEROES.find(h=>h.species===id)?.name||'Herói'

const fmt=value=>Math.max(0,Number(value)||0).toLocaleString('pt-BR')
const percent=value=>(Math.max(0,Number(value)||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'
const name=value=>String(value||'Jogador')
function openingLine(icon,p){
  if(!p)return `${icon} *Dados iniciais indisponíveis*`
  const bonus=p.petPvpBonus
  const pet=p.petName
    ?`🐾 ${p.petName} — PvP: 💥 +${percent(bonus?.damage)} dano • 🛡️ -${percent(bonus?.defense)} recebido • 🎯 +${percent(bonus?.crit)} p.p. CRIT • 🌀 ${percent(bonus?.dodge)} esquiva${Number(bonus?.speed||0)>0?` • 👢 +${fmt(bonus.speed)} VEL`:''}`
    :'🐾 Sem pet apto para bônus individuais no PvP'
  const hero=p.heroId?'\n🌈⚔️ Personagem: *'+heroName(p.heroId)+'* • Maestria '+fmt(p.heroMasteryStage||1)+'/5':''
  const classMode=!p.heroId&&p.classApplied&&p.classId
    ?'\n🧙 Classe: *'+(getPlayerClass(p.classId)?.name||p.classId)+'* • Despertar '+fmt(p.awakeningStage||0)+'/5'
    :''
  const equipment=(p.weaponName||p.armorName)
    ?'\n🗡️ Arma em uso: *'+(p.weaponName||'Nenhuma')+'* • 🥋 Armadura: *'+(p.armorName||'Nenhuma')+'*'
    :''
  const collab=p.heroId?p.heroGear:null
  // Capturas anteriores à V2 ainda podem ter o contrato legado (attack/defense);
  // preserve a leitura correta desses relatórios sem fingir bônus V2 retroativos.
  const weaponLabel=collab?.weapon
    ?('weaponDamage' in collab?'🗡️ Arma vinculada +'+percent(collab.weaponDamage)+' dano final':
      '🗡️ Arma correspondente +'+percent(collab.attack)+' dano')
    :'Arma correspondente não equipada'
  const armorLabel=collab?.armor
    ?('finalReduction' in collab?'🥋 Armadura vinculada -'+percent(collab.finalReduction)+' dano recebido':
      '🥋 Armadura correspondente -'+percent(collab.defense)+' dano recebido')
    :'Armadura correspondente não equipada'
  const gear=collab
    ?'\n🌈 Collab: '+weaponLabel+' • '+armorLabel+
      (collab.set?'\n🌈 Conjunto sagrado: +'+percent(collab.setDamage)+' dano final • +'+percent(collab.crit).replace('%',' p.p.')+' CRIT':'')
    :''
  const vital=Number(p.vitalHpRate||0)>0
    ?'\n🧬 HP de combate +'+percent(p.vitalHpRate)+' • Coração Eterno: '+(Number(p.vitalPulseRate||0)>0?'cura uma vez abaixo de 35%':'inativo')
    :''
  const shield=p.shieldName?'\n🛡️ Escudo: *'+p.shieldName+'* • -'+percent(p.shieldCritResist).replace('%',' p.p.')+' chance CRIT adversária • -'+percent(p.shieldCritGuard)+' bônus de dano CRIT':''
  return `${icon} *${name(p.name)}*${hero}${classMode}${gear}${equipment}\n❤️ ${fmt(p.hp)}/${fmt(p.maxHp)} • ⚔️ ${fmt(p.atk)} • 🛡️ ${fmt(p.def)}\n🎯 ${percent(p.crit)} CRIT • 👢 ${fmt(p.spd)} VEL\n${pet}${vital}${shield}`
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
      lines.push(e.vitalPulse?`💚 Coração Eterno de ${name(e.from)} restaurou *+${fmt(e.heal)} HP* — ❤️ ${fmt(e.hp)}`:`💚 Pet de ${name(e.from)} curou *+${fmt(e.heal)} HP* — ❤️ ${fmt(e.hp)}`)
    }else if(e.classHeal){
      const who=[attacker,defender].find(p=>p&&(p.jid===e.fromJid||p.name===e.from))
      lines.push(`⚜️ ${name(e.from)} recuperou *+${fmt(e.heal)} HP* (${who?.heroId?'habilidade de '+heroName(who.heroId):'habilidade da classe'}) — ❤️ ${fmt(e.hp)}`)
    }else if(e.dodged){
      lines.push(`🌀 ${name(e.to)} esquivou de ${name(e.from)} — ❤️ ${fmt(e.hp)}`)
    }else{
      const prefix=e.crit?'💥 CRÍTICO! ':'⚔️ '
      lines.push(`${prefix}${name(e.from)} → ${name(e.to)}: *${fmt(e.dmg)} dano* — ❤️ ${fmt(e.hp)}`)
      if(e.heroTechnique)lines.push(`✨ Técnica: *${name(e.heroTechnique)}* — ${name(e.from)}`)
    }
    if(e.defenseTechnique)lines.push(`🛡️ ${name(e.to)} ativou *${name(e.defenseTechnique)}* • mitigação defensiva total no golpe: ${fmt(e.defenseBlocked)} dano`)
  }
  for(const p of [attacker,defender].filter(Boolean)){
    if(p.heroId==='pecado_ban'){
      const attacks=events.filter(e=>!e.petHeal&&!e.classHeal&&(e.fromJid||e.from)===(p.jid||p.name)).length
      if(attacks<6)lines.push(`ℹ️ Ban (${name(p.name)}): cura periódica começa no 3º ataque e pode repetir no 6º; nesta luta foram ${attacks}.`)
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
