// Evita três INSERT/UPSERT redundantes por chamada frequente a ensureUser.
// Só memoriza uma confirmação APÓS todas as consultas concluírem com sucesso.
export function createRecentEnsureCache({ttlMs=30000,maxEntries=4000,now=Date.now}={}){
  const entries=new Map()
  return {
    isFresh(jid,pushName=''){
      const value=entries.get(jid)
      return Boolean(value && now()-value.at<ttlMs &&
        (!pushName || pushName===value.name))
    },
    remember(jid,pushName=''){
      const previous=entries.get(jid)
      const name=pushName || previous?.name || ''
      entries.delete(jid)
      while(entries.size>=maxEntries) entries.delete(entries.keys().next().value)
      entries.set(jid,{name,at:now()})
    },
    invalidate(jid){entries.delete(jid)}
  }
}
