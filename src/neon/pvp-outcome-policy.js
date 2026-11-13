// Limite de 20 rodadas: compara vida proporcional, nao HP bruto.
// O candidato com mais HP maximo nao deve ganhar automaticamente ao esgotar o tempo.
export function pvpWinnerByHealth(a,b,roll=Math.random()){
  const ah=Math.max(0,Math.trunc(Number(a?.hp)||0)),bh=Math.max(0,Math.trunc(Number(b?.hp)||0));
  if(ah>0&&bh<=0)return a;
  if(bh>0&&ah<=0)return b;
  const am=Math.max(1,Math.trunc(Number(a?.maxHp)||1)),bm=Math.max(1,Math.trunc(Number(b?.maxHp)||1));
  const left=ah*bm,right=bh*am;
  if(left===right)return Number(roll)<.5?a:b;
  return left>right?a:b;
}
