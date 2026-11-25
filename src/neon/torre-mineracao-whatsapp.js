// Comandos em homologação isolada; nunca ativar na produção sem nova aprovação.
import {STONES,MINING_RARITY_WEIGHTS} from './enchantment-stones-catalog.js'
import {createHash} from 'node:crypto'
import {MINING_PICKAXES,miningPickaxesBySource,miningQuote,miningRepairQuote} from './torre-mineracao-4h.js'
import {getMiningPickaxes,getMiningStatus,buyMiningPickaxe,repairMiningPickaxe,startMiningExpedition,cancelMiningExpedition,claimMiningExpedition} from './torre-mineracao-store.js'

const commands=new Set(['minerar','picaretas','comprarpicareta','repararpicareta'])
const money=n=>Number(n).toLocaleString('pt-BR')
const time=s=>{const mins=Math.ceil(Math.max(0,Number(s)||0)/60);return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}min`}
const label=p=>p.name.replace(/^Picareta de /,'')
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
      output+=`• *${label(p)}* — chance ${p.stoneChancePercent}% • ${p.maxUses} usos${p.source==='cerco'?' • 🏰 Cerco':p.source==='evento_inaugural'?' • 🎁 Evento inaugural':''}\n`
      output+='  💎 Se cair pedra: '+MINING_RARITY_WEIGHTS[id].map((n,i)=>['Comum','Rara','Épica','Lendária'][i]+' '+n+'%').join(' • ')+'\n'
      output+=got?`  ✅ Sua resistência: ${got.usesRemaining}/${p.maxUses} • reparo agora R$ ${money(miningRepairQuote(id,got.usesRemaining).costCash)}\n`
        :p.source==='loja'?`  🛒 R$ ${money(p.purchaseCash)} • !comprarpicareta ${id}\n`
        :`  🔒 Exclusiva: ${p.source==='cerco'?'Cerco':'primeiro evento'}\n`
    }
    output+='\n⏱️ Cada mineração dura 4h • sempre +R$ 800 e 250 XP base ao concluir (XP sujeito às regras da temporada).\n🛠️ Use !repararpicareta [tipo] para reparar com dinheiro.'
    await reply(output)
    return true
  }
  if(cmd==='comprarpicareta'){
    const id=pickaxeId(args[0])
    const r=await buyMiningPickaxe(db,{jid:sender,pickaxeId:id,key:keyFor({sender,chat,messageId,cmd})})
    await reply(`🛒 *PICARETA COMPRADA*\n⛏️ ${r.name}\n💰 R$ ${money(r.priceCash)}\n🛠️ Use !minerar iniciar ${id} para começar uma expedição de 4h.`)
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
    const stone=r.stoneId?'💎 *Pedra encontrada:* '+(STONES[r.stoneId]?.name||r.stoneId)+' — '+(STONES[r.stoneId]?.label||''):'🪨 Nenhuma pedra encontrada nesta expedição.'
    await reply(`⛏️ *MINERAÇÃO CONCLUÍDA!*\n💰 Dinheiro: +R$ ${money(r.cash)}\n✨ XP: +${money(r.awardedXp)}\n${stone}\n✅ Recompensa creditada uma vez.`)
    return true
  }
  if(action==='cancelar'){
    const r=await cancelMiningExpedition(db,sender)
    await reply(r.status==='none'?'⛏️ Você não está minerando.':
      '🚪 Mineração cancelada. Você não recebe dinheiro, XP ou pedra e o uso gasto não é devolvido.')
    return true
  }
  if(action==='iniciar'){
    const id=pickaxeId(args[1])
    const r=await startMiningExpedition(db,{jid:sender,pickaxeId:id,key:keyFor({sender,chat,messageId,cmd})})
    await reply(`⛏️ *MINERAÇÃO INICIADA!*\n🛠️ ${miningQuote(id).name}\n⏳ Duração: 4 horas\n💎 Chance de pedra: ${miningQuote(id).stoneChancePercent}%\n❤️ Resistência restante: ${r.usesAfter ?? 'já debitada'}\n🔒 Raidlote, Carpinar e Dormir indisponíveis durante a expedição.\n✅ No fim, use *!minerar resgatar*.`)
    return true
  }
  if(action&&action!=='status'&&action!=='ajuda'){await reply('⛏️ Use !minerar iniciar [madeira|ferro|aco|ouro|diamante], !minerar resgatar ou !minerar cancelar.');return true}
  const running=await getMiningStatus(db,sender)
  if(running){
    await reply(running.ready?`⛏️ *EXPEDIÇÃO PRONTA!*\n⛏️ ${miningQuote(running.pickaxe_id).name}\n🎁 Use *!minerar resgatar* para receber os prêmios.`
      :`⛏️ *MINERAÇÃO EM ANDAMENTO*\n⛏️ ${miningQuote(running.pickaxe_id).name}\n⏳ Falta: ${time(running.remainingSeconds)}\n🚪 Use !minerar cancelar para sair sem recompensa.`)
    return true
  }
  const owned=await own()
  await reply('⛏️ *MINERAÇÃO DA TORRE*\n⏱️ 4 horas por jornada\n💰 +R$ 800 garantidos e 250 XP base (regras da temporada)\n💎 Chance de pedra conforme a picareta\n🛠️ Suas picaretas: '+(owned.length?owned.map(p=>label(p)).join(', '):'nenhuma')+'\n\nVeja *!picaretas* e comece com *!minerar iniciar madeira*.')
  return true
}
