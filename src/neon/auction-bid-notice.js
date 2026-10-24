// Avisos globais de lances: somente os outros grupos recebem a notificação.
// Esta rotina não abre leilões nem altera saldos.
export function otherAuctionGroups(groups,originChat){
  if(!Array.isArray(groups))return []
  return [...new Set(groups.filter(jid=>typeof jid==='string'&&jid.endsWith('@g.us')&&jid!==originChat))]
}

export function crossGroupBidNotice({lot,totalLots,bidder,value,nextMinimum,endsAt}){
  const fmt=value=>'R$ '+Number(value).toLocaleString('pt-BR')
  const name=String(bidder||'Jogador').replace(/[\r\n*]/g,' ').replace(/\s+/g,' ').trim().slice(0,45)
  const close=new Date(Number(endsAt)).toLocaleTimeString('pt-BR',{
    timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'
  })
  return '📢 *LANCE DE OUTRO GRUPO!*'+
    '\n🔨 *LEILÃO DAS SOMBRAS — LOTE '+Number(lot)+'/'+Number(totalLots)+'*'+
    '\n👤 Jogador: *'+name+'*'+
    '\n💰 Novo maior lance: *'+fmt(value)+'*'+
    '\n📈 Para superar: *'+fmt(nextMinimum)+'*'+
    '\n⏳ Encerra às *'+close+'* (Brasília)'+
    '\n📩 Dê seu lance: *!lance '+Number(nextMinimum)+'*'+
    '\n🔒 Prêmios continuam secretos até o fim do lote.'
}
