// Gatilho independente de sessão: uma concessão por jogador, mesmo em grupo diferente.
export function bolsaFamiliaAlphaAutoReceipt(result){
  return `🏛️ *BOLSA FAMÍLIA ALPHA — AUXÍLIO AUTOMÁTICO!*

✅ Seu saldo ficou dentro do limite e você recebeu:
💰 *R$ ${Number(result.cash).toLocaleString('pt-BR')}* na carteira
🧪 *${result.potions} Poções Médias* de auxílio

🔒 As poções são para cura; não podem ser vendidas ou trocadas.
⏳ Novo auxílio apenas após 72 horas, no máximo 2 vezes em 7 dias.
❤️ Use *!curar* para recuperar HP.
_Não é necessário solicitar: o Alpha identifica automaticamente quando você precisa._`
}

export function createBolsaFamiliaAlphaAutoRunner({
  claim,candidates,sendDirect,isConnected,now=Date.now,
  logError=()=>{},checkIntervalMs=60*1000
}={}){
  if(typeof claim!=='function'||typeof candidates!=='function'||
    typeof sendDirect!=='function'||typeof isConnected!=='function'){
    throw new TypeError('Dependências do auxílio automático são obrigatórias.')
  }
  const checked=new Map(),inFlight=new Set()
  let scanning=false
  async function check(jid,{force=false}={}){
    if(!isConnected()||!/^\d{10,15}@s\.whatsapp\.net$/.test(String(jid||'')))return {ok:false,status:'offline-or-identity'}
    if(inFlight.has(jid))return {ok:false,status:'in-flight'}
    const at=now()
    if(!force&&at-Number(checked.get(jid)||0)<checkIntervalMs)return {ok:false,status:'throttled'}
    if(checked.size>1000)checked.clear()
    checked.set(jid,at)
    inFlight.add(jid)
    try{
      const result=await claim(jid)
      if(result?.ok){
        // Crédito já persistido; nenhuma mensagem em grupo e nenhuma publicação
        // para inelegíveis. Falha no envio não repete o pagamento.
        try{await sendDirect(jid,bolsaFamiliaAlphaAutoReceipt(result))}
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
      const jids=await candidates(20)
      let granted=0
      for(const jid of jids){
        if(!isConnected())break
        const result=await check(jid,{force:true})
        if(result?.ok)granted++
      }
      return {status:'ok',candidates:jids.length,granted}
    }catch(error){
      logError('scan',error)
      return {status:'error'}
    }finally{scanning=false}
  }
  return {check,scan}
}
