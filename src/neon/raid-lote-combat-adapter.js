// RAIDLOTE V1 — ponte do motor de combate real, somente por injeção explícita.
// Não importa games.js para evitar ativação incidental do motor público.
import {raidLoteReward,raidLoteGearChance,RAID_LOTE_V1} from './raid-lote-policy.js'
import {raidLoteRoomId} from './raid-lote-store.js'

export function raidLoteCombatAdapter({createRaid,joinRaid,startRaid,raidRound,getRaidStatus,loadAttempt,attachAttempt,settleAttempt}={}){
  for(const [name,fn] of Object.entries({createRaid,joinRaid,startRaid,raidRound,getRaidStatus,loadAttempt,attachAttempt,settleAttempt})){
    if(typeof fn!=='function')throw new Error('Dependencia obrigatoria do motor: '+name)
  }
  return Object.freeze({
    // Uma tentativa reservada deve ter seu ID persistido ANTES de qualquer efeito no motor.
    async begin(attempt,jid,name){
      if(!attempt?.id||!attempt?.raid_chat||!attempt?.level)throw new Error('Tentativa nao reservada')
      if(raidLoteRoomId(attempt.id)!==attempt.raid_chat)throw new Error('Sala de tentativa invalida')
      const existing=await loadAttempt(attempt.id)
      if(existing?.raid_started_at_ms)return {status:'resume',startedAt:Number(existing.raid_started_at_ms)}
      // O motor precisa suportar isencao de chave SOMENTE para sala vinculada ao pacote pago.
      // Sem essa garantia, o fluxo para antes de criar sala ou cobrar duas vezes.
      if(!createRaid.supportsRaidLotePrepaid||!joinRaid.supportsRaidLotePrepaid||!startRaid.supportsRaidLotePrepaid)
        throw new Error('Motor ainda nao habilitado para chaves prepagas; tentativa preservada')
      await createRaid(attempt.raid_chat,jid,name,attempt.level,{raidLoteAttemptId:attempt.id})
      await joinRaid(attempt.raid_chat,jid,name,attempt.level,{raidLoteAttemptId:attempt.id})
      const raid=await startRaid(attempt.raid_chat,jid,attempt.level,{raidLoteAttemptId:attempt.id})
      if(!raid||!Number.isSafeInteger(Number(raid.startedAt)))throw new Error('Raid nao iniciou; reconciliar')
      await attachAttempt(attempt.id,Number(raid.startedAt))
      return {status:'started',startedAt:Number(raid.startedAt)}
    },
    async tick(attempt){
      if(!attempt?.raid_chat||!attempt?.level||!attempt?.id)throw new Error('Tentativa invalida')
      const current=await getRaidStatus(attempt.raid_chat,attempt.level)
      if(!current||current.status==='lobby')return {status:'needs_reconciliation'}
      if(current.status==='active'){
        const round=await raidRound(attempt.raid_chat,attempt.level)
        if(round?.reason==='cooldown')return {status:'cooldown',remainingMs:round.remainingMs}
        if(round?.failed||round?.finished){
          // A confirmação do banco é a única fonte para liquidação e próxima tentativa.
          return {status:'settle_pending'}
        }
        return {status:'running',round:round?.round,hp:round?.hp}
      }
      if(current.status==='completed'||current.status==='failed'){
        return settleAttempt(attempt.id)
      }
      return {status:'needs_reconciliation'}
    },
    rewards: Object.freeze({
      cash:base=>raidLoteReward(base,'cash'),
      playerXp:base=>raidLoteReward(base,'playerXp'),
      heroXp:base=>raidLoteReward(base,'heroXp'),
      petXp:base=>raidLoteReward(base,'petXp'),
      masteryXp:base=>raidLoteReward(base,'masteryXp'),
      fragment:base=>raidLoteReward(base,'fragment'),
      gearChance:raidLoteGearChance
    }),
    prepaid:true,
    refundOnLoss:RAID_LOTE_V1.refundUnusedAttempts
  })
}
