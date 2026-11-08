import test from 'node:test';
import assert from 'node:assert/strict';
import {formatClanDonors,formatClanDonationTotals,formatClanDonationOverview,formatOwnClanDonations} from '../src/neon/clan-donation-ranking.js';

test('ranking global de doadores soma totais retornados e conta contribuições',()=>{
  const result=formatClanDonors([
    {donor_jid:'a',donor_name:'João',total:'15000',donations:3},
    {donor_jid:'b',donor_name:'Augusto',total:'2000',donations:1}
  ]);
  assert.match(result,/RANKING DE DOADORES — TODOS OS CLÃS/);
  assert.match(result,/João.*R\$ 15\.000 \(3 doações\)/);
  assert.match(result,/Augusto.*R\$ 2\.000 \(1 doação\)/);
  assert.match(result,/anteriores não tinham identificação/);
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
  assert.doesNotMatch(result,/RANKING DE DOADORES — TODOS OS CLÃS/);
  assert.doesNotMatch(result,/Nenhuma doação individual registrada ainda/);
});

test('ranking com doadores continua mostrando apenas dados individuais',()=>{
  const result=formatClanDonors([{donor_name:'Jogador',total:'12000',donations:2}],{
    clans:[{name:'Alpha',xp:5000000}]
  });
  assert.match(result,/RANKING DE DOADORES — TODOS OS CLÃS/);
  assert.match(result,/R\$ 12\.000 \(2 doações\)/);
  assert.doesNotMatch(result,/R\$ 5\.000\.000/);
});
