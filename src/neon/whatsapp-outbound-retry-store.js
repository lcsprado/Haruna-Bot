// Armazena as mensagens originais enviadas para que o Baileys possa reenviá-las
// com chaves Signal renovadas quando um destinatário pede uma nova tentativa.
// Não devolver mensagens vazias: isso consumiria a tentativa sem recuperar o texto.
export function createOutboundRetryStore({maxMessages=2000,ttlMs=2*60*60*1000,now=Date.now}={}){
  if(!Number.isInteger(maxMessages)||maxMessages<1)throw new RangeError('maxMessages')
  if(!Number.isFinite(ttlMs)||ttlMs<1)throw new RangeError('ttlMs')
  const saved=new Map()
  const purge=()=>{
    const cutoff=now()-ttlMs
    for(const [id,entry] of saved){
      if(entry.createdAt>cutoff)break
      saved.delete(id)
    }
  }
  return {
    remember(sent){
      const id=String(sent?.key?.id||'')
      if(!id||!sent?.message)return false
      purge()
      saved.delete(id)
      saved.set(id,{message:sent.message,createdAt:now()})
      while(saved.size>maxMessages)saved.delete(saved.keys().next().value)
      return true
    },
    getMessage(key){
      const id=String(key?.id||'')
      if(!id)return undefined
      purge()
      return saved.get(id)?.message
    },
    size(){purge();return saved.size}
  }
}
