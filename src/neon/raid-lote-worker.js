// RAIDLOTE V1 — runner persistente, sem acionamento no import.
// Cada tick faz no maximo UMA etapa por pacote. Nao usa timers sem start explicito.
import {
  reserveNextRaidLoteAttempt,settleRaidLoteAttempt
} from './raid-lote-store.js'
import {raidLoteCombatAdapter} from './raid-lote-combat-adapter.js'
const JOB_BATCH_LIMIT=15

export function createRaidLoteWorker({
  db,startRaid,raidRound,onFinished=async()=>{},onError=()=>{},
  now=()=>Date.now()
}={}){
  for(const [name,fn] of Object.entries({startRaid,raidRound,onFinished,onError,now})){
    if(typeof fn!=='function')throw new Error('Falta dependencia '+name)
  }
  if(!db?.query)throw new Error('Banco obrigatorio')
  // Os locks de transacao do motor impedem duas rodadas simultaneas;
  // o claim de lease abaixo evita gasto duplo quando dois Render estiverem vivos.
  const adapter=raidLoteCombatAdapter({
    startRaid,raidRound,
    loadAttempt:async id=>(await db.query('SELECT * FROM raid_lote_attempts WHERE id=$1',[id])).rows[0]||null,
    readRaidState:async(chat,level)=>(await db.query(
      'SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2',
      [chat,'raid:'+level]
    )).rows[0]?.state||null,
    settleAttempt:id=>settleRaidLoteAttempt(db,id)
  })
  const tokenPrefix='raid-lote:'+Math.random().toString(36).slice(2)
  let running=false,tickCounter=0
  const claim=async(jobId)=>{
    const token=tokenPrefix+':'+(++tickCounter)
    const r=await db.query(`
      UPDATE raid_lote_jobs SET lease_token=$2,lease_until=NOW()+INTERVAL '25 seconds'
      WHERE id=$1 AND status IN ('queued','running')
        AND (lease_until IS NULL OR lease_until<NOW())
      RETURNING id,jid,status,requested,started,won_count,current_attempt_id
    `,[jobId,token])
    return r.rows[0]?{job:r.rows[0],token}:null
  }
  const release=async(jobId,token)=>{
    await db.query(`
      UPDATE raid_lote_jobs SET lease_until=NULL,lease_token=NULL
      WHERE id=$1 AND lease_token=$2
    `,[jobId,token])
  }
  const tickOnce=async()=>{
    if(running)return {status:'already_running'}
    running=true
    const summary={checked:0,started:0,progressed:0,finished:0,paused:0,errors:0}
    try{
      const {rows}=await db.query(`
        SELECT id FROM raid_lote_jobs WHERE status IN ('queued','running')
        AND (lease_until IS NULL OR lease_until<NOW())
        ORDER BY created_at ASC LIMIT $1
      `,[JOB_BATCH_LIMIT])
      for(const row of rows){
        const lease=await claim(row.id)
        if(!lease)continue
        summary.checked++
        try{
          // Lote cancelado ou encerrado nao faz nova tentativa.
          const next=await reserveNextRaidLoteAttempt(db,row.id)
          if(['inactive','cancelled','exhausted','player_busy'].includes(next.status)){
            summary.paused++
            continue
          }
          if(!['reserved','resume'].includes(next.status)||!next.attempt){
            summary.paused++
            continue
          }
          const a=next.attempt
          if(a.status==='reserved'||next.status==='reserved'){
            const started=await adapter.begin(a,lease.job.jid)
            if(!['started','resume'].includes(started.status))throw new Error('Inicio inesperado')
            summary.started++
          }
          // Apenas depois que o combate ja foi criado e persistido.
          const outcome=await adapter.tick(a)
          if(['won','lost','already_settled'].includes(outcome.status)){
            summary.finished++
            if(outcome.jobStatus&&['won','lost','cancelled'].includes(outcome.jobStatus)){
              await onFinished(lease.job.jid,row.id,outcome)
            }
          }else if(outcome.status==='running'||outcome.status==='cooldown'||outcome.status==='settle_pending'){
            summary.progressed++
          }else{
            summary.paused++
          }
        }catch(err){
          summary.errors++
          try{await onError(row.id,err)}catch{}
        }finally{
          await release(row.id,lease.token)
        }
      }
      return summary
    }finally{running=false}
  }
  // Shutdown seguro: nenhum tick em segundo plano se disabled.
  const start=({enabled=false,intervalMs=8000}={})=>{
    if(enabled!==true)throw new Error('Worker bloqueado: feature flag OFF')
    if(!Number.isFinite(intervalMs)||intervalMs<8000)throw new Error('Intervalo minimo de 8 segundos')
    const timer=setInterval(()=>{void tickOnce().catch(err=>onError('worker',err))},intervalMs)
    timer.unref?.()
    return {stop:()=>clearInterval(timer),tickOnce}
  }
  return Object.freeze({tickOnce,start,now})
}
