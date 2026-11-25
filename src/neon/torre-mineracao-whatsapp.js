// Comandos em homologação isolada; nunca ativar na produção sem nova aprovação.
import {STONES,MINING_RARITY_WEIGHTS} from './enchantment-stones-catalog.js'
import {MINING_HOURLY,parseMiningDuration,miningSessionQuote} from './mining-session-v2.js'
import {createHash} from 'node:crypto'
import {MINING_PICKAXES,miningPickaxesBySource,miningQuote,miningRepairQuote} from './torre-mineracao-4h.js'
import {getMiningPickaxes,getMiningStatus,buyMiningPickaxe,repairMiningPickaxe,startMiningExpedition,cancelMiningExpedition,claimMiningExpedition} from './torre-mineracao-store.js'

const commands=new Set(['minerar','picaretas','comprarpicareta','repararpicareta'])
const money=n=>Number(n).toLocaleString('pt-BR')
const time=s=>{const mins=Math.ceil(Math.max(0,Number(s)||0)/60);return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}min`}
const label=p=>p.name.replace(/^Picareta de /,'')
const stonesText=stones=>Object.entries(stones||{}).map(([id,n])=>'• '+(STONES[id]?.name||id)+' ×'+n+' — '+(STONES[id]?.label||'')).join('\n')||'🪨 Nenhuma pedra encontrada.'
const receipt=r=>`⛏️ *MINERAÇÃO ${r.early?'ENCERRADA':'CONCLUÍDA'}!*\n💰 Dinheiro: +R$ ${money(r.cash)}\n✨ XP: +${money(r.awardedXp)}\n💎 Pedras:\n${stonesText(r.stones)}\n✅ Recompensa creditada uma vez.`
const keyFor=({sender,chat,messageId,cmd})=>{
  if(!messageId||typeof messageId!=='string')throw new Error('Identificador da mensagem ausente; tente novamente.')
  return createHash('sha256').update([sender,chat,messageId,cmd].join('|')).digest('hex').slice(0,40)
}
function pickaxeId(raw){
  const id=String(raw||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  if(!Object.hasOwn(MINING_PICKAXES,id))throw new Error('Picareta inválida. Use !picaretas.')
  return id
}
export async function handleMiningCommand({db,cmd,args=[],sender,chat,messageId,reply}){
  if(!commands.has(cmd))return false
  const own=()=>getMiningPickaxes(db,sender)
  if(cmd==='picaretas'){
    const rows=await own(),owned=new Map(rows.map(p=>[p.pickaxeId,p]))
    let output='⛏️ *PICARETAS DA TORRE*\n\n'
    for(const [id,p] of Object.entries(MINING_PICKAXES)){
      const got=owned.get(id)
      output+=`• *${label(p)}* — chance ${p.stoneChancePercent}% a cada 5min • ${p.maxUses} usos${p.source==='cerco'?' • 🏰 Cerco':p.source==='evento_inaugural'?' • 🎁 Evento inaugural':''}\n`
      output+=`  💰 R$ ${money(MINING_HOURLY[id].cash)}/h • ${money(MINING_HOURLY[id].xp)} XP base/h\n`
      output+='  💎 Se cair pedra: '+MINING_RARITY_WEIGHTS[id].map((n,i)=>['Comum','Rara','Épica','Lendária'][i]+' '+n+'%').join(' • ')+'\n'
      output+=got?`  ✅ Sua resistência: ${got.usesRemaining}/${p.maxUses} • reparo agora R$ ${money(miningRepairQuote(id,got.usesRemaining).costCash)}\n`
        :p.source==='loja'?`  🛒 R$ ${money(p.purchaseCash)} • !comprarpicareta ${id}\n`
        :`  🔒 Exclusiva: ${p.source==='cerco'?'Cerco':'primeiro evento'}\n`
    }
    output+='\n⏱️ Escolha 30min ou 1h a 8h, conforme resistência. 30min/1h = 1 uso; cada hora adicional = 1 uso. XP sujeito às regras da temporada.\n🛠️ Use !repararpicareta [tipo] para reparar com dinheiro.'
    await reply(output)
    return true
  }
  if(cmd==='comprarpicareta'){
    const id=pickaxeId(args[0])
    const r=await buyMiningPickaxe(db,{jid:sender,pickaxeId:id,key:keyFor({sender,chat,messageId,cmd})})
    await reply(`🛒 *PICARETA COMPRADA*\n⛏️ ${r.name}\n💰 R$ ${money(r.priceCash)}\n🛠️ Use !minerar iniciar ${id} 30m para começar uma expedição de 30 minutos.`)
    return true
  }
  if(cmd==='repararpicareta'){
    const id=pickaxeId(args[0])
    const r=await repairMiningPickaxe(db,{jid:sender,pickaxeId:id,key:keyFor({sender,chat,messageId,cmd})})
    await reply(r.status==='full'? '🛠️ Essa picareta já está com resistência máxima.':
      `🛠️ *PICARETA REPARADA*\n⛏️ ${miningQuote(id).name}\n💰 Reparo: R$ ${money(r.costCash)}\n❤️ Resistência: ${r.usesAfterRepair}/${miningQuote(id).maxUses}`)
    return true
  }
  const action=String(args[0]||'').toLowerCase()
  if(action==='resgatar'||action==='coletar'){
    const r=await claimMiningExpedition(db,sender)
    if(r.status==='none'){await reply('⛏️ Você não tem mineração pendente para resgatar.');return true}
    if(r.status==='running'){await reply('⏳ A mineração ainda não acabou. Falta '+time(r.remainingSeconds)+'.');return true}
    await reply(receipt(r))
    return true
  }
  if(action==='cancelar'){
    const r=await cancelMiningExpedition(db,sender)
    await reply(r.status==='none'?'⛏️ Você não está minerando.':r.status==='claimed'?receipt(r):'🚪 Mineração cancelada sem ciclos concluídos. A resistência reservada não é devolvida.')
    return true
  }
  if(action==='iniciar'){
    const id=pickaxeId(args[1])
    if(!args[2]){const p=(await own()).find(x=>x.pickaxeId===id);if(!p)throw Error('Você não possui essa picareta.');const options=[1800,...Array.from({length:p.usesRemaining},(_,i)=>(i+1)*3600)].filter(d=>Math.ceil(d/3600)<=p.usesRemaining).map(d=>{const q=miningSessionQuote(id,p.usesRemaining,d);return `• ${time(d)} — ${q.usesCost} uso(s) • R$ ${money(q.cash)} • ${money(q.xp)} XP — !minerar iniciar ${id} ${d===1800?'30m':d/3600+'h'}`});await reply('⛏️ *ESCOLHA A DURAÇÃO*\n'+(options.join('\n')||'Sem resistência. Repare a picareta.'));return true}
    const durationSeconds=parseMiningDuration(args[2]);
    const r=await startMiningExpedition(db,{jid:sender,pickaxeId:id,durationSeconds,key:keyFor({sender,chat,messageId,cmd})})
    await reply(`⛏️ *MINERAÇÃO INICIADA!*\n🛠️ ${miningQuote(id).name}\n⏳ Duração: ${time(durationSeconds)}\n💎 Chance de pedra: ${miningQuote(id).stoneChancePercent}% a cada 5min\n❤️ Usos reservados: ${Math.ceil(durationSeconds/3600)}\n❤️ Resistência restante: ${r.usesAfter ?? 'já debitada'}\n🔒 Raidlote, Carpinar e Dormir indisponíveis durante a expedição.\n✅ No fim, use *!minerar resgatar*. Para encerrar antes e receber ciclos completos: *!minerar cancelar* (resistência reservada não devolvida).`)
    return true
  }
  if(action&&action!=='status'&&action!=='ajuda'){await reply('⛏️ Use !minerar iniciar [madeira|ferro|aco|ouro|diamante], !minerar resgatar ou !minerar cancelar.');return true}
  const running=await getMiningStatus(db,sender)
  if(running){
    await reply(running.ready?`⛏️ *EXPEDIÇÃO PRONTA!*\n⛏️ ${miningQuote(running.pickaxe_id).name}\n🎁 Use *!minerar resgatar* para receber os prêmios.`
      :`⛏️ *MINERAÇÃO EM ANDAMENTO*\n⛏️ ${miningQuote(running.pickaxe_id).name}\n⏳ Falta: ${time(running.remainingSeconds)}${running.progress?'\n💎 Pedras encontradas:\n'+stonesText(running.progress.stones)+'\n💰 Acumulado: R$ '+money(running.progress.cash)+' • '+money(running.progress.xp)+' XP base':''}\n🚪 Use !minerar cancelar para encerrar. Sessões novas pagam os ciclos completos.`)
    return true
  }
  const owned=await own()
  await reply('⛏️ *MINERAÇÃO DA TORRE*\n⏱️ 30min ou 1h a 8h conforme resistência\n💰 R$ 1.500 a 5.000/h conforme picareta, mais XP base\n💎 Sorteio a cada 5min, sem limite de pedras por jornada\n🛠️ Suas picaretas: '+(owned.length?owned.map(p=>label(p)).join(', '):'nenhuma')+'\n\nVeja *!picaretas* e comece com *!minerar iniciar madeira*.')
  return true
}
