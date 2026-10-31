// Interface WhatsApp da Garagem Alpha. Reaproveita o motor isolado e a economia real.
import {ensureUser} from './db.js'
import {racingTrack,racingDriverLevel} from './racing-rules.js'
import {
 raceMoney,raceNum,raceState,raceGarageText,raceCarsText,raceWorkshopText,
 raceBuy,raceEquip,raceUpgrade,raceRepair,raceSolo,raceChallenge,raceAccept,
 raceCancel,raceRanking,raceHistory
} from './racing-alpha.js'

const names=new Set(['corridas','corridacarros','garagemcorrida','corridagaragem','comprarcorrida',
 'equiparcorrida','oficina','melhorarcarro','repararcarro','corrida','rankcorrida',
 'pilotocorrida','desafiocorrida','aceitarcorrida','cancelarcorrida','historicocorrida'])

const safeName=name=>String(name||'Piloto').replace(/[\n\r*_~]/g,' ').slice(0,60)

export async function handleRacingAlphaCommand({cmd,args=[],sender,name='Piloto',chat,mentions=[],reply}){
 if(!names.has(cmd))return false
 try{
  await ensureUser(sender,name)
  const send=(text,opts)=>reply(text,opts)
  if(cmd==='corridas'){
   await send("🏎️ *GARAGEM ALPHA — GUIA*\n\n1️⃣ *!corridacarros* — modelos e preços\n2️⃣ *!comprarcorrida gol* — comprar\n3️⃣ *!garagemcorrida* — status\n4️⃣ *!equiparcorrida ID* — carro ativo\n5️⃣ *!oficina* — peças e tempos\n6️⃣ *!melhorarcarro motor* — preparar\n7️⃣ *!repararcarro* — recuperar condição\n8️⃣ *!corrida rua cidade equilibrada* — corrida solo\n9️⃣ *!desafiocorrida @jogador reta* — PvP\n🔟 *!aceitarcorrida tecnica* — aceitar\n🏆 *!rankcorrida* • 📜 *!historicocorrida*\n\n🏁 Pistas: reta, cidade, serra\n🎯 Estratégias: equilibrada, agressiva, tecnica\n⭐ Ligas: rua, bairro, cidade, estadual, elite, lenda\n⏳ 10 min entre corridas; uma instalação por vez.\n💰 Carro competitivo exige peças caras, oficina e XP de piloto.");
   return true
  }
  if(cmd==='corridacarros'){
   await send(raceCarsText());return true
  }
  if(['garagemcorrida','corridagaragem','pilotocorrida'].includes(cmd)){
   await send(raceGarageText(await raceState(sender)));return true
  }
  if(cmd==='comprarcorrida'){
   if(!args[0])throw Error('Use !corridacarros e depois !comprarcorrida gol.')
   const r=await raceBuy(sender,args[0])
   await send('🏎️ *CARRO DE CORRIDA COMPRADO!*\n🚘 '+r.model.name+' • ID '+r.id+
    '\n💸 '+raceMoney(r.model.price)+(r.autoEquipped?'\n✅ Equipado automaticamente.':'\n👉 !equiparcorrida '+r.id)+
    '\n🔧 Use !oficina para preparar. Não trabalha no Uber.')
   return true
  }
  if(cmd==='equiparcorrida'){
   if(!args[0])throw Error('Use !garagemcorrida e depois !equiparcorrida ID.')
   const model=await raceEquip(sender,args[0])
   await send('✅ *CARRO EQUIPADO PARA CORRIDAS*\n🚘 '+model+'\n🏁 Use !corrida ou !oficina.');return true
  }
  if(cmd==='oficina'){
   await send(raceWorkshopText(await raceState(sender)));return true
  }
  if(cmd==='melhorarcarro'){
   if(!args[0]){await send(raceWorkshopText(await raceState(sender)));return true}
   const r=await raceUpgrade(sender,args[0])
   const time=new Date(r.endsAt*1000).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
   await send('🔧 *INSTALAÇÃO INICIADA!*\n🚘 '+r.model+'\n'+r.part.name+' → Nv.'+r.next.level+' (*'+r.next.name+'*)'+
    '\n💸 '+raceMoney(r.next.price)+'\n⏳ Termina às *'+time+'* (Brasília).'+
    '\n⚠️ O carro não pode correr enquanto estiver na oficina. O tempo fica salvo mesmo se o bot reiniciar.')
   return true
  }
  if(cmd==='repararcarro'){
   const r=await raceRepair(sender)
   await send('🧰 *REPARO CONCLUÍDO*\n🚘 '+r.car+'\n❤️ Condição 100/100\n💸 '+raceMoney(r.cost));return true
  }
  if(cmd==='corrida'){
   const r=await raceSolo(sender,args)
   await send('🏁 *CORRIDA — '+r.tier.name.toUpperCase()+'*\n🚘 '+r.model+
    '\n🗺️ '+r.track.name+' • '+r.strategy.name+
    '\n\n🏎️ Sua performance: *'+r.own.toFixed(1)+'*\n🤖 Rival: *'+r.rival.toFixed(1)+'*'+
    '\n\n'+(r.won?'🏆 *VITÓRIA!*':'💨 *DERROTA!*')+
    '\n💰 +'+raceMoney(r.cash)+' • 👨‍✈️ +'+r.xp+' XP Piloto'+
    '\n❤️ Condição: '+r.condition+'/100 (-'+r.wear+')'+
    '\n⭐ Piloto Nv.'+r.pilotLevel+
    '\n⏳ Próxima corrida em 10 minutos.\n💡 !oficina • !repararcarro • !rankcorrida')
   return true
  }
  if(cmd==='rankcorrida'){
   const rows=await raceRanking()
   await send('🏆 *RANKING DE PILOTOS ALPHA*\n\n'+(rows.map((r,i)=>
    (i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.')+' '+safeName(r.push_name)+
    ' • '+r.wins+'V/'+r.losses+'D • Nv.'+racingDriverLevel(r.xp)).join('\n')||'Nenhuma corrida registrada.')+
    '\n\n⚖️ Ranking por vitórias reais, não por saldo.')
   return true
  }
  if(cmd==='historicocorrida'){
   const rows=await raceHistory(sender)
   await send('📜 *ÚLTIMAS 5 CORRIDAS*\n\n'+(rows.map(r=>
    (r.won?'🏆 Vitória':'❌ Derrota')+' • '+(r.mode==='pvp'?'PvP':r.tier_id)+
    ' • '+(racingTrack(r.track_id)?.name||r.track_id)+
    ' • +'+r.reward_xp+' XP • +'+raceMoney(r.reward_cash)).join('\n')||'Sem corridas.'))
   return true
  }
  if(cmd==='desafiocorrida'){
   const target=mentions[0]
   const r=await raceChallenge(sender,target,chat,args.filter(value=>!String(value).startsWith('@')),name)
   await send('🏁⚔️ *DESAFIO DE CORRIDA!*\n👨‍✈️ '+safeName(r.name)+' desafia @'+String(target).split('@')[0]+
    '\n🗺️ '+r.track.name+' • '+r.strategy.name+
    '\n⏳ 5 minutos para aceitar.\n👉 Adversário: *!aceitarcorrida equilibrada* (ou agressiva/tecnica).'+
    '\n🔒 PvP sem apostas e sem recompensa em dinheiro.',{mentions:[target]})
   return true
  }
  if(cmd==='aceitarcorrida'){
   const r=await raceAccept(sender,chat,args[0])
   await send('🏁 *CORRIDA PvP — RESULTADO*\n🗺️ '+r.track.name+
    '\n🚘 '+r.aCar+' • '+r.aScore.toFixed(1)+' pts'+
    '\n🚘 '+r.bCar+' • '+r.bScore.toFixed(1)+' pts'+
    '\n🏆 Vencedor: @'+String(r.winner).split('@')[0]+
    '\n👨‍✈️ XP: desafiante +'+r.aXp+' • desafiado +'+r.bXp+
    '\n❤️ Desgaste aplicado aos dois carros. ⏳ 10min até outra corrida.',{mentions:[r.challenger,r.challenged]})
   return true
  }
  if(cmd==='cancelarcorrida'){
   await raceCancel(sender);await send('🛑 Desafio cancelado.');return true
  }
 }catch(error){
  console.error('[RACING] comando rejeitado',cmd,String(error?.message||error).slice(0,180))
  await reply('🏎️ '+String(error?.message||'Corrida indisponível.').slice(0,290))
 }
 return true
}
