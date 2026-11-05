// Respostas privadas podem chegar com o chat em @lid mesmo quando o
// WhatsApp fornece um alias telefônico verificável do remetente.
// A versão Baileys 6.7.x pode produzir mensagens que o celular não consegue
// descriptografar quando um envio direto usa @lid.
export function routePrivateReply(chat, sender){
  const inbound=String(chat||'')
  const canonical=String(sender||'').replace(/:\d+(?=@)/,'')
  if(inbound.endsWith('@lid') && canonical.endsWith('@s.whatsapp.net')){
    // Não incluir quoted apontando para outro identificador de conversa.
    return {jid:canonical,quoted:false,normalized:true}
  }
  return {jid:inbound,quoted:true,normalized:false}
}
