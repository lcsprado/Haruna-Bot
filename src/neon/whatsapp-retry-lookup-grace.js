// O WhatsApp pode pedir reenvio antes de sock.sendMessage resolver.
// Nesse intervalo, a mensagem ainda nao foi salva no cache/durable store.
// Esperar so em DMs e so quando houve miss, sem afetar grupos ou a sessao Signal.
const PRIVATE_JID=/^\d{10,20}@(lid|s\.whatsapp\.net)$/;
export async function lookupOutboundWithGrace(lookup,key,{
  maxAttempts=6,delayMs=150,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}={}){
  if(typeof lookup!=='function')throw new TypeError('lookup obrigatorio');
  let result=await lookup(key);
  if(result?.message||result?.source!=='miss'||
    !PRIVATE_JID.test(String(key?.remoteJid||'')))return result;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    await sleep(delayMs);
    result=await lookup(key);
    if(result?.message||result?.source!=='miss')break;
  }
  return result;
}
