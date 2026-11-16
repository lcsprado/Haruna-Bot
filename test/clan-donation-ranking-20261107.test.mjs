import test from 'node:test';
import assert from 'node:assert/strict';
import {formatClanDonors,formatClanDonationTotals,formatClanDonationOverview,formatOwnClanDonations} from '../src/neon/clan-donation-ranking.js';

test('ranking global de doadores soma totais retornados e conta contribuições',()=>{
  const result=formatClanDonors([
    {donor_jid:'a',donor_name:'João',total:'15000',donations:3},
    {donor_jid:'b',donor_name:'Augusto',total:'2000',donations:1}
  ]);
  assert.match(result,/RANKING PARCIAL DE DOADORES — TODOS OS CLÃS/);
  assert.match(result,/João.*R\$ 15\.000 \(3 doações\)/);
  assert.match(result,/Augusto.*R\$ 2\.000 \(1 doação\)/);
  assert.match(result,/Não comprova quem mais doou desde a fundação/);
});

test('ranking interno distingue nome do clã e lista vazia',()=>{
  const result=formatClanDonors([],{clanName:'Sentinelas'});
  assert.match(result,/SENTINELAS/);
  assert.match(result,/Nenhuma doação individual registrada/);
});

test('ranking histórico dos clãs usa XP, não cofre ou doações rastreadas',()=>{
  const result=formatClanDonationTotals([
    {name:'Alpha',xp:'150000',treasury:'100',level:7},
    {name:'Beta',xp:'25000',treasury:'25000',level:2}
  ]);
  assert.match(result,/Alpha.*R\$ 150\.000 doados • Nv\.7/);
  assert.match(result,/Beta.*R\$ 25\.000 doados • Nv\.2/);
  assert.doesNotMatch(result,/R\$ 100 doados/);
});

test('comando principal mostra totais históricos mesmo com zero doadores identificados',()=>{
  const result=formatClanDonationOverview([
    {name:'METEDORES DE PLANTÃO',xp:'71202000',treasury:'18202000',level:2849},
    {name:'os entrosas',xp:'36000000',treasury:'16000000',level:1441}
  ],[]);
  assert.match(result,/RANKING DE DOAÇÕES — CLÃS/);
  assert.match(result,/71\.202\.000 doados/);
  assert.match(result,/36\.000\.000 doados/);
  assert.match(result,/Total histórico: R\$ 107\.202\.000/);
  assert.match(result,/não há doações individuais registradas/);
  assert.doesNotMatch(result,/R\$ 18\.202\.000 doados/);
});

test('ranking interno mostra histórico arrecadado distinto do saldo atual',()=>{
  const result=formatOwnClanDonations({name:'Guerreiros',xp:40000000,treasury:2000000},[]);
  assert.match(result,/Total histórico doado: \*R\$ 40\.000\.000/);
  assert.match(result,/Saldo atual do cofre: \*R\$ 2\.000\.000/);
  assert.match(result,/Nenhuma doação individual registrada desde a atualização/);
});

test('ranking individual vazio exibe o histórico dos clãs como alternativa',()=>{
  const result=formatClanDonors([],{clans:[
    {name:'METEDORES DE PLANTÃO',xp:71202000},
    {name:'os entrosas',xp:36000000}
  ]});
  assert.match(result,/RANKING DE DOAÇÕES — CLÃS/);
  assert.match(result,/R\$ 71\.202\.000 doados/);
  assert.match(result,/R\$ 36\.000\.000 doados/);
  assert.match(result,/Total histórico: R\$ 107\.202\.000/);
  assert.doesNotMatch(result,/RANKING PARCIAL DE DOADORES — TODOS OS CLÃS/);
  assert.doesNotMatch(result,/Nenhuma doação individual registrada ainda/);
});

test('ranking com doadores continua mostrando apenas dados individuais',()=>{
  const result=formatClanDonors([{donor_name:'Jogador',total:'12000',donations:2}],{
    clans:[{name:'Alpha',xp:5000000}]
  });
  assert.match(result,/RANKING PARCIAL DE DOADORES — TODOS OS CLÃS/);
  assert.match(result,/R\$ 12\.000 \(2 doações\)/);
  assert.doesNotMatch(result,/R\$ 5\.000\.000/);
});

test('ranking evidencia diferença entre histórico e registros de doadores',()=>{
  const coverage={historical_total:300000000,tracked_total:200000000,
    unidentified_total:100000000,discrepancy_total:0,departed_clan_total:0};
  const result=formatClanDonors([{donor_name:'João',total:200000000,donations:5}],
    {coverage,clans:[{name:'Alpha',xp:300000000}]});
  assert.match(result,/Total histórico dos clãs ativos: R\$ 300\.000\.000/);
  assert.match(result,/Registros com doador identificado: R\$ 200\.000\.000/);
  assert.match(result,/Histórico sem doador identificado: R\$ 100\.000\.000/);
});

test('diferença negativa é sinalizada sem inventar doador',()=>{
  const result=formatOwnClanDonations({name:'Alpha',xp:900,treasury:100},[],
    {historical_total:900,tracked_total:1200,unidentified_total:0,discrepancy_total:300});
  assert.match(result,/Divergência de R\$ 300/);
});
