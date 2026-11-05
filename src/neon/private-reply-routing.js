// A identidade @lid e a identidade telefonica @s.whatsapp.net podem apontar
// para a mesma pessoa, mas NAO sao intercambiaveis para o transporte Signal.
// Responder na mesma conversa que originou o comando preserva a identidade
// criptografica que o cliente WhatsApp ja usou no inbound.
// Regressao anterior: forcar PN no lugar de @lid produziu mensagens ilegiveis.
export function routePrivateReply(chat, _sender){
  const inbound=String(chat||'')
  return {jid:inbound,quoted:true,normalized:false}
}
