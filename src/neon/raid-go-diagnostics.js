// Traduz ausencia de sala do próprio host em diagnóstico útil, sem mudar a autorização.
// Uma Raid visível no grupo não implica que o autor do !go seja o host.
const safeName=value=>String(value||'outro jogador').replace(/[\r\n*_`~]/g,' ').trim().slice(0,60)||'outro jogador'
export function raidGoUnavailableMessage({rooms=[],level=null,sender='' }={}){
 const requested=Number(level)||null
 const open=Array.isArray(rooms)?rooms.filter(r=>r&&['lobby','active'].includes(r.status)&&(!requested||Number(r.level)===requested)):[]
 const lobby=open.filter(r=>r.status==='lobby')
 if(!lobby.length){
  const active=open.filter(r=>r.status==='active')
  if(active.length===1){
   const raidLevel=Number(active[0].level)
   return '⚔️ A Raid Lv.'+raidLevel+' já está em andamento. Consulte *!raid '+raidLevel+'*. Não é necessário usar !go novamente.'
  }
  if(active.length>1)return '⚔️ Há Raids em andamento neste grupo. Consulte *!raid* para acompanhar. Nenhuma sala aguarda início.'
  return requested
   ?'❌ Não existe sala aguardando início da Raid Lv.'+requested+' neste grupo. Consulte *!raid '+requested+'* ou abra uma nova sala quando estiver disponível.'
   :'❌ Você não possui Raid aguardando início neste grupo. Use *!raid* para ver as salas e *!entrar NÍVEL* para participar.'
 }
 if(lobby.length>1){
  return '⚔️ Há várias salas aguardando neste grupo:\n'
   +lobby.map(r=>'• Lv.'+Number(r.level)+' — host: *'+safeName(r.hostName)+'*'+(r.host===sender?' (sua sala)':'')).join('\n')
   +'\nApenas o host pode começar. Consulte *!raid* para ver as salas; informe o nível em *!go NÍVEL* se for o host.'
 }
 const room=lobby[0],raidLevel=Number(room.level),hostName=safeName(room.hostName)
 if(room.host===sender)return '⚠️ A Raid Lv.'+raidLevel+' está aberta em seu nome, mas não foi possível selecioná-la para iniciar. Use *!go '+raidLevel+'* ou consulte *!raid '+raidLevel+'*.'
 const participant=Boolean(room.players&&Object.prototype.hasOwnProperty.call(room.players,String(sender)))
 return '⚔️ A *Raid Lv.'+raidLevel+'* está aguardando, mas o host é *'+hostName+'*.\n'
  +(participant
   ?'✅ Você já participa desta sala. Peça ao host para enviar *!go '+raidLevel+'*.'
   :'👥 Você ainda não entrou nessa sala. Use *!entrar '+raidLevel+'* para participar.\n')
  +'\n🔒 Somente o host pode iniciar a Raid, usando *!go '+raidLevel+'*.'
}
