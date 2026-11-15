// Callback puro de progresso de !duelo: não liquida recompensas.
// Executa ataques até a próxima janela ou o fim. Nunca espera pelo WhatsApp.
import {beginDuelDecision,finishStrategicDuel} from './pvp-duel-session-prototype.js';
import {runDuelToNextDecision} from './pvp-duel-round-engine.js';

export function advanceStoredDuelCombat(state,{nowMs}={}){
  if(!Number.isSafeInteger(nowMs)||nowMs<0)throw new Error('invalid transition time');
  if(!state||!['ready','combat'].includes(state.phase))throw new Error('duel cannot advance');
  if(!state.combat||state.combat.version!==1)throw new Error('missing authenticated combat snapshot');
  const combatIds=state.combat.fighters.map(f=>f.jid);
  if(combatIds.length!==2||state.players.some((id,i)=>id!==combatIds[i]))
    throw new Error('duel combat identity mismatch');
  const {combat,awaitingRound,finished}=runDuelToNextDecision(state.combat,{
    revealed:state.revealed
  });
  const next={...state,combat};
  if(finished){
    if(!combat.outcome)throw new Error('missing deterministic outcome');
    return finishStrategicDuel(next,{winnerId:combat.outcome.winnerId,nowMs});
  }
  if(![3,7,11].includes(awaitingRound))throw new Error('invalid gate');
  return beginDuelDecision(next,{round:awaitingRound,nowMs,timeoutMs:30000});
}
