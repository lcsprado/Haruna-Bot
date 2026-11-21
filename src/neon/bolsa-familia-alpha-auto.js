// Um único anúncio no grupo por kit efetivamente creditado.
// Não há aviso prévio nem notificação para jogadores inelegíveis.
export function bolsaFamiliaAlphaAutoReceipt(result,jid){
  const player='@'+String(jid||'').split('@')[0]
  return `🏛️🎊 *━━━━━━━━━━━━━━━━* 🎊🏛️
      *BOLSA FAMÍLIA ALPHA*
      🎁 *BENEFÍCIO LIBERADO!*
🏛️🎊 *━━━━━━━━━━━━━━━━* 🎊🏛️

👤 *${player}*, seu kit emergencial foi entregue!

💰 *+ R$ ${Number(result.cash).toLocaleString('pt-BR')}*
🧪 *+ ${Number(result.potions)} POÇÕES MÉDIAS*
✅ *JÁ CREDITADO NA CONTA!*

⚔️ O Alpha garante recursos para você continuar lutando!
⏳ Limite: 2 concessões a cada 7 dias, intervalo de 72h.
🛡️ Poções assistenciais não podem ser vendidas ou transferidas.

_Não foi necessário solicitar o benefício._`
}

export function createBolsaFamiliaAlphaAutoRunner({
  claim,candidates,sendGroup,isConnected,now=Date.now,
  logError=()=>{},checkIntervalMs=60*1000
}={}){
  if(typeof claim!=='function'||typeof candidates!=='function'||
    typeof sendGroup!=='function'||typeof isConnected!=='function'){
    throw new TypeError('Dependências do auxílio automático são obrigatórias.')
  }
  const checked=new Map(),inFlight=new Set()
  let scanning=false
  async function check(jid,{chat,force=false}={}){
    if(!isConnected()||!/^\d{10,15}@s\.whatsapp\.net$/.test(String(jid||''))){
      return {ok:false,status:'offline-or-identity'}
    }
    // Nunca conceder na rotina automática sem um grupo válido de destino:
    // mensagem pública e crédito precisam se referir ao mesmo beneficiário.
    if(!String(chat||'').endsWith('@g.us'))return {ok:false,status:'no-group'}
    if(inFlight.has(jid))return {ok:false,status:'in-flight'}
    const at=now()
    if(!force&&at-Number(checked.get(jid)||0)<checkIntervalMs)return {ok:false,status:'throttled'}
    if(checked.size>1000)checked.clear()
    checked.set(jid,at)
    inFlight.add(jid)
    try{
      const result=await claim(jid)
      if(result?.ok){
        // Aviso SOMENTE após COMMIT; a ausência de resposta ou falha de envio
        // não autoriza creditar o kit novamente.
        try{await sendGroup(chat,bolsaFamiliaAlphaAutoReceipt(result,jid),[jid])}
        catch(error){logError('notify',error)}
      }
      return result
    }catch(error){
      logError('claim',error)
      return {ok:false,status:'error'}
    }finally{
      inFlight.delete(jid)
    }
  }
  async function scan(){
    if(scanning||!isConnected())return {status:'skipped'}
    scanning=true
    try{
      const entries=await candidates(20)
      let granted=0
      for(const entry of entries){
        if(!isConnected())break
        const result=await check(entry?.jid,{chat:entry?.chat,force:true})
        if(result?.ok)granted++
      }
      return {status:'ok',candidates:entries.length,granted}
    }catch(error){
      logError('scan',error)
      return {status:'error'}
    }finally{scanning=false}
  }
  return {check,scan}
}
