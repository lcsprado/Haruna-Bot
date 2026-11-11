import {startRaid,raidRound} from './games.js'
import {getRaidLoteAttemptReports,reserveNextRaidLoteAttempt,settleRaidLoteAttempt} from './raid-lote-store.js'

// Mesma rodada de 8 segundos do motor real. Um worker global por processo.
// A transacao de raidRound impede rodada ou pagamento duplicado entre instancias.
export const RAID_LOTE_WORKER_INTERVAL_MS=4000
let interval=null
let running=false
const fmt=n=>Number(n||0).toLocaleString('pt-BR')
function summarize(reports){
  const rewards=reports.flatMap(a=>Array.isArray(a.reward_summary?.rewards)?a.reward_summary.rewards:[])
  return {
    cash:rewards.reduce((n,r)=>n+Number(r.cash||0),0),
    exp:rewards.reduce((n,r)=>n+Number(r.exp||0),0),
    masteryXp:rewards.reduce((n,r)=>n+Number(r.masteryXp||0),0),
    petXp:rewards.reduce((n,r)=>n+Number(r.petXp||0),0),
    fragments:rewards.reduce((n,r)=>n+Number(r.material?.qty||0),0),
    drops:rewards.flatMap(r=>[r.box?.name,r.gear?.name].filter(Boolean))
  }
}
export async function raidLoteTick(db,{logger=console,notify}={}){
  const jobs=(await db.query(`
    SELECT id,jid,level,requested,started,won_count,status
    FROM raid_lote_jobs WHERE status IN ('queued','running')
    ORDER BY updated_at ASC LIMIT 30
  `)).rows
  const results=[]
  for(const job of jobs){
    try{
      const next=await reserveNextRaidLoteAttempt(db,job.id)
      if(!['reserved','resume'].includes(next.status))continue
      const attempt=next.attempt
      // Inclui a transicao reservada -> ativa, sem nova chave/taxa:
      // o pacote foi quitado na compra e as chaves ja foram consumidas.
      const started=await startRaid(attempt.raid_chat,next.job.jid,attempt.level,
        {loteAttemptId:attempt.id})
      let outcome=null
      if(started.status==='active'){
        outcome=await raidRound(attempt.raid_chat,attempt.level)
      }
      if(started.status==='completed'||started.status==='failed'||
         outcome?.victory||outcome?.failed){
        const settled=await settleRaidLoteAttempt(db,attempt.id)
        if(['won','lost'].includes(settled.status)){
          results.push({jobId:job.id,seq:attempt.seq,result:settled.status,jobStatus:settled.jobStatus})
          if(['won','lost','cancelled'].includes(settled.jobStatus)){
            const reports=await getRaidLoteAttemptReports(db,next.job.jid,job.id)
            const totals=summarize(reports)
            const title=settled.jobStatus==='won'?'🏆 PACOTE RAID CONCLUÍDO':
              settled.jobStatus==='lost'?'💀 PACOTE RAID ENCERRADO POR DERROTA':
              '🛑 PACOTE RAID CANCELADO'
            const text=title+
              '\n⚔️ Raid Lv.'+attempt.level+
              '\n✅ Vitórias: '+settled.wins+'/'+next.job.requested+
              '\n🔑 Tentativas iniciadas: '+settled.started+'/'+next.job.requested+
              '\n💸 Pacote pago: R$ '+fmt(settled.paid)+
              '\n💰 Ganhos: R$ '+fmt(totals.cash)+
              '\n✨ XP: +'+fmt(totals.exp)+
              '\n🌈 Maestria: +'+fmt(totals.masteryXp)+
              '\n🐾 XP pet: +'+fmt(totals.petXp)+
              '\n🧩 Materiais: '+fmt(totals.fragments)+
              (totals.drops.length?'\n🎁 Drops: '+totals.drops.join(', '):'')+
              '\n🔒 Sem reembolso de tentativas não utilizadas.'
            if(typeof notify==='function'){
              try{await notify(next.job.jid,text)}catch(error){
                logger.error('[RAIDLOTE] aviso privado falhou',String(error?.message||error))
              }
            }
          }
        }
      }
    }catch(error){
      // NUNCA converter erro de servidor em derrota. Mantem a tentativa
      // reservada/ativa para retomar exatamente a mesma batalha.
      logger.error('[RAIDLOTE] tentativa pausada para recuperacao',String(error?.message||error),job.id)
      results.push({jobId:job.id,error:true})
    }
  }
  return results
}
export function startRaidLoteScheduler(db,{notify,logger=console}={}){
  if(process.env.RAID_LOTE_V1_ENABLED!=='1')return false
  if(interval)return true
  interval=setInterval(()=>{
    if(running)return
    running=true
    void raidLoteTick(db,{notify,logger}).catch(err=>
      logger.error('[RAIDLOTE] falha do worker',err?.message||err)
    ).finally(()=>{running=false})
  },RAID_LOTE_WORKER_INTERVAL_MS)
  interval.unref?.()
  // Recupera jobs interrompidos sem aguardar novo comando do jogador.
  if(!running){
    running=true
    void raidLoteTick(db,{notify,logger}).catch(err=>
      logger.error('[RAIDLOTE] falha na recuperacao',err?.message||err)
    ).finally(()=>{running=false})
  }
  return true
}
export function stopRaidLoteScheduler(){
  if(interval)clearInterval(interval)
  interval=null
}
