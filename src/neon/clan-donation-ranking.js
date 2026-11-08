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

const donorLines=rows=>(Array.isArray(rows)?rows:[]).map((r,i)=>{
  const n=Math.max(0,Number(r.donations)||0);
  return podium(i)+' *'+safeName(r.donor_name)+'* — R$ '+money(r.total)+' ('+n+' '+(n===1?'doação':'doações')+')';
});

// O comando principal deve sempre mostrar os totais históricos, mesmo que
// ainda não existam registros individualizados após a criação do livro-razão.
export function formatClanDonationOverview(clans,donors){
  const clanRows=Array.isArray(clans)?clans:[];
  const historicalTotal=clanRows.reduce((sum,row)=>sum+Math.max(0,Number(row.xp)||0),0);
  const lines=clanRows.map((c,i)=>
    podium(i)+' *'+safeName(c.name)+'* — R$ '+money(c.xp)+' doados');
  const people=donorLines(donors);
  return ['🏆 *RANKING DE DOAÇÕES — CLÃS*','',
    ...(lines.length?lines:['Nenhum clã registrado.']),
    '','💰 *Total histórico: R$ '+money(historicalTotal)+'*',
    '','👥 *RANKING INDIVIDUAL (DOAÇÕES NOVAS)*',
    ...(people.length?people:['Ainda não há doações individuais registradas.']),
    '','ℹ️ As doações antigas estão no total de cada clã, mas não possuem identificação do doador.',
    '📌 *!rankdoacoes cla* — doações do seu clã',
    '📌 *!rankdoacoes jogadores* — ranking individual'].join('\n');
}

// Para quem pertence a um clã: separar arrecadação histórica de saldo atual.
export function formatOwnClanDonations(clan,donors){
  if(!clan)return '🏴 Você não pertence a um clã.';
  const people=donorLines(donors);
  return ['🏴 *DOAÇÕES — '+safeName(clan.name).toUpperCase()+'*','',
    '💰 Total histórico doado: *R$ '+money(clan.xp)+'*',
    '🏦 Saldo atual do cofre: *R$ '+money(clan.treasury)+'*',
    '','👥 *RANKING DE DOADORES DO CLÃ*',
    ...(people.length?people:['Nenhuma doação individual registrada desde a atualização.']),
    '','ℹ️ Valores antigos contam no total do clã, mas não podem ser atribuídos a jogadores sem registros.'].join('\n');
}
