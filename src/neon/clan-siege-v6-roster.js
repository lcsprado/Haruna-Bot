// Cerco V6: dois turnos de acao por cla/rodada, mesmo com 2-6 membros.
// O agendamento e deterministico a partir do elenco imutavel gravado no inicio.
// Partidas V1-V5 nao utilizam este modulo.
export const SIEGE_V6_MIN_PLAYERS=2;
export const SIEGE_V6_MAX_PLAYERS=6;
export const SIEGE_V6_SLOTS_PER_ROUND=2;
export const SIEGE_V6_TOTAL_ROUNDS=6;

export function siegeV6ActivePlayers(jids,round){
  if(!Array.isArray(jids))throw new Error('Cerco V6: elenco invalido.');
  const roster=jids.map(jid=>String(jid||'')).sort();
  if(roster.some(id=>!id)||new Set(roster).size!==roster.length||
    roster.length<SIEGE_V6_MIN_PLAYERS||roster.length>SIEGE_V6_MAX_PLAYERS)
    throw new Error('Cerco V6: elenco requer 2 a 6 jogadores distintos.');
  const r=Number(round);
  if(!Number.isInteger(r)||r<1||r>SIEGE_V6_TOTAL_ROUNDS)
    throw new Error('Cerco V6: rodada invalida.');
  const offset=((r-1)*SIEGE_V6_SLOTS_PER_ROUND)%roster.length;
  return Object.freeze(Array.from({length:SIEGE_V6_SLOTS_PER_ROUND},
    (_,index)=>roster[(offset+index)%roster.length]));
}

export function siegeV6NextTurns(jids,currentRound,jid){
  const turns=[];
  for(let round=Math.max(1,Number(currentRound)||1);round<=SIEGE_V6_TOTAL_ROUNDS;round++){
    if(siegeV6ActivePlayers(jids,round).includes(String(jid)))turns.push(round);
  }
  return turns;
}

export function siegeV6RosterValid(rows,blueClanId,redClanId){
  const blue=String(blueClanId),red=String(redClanId);
  if(blue===red||!Array.isArray(rows))return false;
  const jids=new Set(),counts={[blue]:0,[red]:0};
  for(const row of rows){
    const clan=String(row?.clan_id),jid=String(row?.jid||'');
    if(!jid||jids.has(jid)||!(clan in counts))return false;
    jids.add(jid);
    counts[clan]++;
  }
  return Object.values(counts).every(n=>n>=SIEGE_V6_MIN_PLAYERS&&n<=SIEGE_V6_MAX_PLAYERS);
}
