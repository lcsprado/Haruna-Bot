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

export const RAID_LOBBY_TTL_MS=15*60*1000
// Nao reportar "inexistente" quando a ultima sala desse grupo expirou.
export function raidJoinUnavailableMessage({rooms=[],level=null,now=Date.now()}={}){
 const requested=Number(level)||null
 const matching=(Array.isArray(rooms)?rooms:[]).filter(r=>r&&(r.gameType==='raid'||String(r.gameType||'').startsWith('raid:'))
  &&(!requested||Number(r.level)===requested))
 const open=matching.filter(r=>['lobby','active'].includes(r.status)
  &&(r.status==='active'||Number(r.expiresAt||0)>now))
 if(open.length>1)return '⚔️ Há várias Raids abertas neste grupo. Escolha uma com '+open.map(r=>'*!entrar '+Number(r.level)+'*').join(' • ')+'.'
 if(open.length===1)return '⚔️ A Raid Lv.'+Number(open[0].level)+' está aberta. Use *!entrar '+Number(open[0].level)+'* para participar.'
 const expired=matching.filter(r=>r.status==='lobby'&&Number(r.expiresAt||0)>0&&Number(r.expiresAt)<=now)
  .sort((a,b)=>Number(b.expiresAt||0)-Number(a.expiresAt||0))
 if(expired.length){
  const room=expired[0],raidLevel=Number(room.level)
  const minutes=Math.max(1,Math.round((Number(room.expiresAt||0)-Number(room.createdAt||0))/60000))
  return '⌛ A Raid Lv.'+raidLevel+' de *'+safeName(room.hostName)+'* expirou após '+minutes+' minutos sem iniciar.\n'
   +'🔑 A chave não é consumida até o início.\n'
   +'👑 O host deve abrir outra com *!raid '+raidLevel+'*. Depois, entre com *!entrar '+raidLevel+'*.'
 }
 return requested
  ?'❌ Não há Raid Lv.'+requested+' aberta para entrar neste grupo. Use *!raid '+requested+'* para abrir uma nova sala.'
  :'❌ Não há Raid aberta para entrar neste grupo. Use *!raid* para consultar e abrir uma sala.'
}
