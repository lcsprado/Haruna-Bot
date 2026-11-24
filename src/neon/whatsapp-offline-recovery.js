// Recupera o handshake offline do Baileys 6.7.24 sem apagar credenciais.
// Apenas solicita mais lotes pendentes ou libera o buffer local retido.
// Nunca envia mensagens a jogadores, altera o banco ou fabrica eventos do servidor.
export function createWhatsAppOfflineRecovery({
  socket,isOpen,onAction=()=>{},schedule=setTimeout,cancel=clearTimeout,
  batchDelayMs=5000,flushDelayMs=30000,maxBatchRequests=200,maxBatchRequestsLimit=600
}){
  let started=false,previewed=false,completed=false,stopped=false
  let batchTimer=null,flushTimer=null,batches=0,receivedMessages=false
  let batchLimit=maxBatchRequests
  const clearBatch=()=>{if(batchTimer!==null){cancel(batchTimer);batchTimer=null}}
  const clearFlush=()=>{if(flushTimer!==null){cancel(flushTimer);flushTimer=null}}
  const scheduleBatch=()=>{
    // Um upsert pode conter mensagens antigas antes do fim do backlog. Continuar
    // drenando ate o terminador offline ou ate o teto seguro de solicitacoes.
    if(!started||!previewed||completed||stopped||batchTimer!==null||batches>=batchLimit)return
    batchTimer=schedule(async()=>{
      batchTimer=null
      if(!started||completed||stopped||!isOpen())return
      batches+=1
      try{
        await socket.sendNode({
          tag:'ib',attrs:{},content:[{tag:'offline_batch',attrs:{count:'100'}}]
        })
        onAction('batch',batches)
      }catch{
        onAction('batch_error',batches)
      }
      if(batches>=batchLimit && !completed){
        // A fila do servidor pode ter milhares de mensagens. Se ainda nao veio
        // <ib><offline>, reiniciar sem apagar a sessao deixa o servidor retomar
        // o restante em outra conexao, em vez de ficar surdo indefinidamente.
        try{socket.ev?.flush?.()}catch{}
        onAction('cap',batches)
      }
      scheduleBatch()
    },batchDelayMs)
    batchTimer?.unref?.()
  }
  return {
    onOpen(){
      if(stopped||started)return
      started=true
      flushTimer=schedule(()=>{
        flushTimer=null
        if(stopped||!isOpen() || (receivedMessages && (!previewed||completed)))return
        if(socket.ev?.isBuffering?.()!==true)return
        try{
          if(socket.ev.flush()===true)onAction('flush',1)
        }catch{
          onAction('flush_error',1)
        }
      },flushDelayMs)
      flushTimer?.unref?.()
      scheduleBatch()
    },
    onPreview(pendingCount=null){
      if(stopped||completed)return
      const count=Number(pendingCount)
      if(pendingCount!==null&&Number.isFinite(count)&&count>0){
        batchLimit=Math.max(batchLimit,Math.min(maxBatchRequestsLimit,Math.ceil(count/50)+20))
      }
      previewed=true
      scheduleBatch()
    },
    onComplete(){
      completed=true
      clearBatch()
      clearFlush()
      // Mesmo apos o terminador do servidor, o emitter Baileys pode continuar
      // em modo buffering; sem flush, o socket fica 'open' e nenhum upsert sai.
      if(socket.ev?.isBuffering?.()===true){
        try{
          if(socket.ev.flush()===true)onAction('flush-complete',1)
        }catch{onAction('flush_complete_error',1)}
      }
    },
    onMessage(){
      receivedMessages=true
      if(!previewed||completed){clearFlush();clearBatch()}
    },
    stop(){
      stopped=true
      clearBatch()
      clearFlush()
    },
    snapshot(){return {started,previewed,completed,batches,batchLimit,receivedMessages}}
  }
}
