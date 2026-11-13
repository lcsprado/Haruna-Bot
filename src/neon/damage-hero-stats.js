// Estatisticas de dano isoladas do combate. Nao altera multiplicadores nem prêmios.
export const DAMAGE_SAMPLE_LIMIT=30;
export const DAMAGE_CLASS_KEY='__classe__';
export function damageHeroKey(heroId=null){
  const id=String(heroId||'').trim().toLowerCase();
  return /^pecado_[a-z0-9_]+$/.test(id)?id:DAMAGE_CLASS_KEY;
}
export function summarizeDamageSamples(samples=[]){
  const valid=(Array.isArray(samples)?samples:[]).filter(s=>Array.isArray(s)&&Number.isFinite(Number(s[0]))&&Number(s[0])>0);
  const count=valid.length;
  const total=valid.reduce((sum,x)=>sum+Number(x[0]),0);
  const critical=valid.filter(x=>x[1]===true);
  const critCount=critical.length;
  const critTotal=critical.reduce((sum,x)=>sum+Number(x[0]),0);
  const normalCount=count-critCount;
  const normalTotal=total-critTotal;
  return {count,total,critCount,critTotal,normalCount,normalTotal,
    average:count?Math.round(total/count):0,
    critAverage:critCount?Math.round(critTotal/critCount):0,
    normalAverage:normalCount?Math.round(normalTotal/normalCount):0,
    max:valid.reduce((highest,x)=>Math.max(highest,Number(x[0])),0)};
}
export function combineDamageStats(boss=null,raid=null){
  const count=Number(boss?.count||0)+Number(raid?.count||0);
  const total=Number(boss?.total||0)+Number(raid?.total||0);
  const critCount=Number(boss?.critCount||0)+Number(raid?.critCount||0);
  const critTotal=Number(boss?.critTotal||0)+Number(raid?.critTotal||0);
  const normalCount=count-critCount;
  return {count,
    average:count?Math.round(total/count):0,
    critAverage:critCount?Math.round(critTotal/critCount):0,
    normalAverage:normalCount?Math.round((total-critTotal)/normalCount):0,
    max:Math.max(Number(boss?.max||0),Number(raid?.max||0))};
}

/**
 * Resumo independente para o relatório !dano.
 * Usa contagens e somas dos golpes classificados, sem inferir crítico
 * a partir do valor do dano. As modalidades são ponderadas por golpes,
 * e a ausência de uma categoria não elimina a média da outra.
 */
export function damageReportBreakdown(boss=null,raid=null){
  const parts=[boss,raid].filter(Boolean);
  const finite=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
  const normalCount=parts.reduce((total,p)=>total+finite(p.normalCount),0);
  const critCount=parts.reduce((total,p)=>total+finite(p.critCount),0);
  const normalTotal=parts.reduce((total,p)=>total+finite(p.normalTotal ?? (finite(p.total)-finite(p.critTotal))),0);
  const critTotal=parts.reduce((total,p)=>total+finite(p.critTotal),0);
  const count=normalCount+critCount;
  return {
    normalCount,critCount,
    normalAverage:normalCount?Math.round(normalTotal/normalCount):null,
    critAverage:critCount?Math.round(critTotal/critCount):null,
    critPercent:count?Number((100*critCount/count).toFixed(1)):null
  };
}
