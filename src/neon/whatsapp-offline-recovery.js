// Recupera o handshake offline do Baileys 6.7.24 sem apagar credenciais.
// Apenas solicita mais lotes pendentes ou libera o buffer local retido.
// Nunca envia mensagens a jogadores, altera o banco ou fabrica eventos do servidor.
export function createWhatsAppOfflineRecovery({
  socket,isOpen,onAction=()=>{},schedule=setTimeout,cancel=clearTimeout,
  batchDelayMs=6000,flushDelayMs=30000,maxBatchRequests=24
}){
  let started=false,previewed=false,completed=false,stopped=false
  let batchTimer=null,flushTimer=null,batches=0,receivedMessages=false
  const clearBatch=()=>{if(batchTimer!==null){cancel(batchTimer);batchTimer=null}}
  const clearFlush=()=>{if(flushTimer!==null){cancel(flushTimer);flushTimer=null}}
  const scheduleBatch=()=>{
    // Um upsert pode conter mensagens antigas antes do fim do backlog. Continuar
    // drenando ate o terminador offline ou ate o teto seguro de solicitacoes.
    if(!started||!previewed||completed||stopped||batchTimer!==null||batches>=maxBatchRequests)return
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
      if(batches===maxBatchRequests && !completed)onAction('cap',batches)
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
    onPreview(){
      if(stopped||completed)return
      previewed=true
      scheduleBatch()
    },
    onComplete(){
      completed=true
      clearBatch()
      clearFlush()
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
    snapshot(){return {started,previewed,completed,batches,receivedMessages}}
  }
}
