// Persistable state machine for STRATEGIC DUEL PROTOTYPE ONLY.
// Not imported into WhatsApp/Web; production combat/wallet/HP is unchanged.
// ID values are opaque transport identities; the caller MUST authenticate the acting player.
import {
  DECISION_ROUNDS, MAX_INTERVENTIONS, makeDuelRound,
  duelRoundPublic, submitDuelChoice, resolveDuelRound
} from './pvp-strategy-prototype.js';

const asTime=nowMs=>{
  if(!Number.isSafeInteger(nowMs)||nowMs<0)throw new Error('invalid timestamp');
  return nowMs;
};
const asDuration=(n,max)=>Number.isSafeInteger(n)&&n>=1000&&n<=max;
const belongs=(s,id)=>s.players.includes(id);
const freezeState=s=>s; // serializable clone returned; caller must transact on revision.

export function inviteStrategicDuel({
  id,challenger,opponent,nowMs,inviteTimeoutMs=60000
}={}){
  asTime(nowMs);
  if(!id||!challenger||!opponent||challenger===opponent)throw new Error('distinct participants and session id are required');
  if(!asDuration(inviteTimeoutMs,120000))throw new Error('invalid invite timeout');
  return freezeState({
    id,players:[challenger,opponent],phase:'invited',
    inviteExpiresAt:nowMs+inviteTimeoutMs,round:0,lastDecisionRound:0,
    revision:0,interventions:{[challenger]:0,[opponent]:0},currentDecision:null,
    revealed:[],result:null
  });
}

export function acceptStrategicDuel(state,{playerId,nowMs}={}){
  asTime(nowMs);
  if(state?.phase!=='invited')throw new Error('no pending invitation');
  if(nowMs>state.inviteExpiresAt)throw new Error('invitation expired');
  if(playerId!==state.players[1])throw new Error('only invited opponent may accept');
  return freezeState({...state,phase:'ready',revision:state.revision+1});
}

export function declineStrategicDuel(state,{playerId,nowMs}={}){
  asTime(nowMs);
  if(state?.phase!=='invited')throw new Error('no pending invitation');
  if(!belongs(state,playerId))throw new Error('not a participant');
  return freezeState({...state,phase:'cancelled',revision:state.revision+1,result:'declined'});
}

export function beginDuelDecision(state,{round,nowMs,timeoutMs=30000}={}){
  asTime(nowMs);
  if(state?.phase!=='ready'&&state?.phase!=='combat')throw new Error('duel not ready');
  if(!DECISION_ROUNDS.includes(round)||round<=state.lastDecisionRound)throw new Error('invalid or replayed decision round');
  if(state.revealed.length>=MAX_INTERVENTIONS)throw new Error('intervention limit reached');
  const decision=makeDuelRound({players:state.players,round,nowMs,timeoutMs});
  return freezeState({...state,phase:'decision',round,revision:state.revision+1,currentDecision:decision});
}

export function chooseDuelAction(state,{playerId,choice,nowMs}={}){
  asTime(nowMs);
  if(state?.phase!=='decision')throw new Error('no active decision');
  if(!belongs(state,playerId))throw new Error('not a participant');
  const current=state.currentDecision.hiddenChoices[playerId];
  // Retried WhatsApp deliveries are idempotent only when the action matches.
  if(current===choice)return state;
  if(current!==undefined)throw new Error('conflicting locked choice');
  if(state.interventions[playerId]>=MAX_INTERVENTIONS)throw new Error('intervention limit reached');
  const decision=submitDuelChoice(state.currentDecision,{playerId,choice,nowMs});
  return freezeState({...state,revision:state.revision+1,currentDecision:decision,
    interventions:{...state.interventions,[playerId]:state.interventions[playerId]+1}});
}

export function completeDuelDecision(state,{nowMs}={}){
  asTime(nowMs);
  if(state?.phase!=='decision')throw new Error('no active decision');
  const revealed=resolveDuelRound(state.currentDecision,nowMs);
  return freezeState({...state,phase:'combat',revision:state.revision+1,currentDecision:null,
    lastDecisionRound:revealed.round,revealed:[...state.revealed,revealed]});
}

export function finishStrategicDuel(state,{winnerId,nowMs}={}){
  asTime(nowMs);
  if(!state||!['ready','combat'].includes(state.phase))throw new Error('duel cannot finish now');
  if(winnerId!==null&&!belongs(state,winnerId))throw new Error('winner must be participant or draw');
  return freezeState({...state,phase:'finished',revision:state.revision+1,result:{winnerId,finishedAt:nowMs}});
}

export function publicStrategicDuel(state){
  if(!state)throw new Error('duel missing');
  return {
    id:state.id,phase:state.phase,round:state.round,revision:state.revision,
    invitationExpiresAt:state.phase==='invited'?state.inviteExpiresAt:null,
    decision:state.phase==='decision'?duelRoundPublic(state.currentDecision):null,
    // Only resolved decisions may be disclosed. Never return currentDecision.hiddenChoices.
    revealed:[...state.revealed],result:state.result
  };
}
