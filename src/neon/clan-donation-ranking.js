// Ranking de doações do cofre dos clãs: somente leitura, sem alterar a economia.
// A progressão do clã (XP) já registra o total histórico, mas as doações
// individuais só podem ser ranqueadas a partir da implantação do livro-razão.
const money=value=>Math.max(0,Number(value)||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const podium=position=>['🥇','🥈','🥉'][position]||String(position+1)+'.';
const safeName=value=>String(value||'Jogador').replace(/[\r\n\t*_`~]/g,' ').trim().slice(0,40)||'Jogador';

export function formatClanDonors(rows,{clanName=null}={}){
  const list=Array.isArray(rows)?rows:[];
  const specific=Boolean(clanName);
  const title=specific?'🏴 *RANKING DE DOADORES — '+safeName(clanName).toUpperCase()+'*':'🏆 *RANKING DE DOADORES — TODOS OS CLÃS*';
  const lines=list.map((r,i)=>{
    const n=Math.max(0,Number(r.donations)||0);
    return podium(i)+' *'+safeName(r.donor_name)+'* — R$ '+money(r.total)+' ('+n+' '+(n===1?'doação':'doações')+')';
  });
  return [title,'',...(lines.length?lines:['Nenhuma doação individual registrada ainda.']),
    '','📌 Ranking acumulado das doações registradas desde a ativação deste recurso.',
    '💡 As doações anteriores não tinham identificação de doador; por isso não entram no ranking individual.'].join('\n');
}

export function formatClanDonationTotals(rows){
  const list=Array.isArray(rows)?rows:[];
  const lines=list.map((r,i)=>podium(i)+' *'+safeName(r.name)+'* — R$ '+money(r.xp)+' doados • Nv.'+Math.max(1,Number(r.level)||1));
  return ['🏴 *RANKING DE DOAÇÕES — CLÃS*','',
    ...(lines.length?lines:['Nenhum clã encontrado.']),
    '','📌 Total histórico recebido por cada clã, calculado pelo XP gerado nas doações (não pelo saldo atual do cofre).'].join('\n');
}
