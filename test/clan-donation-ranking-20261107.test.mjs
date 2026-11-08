import test from 'node:test';
import assert from 'node:assert/strict';
import {formatClanDonors,formatClanDonationTotals} from '../src/neon/clan-donation-ranking.js';

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
