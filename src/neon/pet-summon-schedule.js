// Incrementa um contador de invocações confirmado dentro da mesma transação
// que consome materiais. Nenhum aviso externo é emitido e o pet continua
// seguindo o fluxo normal de coleção, reembolso e relatório da invocação.
export function nextScheduledSummon(value,pets){
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const species=String(value.species||'');
  const at=Number(value.at);
  const completed=Number(value.completed??0);
  if(!pets.some(p=>p.species===species))return null;
  if(!Number.isSafeInteger(at)||at<1||at>30)return null;
  if(!Number.isSafeInteger(completed)||completed<0||completed>=at)return null;
  const next=completed+1;
  return {completed:next,forcedSpecies:next===at?species:null,clear:next===at};
}
