// Conciliacao de HP da Raid com mudancas externas feitas no mesmo cadastro.
// A sala guarda o HP de uma rodada anterior: poções, PvP e Boss podem atualizar
// stats.hp antes da proxima rodada. Nunca sobrescrever esse delta silenciosamente.
const clamp=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||0));
export function rebaseRaidHeroHp({trackedStoredHp,liveStoredHp,projectedStoredHp,storedMaxHp,combatMaxHp}={}){
  const storageMax=Math.max(1,Math.trunc(Number(storedMaxHp)||1));
  const combatMax=Math.max(1,Math.trunc(Number(combatMaxHp)||1));
  const live=clamp(Math.trunc(Number(liveStoredHp)||0),0,storageMax);
  // Salas legadas podem nao ter o snapshot rastreado; preservar o resultado
  // projetado sem tentar adivinhar um delta externo anterior.
  const tracked=Number.isFinite(Number(trackedStoredHp))&&trackedStoredHp!=null
    ?clamp(Math.trunc(Number(trackedStoredHp)),0,storageMax):live;
  const projected=clamp(Math.trunc(Number(projectedStoredHp)||0),0,storageMax);
  const externalDelta=live-tracked;
  const storedHp=clamp(projected+externalDelta,0,storageMax);
  return {
    storedHp:Math.trunc(storedHp),
    combatHp:Math.round(storedHp/storageMax*combatMax),
    externalDelta
  };
}
