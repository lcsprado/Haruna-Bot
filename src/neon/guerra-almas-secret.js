// Cada participante tem uma permutação própria por rodada.
// Os números podem aparecer no grupo, mas nunca expõem a ação real.
import {randomInt} from 'node:crypto'
import {GUERRA_ACTIONS,GUERRA_ROUNDS,GUERRA_JOIN_MS,GUERRA_ROUND_MS,guerraRoundAt} from './guerra-almas-rules.js'

export const GUERRA_SECRET_MIN_RESTART_MS=90_000
export function guerraShuffleActions(random=randomInt){
 const choices=Object.keys(GUERRA_ACTIONS)
 for(let i=choices.length-1;i>0;i--){
  const j=random(i+1)
  if(!Number.isInteger(j)||j<0||j>i)throw Error('Sorteio inválido')
  ;[choices[i],choices[j]]=[choices[j],choices[i]]
 }
 return choices
}
export function guerraEnsureChoices(player,round,random=randomInt){
 if(!player||!Number.isInteger(round)||round<1||round>GUERRA_ROUNDS)throw Error('Rodada inválida')
 player.secretOptions??={}
 if(!player.secretOptions[String(round)])player.secretOptions[String(round)]=guerraShuffleActions(random)
 return player.secretOptions[String(round)]
}
export function guerraSecretChoice(player,round,number){
 if(!/^[123]$/.test(String(number)))return null
 const options=player?.secretOptions?.[String(round)]
 return Array.isArray(options)?options[Number(number)-1]||null:null
}
export function guerraPrivateMenu(player,round){
 const options=guerraEnsureChoices(player,round)
 return '🔒 *GUERRA DAS ALMAS — ESCOLHA SECRETA*\n'+
  '🎭 Rodada *'+round+'/'+GUERRA_ROUNDS+'*\n'+
  options.map((action,i)=>(i+1)+'️⃣ '+GUERRA_ACTIONS[action]).join('\n')+
  '\n\nEnvie *!guerra 1*, *!guerra 2* ou *!guerra 3* no grupo ou neste privado.\n'+
  '⚠️ Os números são embaralhados de forma diferente para cada jogador e em cada rodada. Não compartilhe este menu.'
}
export function guerraActivateSecrets(state,now){
 if(state.secretFromRound!==undefined||state.final)return null
 const current=guerraRoundAt(state.start,now)
 const round=Math.max(1,Math.min(GUERRA_ROUNDS,current))
 const elapsed=now-(Number(state.joinEnd)+Math.max(0,round-1)*GUERRA_ROUND_MS)
 const timeLeft=GUERRA_ROUND_MS-elapsed
 const played=Object.values(state.players||{}).filter(p=>p.plays?.[String(round)])
 const canRestart=current>=1&&timeLeft>=GUERRA_SECRET_MIN_RESTART_MS
 if(canRestart){
  // Não reaproveitar escolhas feitas publicamente durante a rodada corrente.
  for(const p of played)delete p.plays[String(round)]
  state.secretFromRound=round
 }else{
  // Rodada quase fechada: preserva pontuação histórica; próxima já é secreta.
  state.secretFromRound=Math.min(GUERRA_ROUNDS+1,round+1)
 }
 return {secretFromRound:state.secretFromRound,resetRound:canRestart&&played.length?round:null,
  clearedMoves:canRestart?played.length:0}
}
