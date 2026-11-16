// Ranking de doações do cofre dos clãs: somente leitura, sem alterar a economia.
// A progressão do clã (XP) já registra o total histórico, mas as doações
// individuais só podem ser ranqueadas a partir da implantação do livro-razão.
const money=value=>Math.max(0,Number(value)||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const podium=position=>['🥇','🥈','🥉'][position]||String(position+1)+'.';
const safeName=value=>String(value||'Jogador').replace(/[\r\n\t*_`~]/g,' ').trim().slice(0,40)||'Jogador';

function coverageLines(coverage,ownClan=false){
  if(!coverage)return [];
  const historic=Math.max(0,Number(coverage.historical_total)||0);
  const tracked=Math.max(0,Number(coverage.tracked_total)||0);
  const unknown=Math.max(0,Number(coverage.unidentified_total)||0);
  const discrepancy=Math.max(0,Number(coverage.discrepancy_total)||0);
  const archived=Math.max(0,Number(coverage.departed_clan_total)||0);
  return [
    '📊 *CONCILIAÇÃO DO HISTÓRICO*',
    '💰 Total histórico '+(ownClan?'deste clã':'dos clãs ativos')+': R$ '+money(historic),
    '✅ Registros com doador identificado: R$ '+money(tracked),
    '❔ Histórico sem doador identificado: R$ '+money(unknown),
    ...(discrepancy?['⚠️ Divergência de R$ '+money(discrepancy)+' entre livro-razão e histórico; conferir antes de premiar.']:[]),
    ...(!ownClan&&archived?['ℹ️ Registros de clãs encerrados: R$ '+money(archived)+' (fora do histórico dos clãs ativos).']:[])
  ];
}

export function formatClanDonors(rows,{clanName=null,clans=[],coverage=null}={}){
  const list=Array.isArray(rows)?rows:[];
  const specific=Boolean(clanName);
  // Não retornar ranking global vazio quando há doações históricas por clã.
  // Mesmo !topdoadores e !rankdoacoes jogadores devem oferecer informação útil.
  if(!specific && list.length===0)return formatClanDonationOverview(clans,[],coverage);
  const title=specific?'🏴 *RANKING PARCIAL DE DOADORES — '+safeName(clanName).toUpperCase()+'*':'🏆 *RANKING PARCIAL DE DOADORES — TODOS OS CLÃS*';
  const lines=list.map((r,i)=>{
    const n=Math.max(0,Number(r.donations)||0);
    return podium(i)+' *'+safeName(r.donor_name)+'* — R$ '+money(r.total)+' ('+n+' '+(n===1?'doação':'doações')+')';
  });
  return [title,'',...(lines.length?lines:['Nenhuma doação individual registrada desde a atualização.']),
    '',...coverageLines(coverage,specific),'','⚠️ Este ranking só considera doações individualizadas. Não comprova quem mais doou desde a fundação.',
    '💡 Para consultar as doações históricas por clã, use *!rankdoacoes*.'].join('\n');
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
export function formatClanDonationOverview(clans,donors,coverage=null){
  const clanRows=Array.isArray(clans)?clans:[];
  const historicalTotal=clanRows.reduce((sum,row)=>sum+Math.max(0,Number(row.xp)||0),0);
  const lines=clanRows.map((c,i)=>
    podium(i)+' *'+safeName(c.name)+'* — R$ '+money(c.xp)+' doados');
  const people=donorLines(donors);
  return ['🏆 *RANKING DE DOAÇÕES — CLÃS*','',
    ...(lines.length?lines:['Nenhum clã registrado.']),
    '','💰 *Total histórico: R$ '+money(historicalTotal)+'*',
    '',...coverageLines(coverage),'','👥 *RANKING INDIVIDUAL (PARCIAL — PERÍODO RASTREADO)*',
    ...(people.length?people:['Ainda não há doações individuais registradas.']),
    '','ℹ️ As doações antigas estão no total de cada clã, mas não possuem identificação do doador.',
    '📌 *!rankdoacoes cla* — doações do seu clã',
    '📌 *!rankdoacoes jogadores* — ranking individual'].join('\n');
}

// Para quem pertence a um clã: separar arrecadação histórica de saldo atual.
export function formatOwnClanDonations(clan,donors,coverage=null){
  if(!clan)return '🏴 Você não pertence a um clã.';
  const people=donorLines(donors);
  return ['🏴 *DOAÇÕES — '+safeName(clan.name).toUpperCase()+'*','',
    '💰 Total histórico doado: *R$ '+money(clan.xp)+'*',
    '🏦 Saldo atual do cofre: *R$ '+money(clan.treasury)+'*',
    '','👥 *RANKING PARCIAL DE DOADORES DO CLÃ*',
    ...(people.length?people:['Nenhuma doação individual registrada desde a atualização.']),
    '',...coverageLines(coverage,true),'','ℹ️ Os valores anteriores ao registro individual não podem ser atribuídos a jogadores sem provas.'].join('\n');
}
