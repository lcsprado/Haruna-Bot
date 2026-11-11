// RAIDLOTE V1 — adaptador para motor REAL de Raids, desligado ate homologacao.
import {raidLoteRoomId} from './raid-lote-store.js'

export function raidLoteCombatAdapter({startRaid,raidRound,readRaidState,loadAttempt,settleAttempt}={}){
  for(const [name,fn] of Object.entries({startRaid,raidRound,readRaidState,loadAttempt,settleAttempt})){
    if(typeof fn!=='function')throw new Error('Dependencia obrigatoria: '+name)
  }
  return Object.freeze({
    async begin(attempt,jid){
      if(!attempt?.id||!attempt?.raid_chat||!attempt?.level)throw new Error('Tentativa nao reservada')
      if(raidLoteRoomId(attempt.id)!==attempt.raid_chat)throw new Error('Sala de tentativa invalida')
      const existing=await loadAttempt(attempt.id)
      if(!existing||existing.job_id!==attempt.job_id)
        throw new Error('Tentativa nao registrada no banco')
      if(existing.raid_started_at_ms!==null&&existing.raid_started_at_ms!==undefined)
        return {status:'resume',startedAt:Number(existing.raid_started_at_ms)}
      // startRaid cria a sala isolada, pula SOMENTE a chave do pacote e grava
      // startedAt na tabela de tentativas dentro da mesma transacao da batalha.
      // Repetir begin nao consome nada: startRaid valida o ID e recupera a sala.
      const raid=await startRaid(attempt.raid_chat,jid,attempt.level,{loteAttemptId:attempt.id})
      if(!raid||!Number.isSafeInteger(Number(raid.startedAt))||Number(raid.startedAt)<=0)
        throw new Error('Batalha nao foi persistida; requer reconciliacao')
      return {status:raid.status==='active'?'started':'resume',startedAt:Number(raid.startedAt)}
    },
    async tick(attempt){
      if(!attempt?.raid_chat||!attempt?.level||!attempt?.id)throw new Error('Tentativa invalida')
      // Consultar estado BRUTO: getRaidStatus publico filtra Raids finalizadas.
      const current=await readRaidState(attempt.raid_chat,attempt.level)
      if(!current)return {status:'needs_reconciliation'}
      if(current.mode!=='lote'||String(current.loteAttemptId)!==String(attempt.id))
        throw new Error('Batalha nao corresponde a tentativa paga')
      if(['completed','failed'].includes(current.status))return settleAttempt(attempt.id)
      if(current.status!=='active')return {status:'needs_reconciliation'}
      const round=await raidRound(attempt.raid_chat,attempt.level)
      if(round?.reason==='cooldown')return {status:'cooldown',remainingMs:Number(round.remainingMs||1000)}
      if(round?.victory||round?.failed)return {status:'settle_pending'}
      if(round?.reason==='inactive')return {status:'settle_pending'}
      return {status:'running',round:round?.round,hp:round?.hp}
    }
  })
}
