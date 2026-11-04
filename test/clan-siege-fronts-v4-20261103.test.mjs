import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveSiegeRoundV4,validateSiegeV4Move} from '../src/neon/clan-siege-v4.js';
const base=(changes={})=>({blue_clan_id:'5',red_clan_id:'7',round:1,
  rules_version:4,blue_hp:2000,red_hp:2000,blue_repairs:0,red_repairs:0,
  blue_gate:2,red_gate:2,blue_supplies:1,red_supplies:1,
  blue_score:0,red_score:0,blue_spy_state:{},red_spy_state:{},
  blue_fortress:{maxHp:2000,attackPct:0,defensePct:0},
  red_fortress:{maxHp:2000,attackPct:0,defensePct:0},...changes});
const m=(side,action,target='castle')=>({clan_id:side==='blue'?'5':'7',action,target});
test('frentes e ações validadas, sem compra por dinheiro real ou atributos pessoais',()=>{
  assert.deepEqual(validateSiegeV4Move('attack','gate'),{action:'attack',target:'gate'});
  assert.throws(()=>validateSiegeV4Move('supply','castle'));
  assert.throws(()=>validateSiegeV4Move('repair','depot'));
  assert.throws(()=>validateSiegeV4Move('superattack','castle'));
  assert.throws(()=>validateSiegeV4Move('attack','unknown'));
});
test('dois aríetes rompem portão e ataques seguintes ganham +25%',()=>{
  const first=resolveSiegeRoundV4(base(),[m('blue','attack','gate'),m('blue','attack','gate')]);
  assert.equal(first.v4.gate.red,0);
  assert.equal(first.result.blueDamage,231);
  assert.equal(first.v4.score.blue,4);
  assert.equal(first.hp.red,1769);
  const next=resolveSiegeRoundV4(base({round:2,red_gate:0,red_hp:1769}),[
    m('blue','attack'),m('blue','attack')]);
  assert.equal(next.result.blueDamage,495);
  assert.equal(next.hp.red,1274);
  const saved=resolveSiegeRoundV4(base({round:2,red_gate:1}),[
    m('blue','attack'),m('blue','attack')]);
  assert.equal(saved.result.blueDamage,396);
});
test('defender o portão anula uma investida e contra-ataca no alvo certo',()=>{
  const r=resolveSiegeRoundV4(base(),[
    m('blue','attack','gate'),m('blue','attack','gate'),
    m('red','defend','gate')]);
  assert.equal(r.v4.gate.red,1);
  assert.equal(r.result.blueDamage,116);
  assert.equal(r.result.redCounter,80);
  assert.equal(r.hp.blue,1920);
  assert.equal(r.hp.red,1884);
  const wrong=resolveSiegeRoundV4(base(),[
    m('blue','attack','gate'),m('red','defend','castle')]);
  assert.equal(wrong.result.blueCounter,0);
  assert.equal(wrong.v4.gate.red,1);
  assert.equal(wrong.hp.red,1906); // 105-10% = 94
});
test('depósito dá suprimento, saque priva rival e não altera tesouro',()=>{
  const gain=resolveSiegeRoundV4(base(),[m('blue','supply','depot')]);
  assert.equal(gain.v4.supplies.blue,2);
  const raid=resolveSiegeRoundV4(base(),[m('blue','attack','depot')]);
  assert.equal(raid.v4.supplies.blue,2);
  assert.equal(raid.v4.supplies.red,0);
  assert.equal(raid.v4.score.blue,2);
  assert.equal(raid.result.blueDamage,110);
  const guarded=resolveSiegeRoundV4(base(),[m('blue','attack','depot'),m('red','defend','depot')]);
  assert.equal(guarded.v4.supplies.red,1);
  assert.equal(guarded.result.redCounter,80);
});
test('reparo usa 1 suprimento, é calculado antes do saque e respeita 2 por partida',()=>{
  const one=resolveSiegeRoundV4(base({red_hp:1500}),[
    m('red','repair'),m('blue','attack','depot')]);
  assert.equal(one.result.redHeal,220);
  assert.equal(one.hp.red,1610);
  assert.equal(one.v4.supplies.red,0);
  assert.equal(one.result.blueLoot,0);
  const refill=resolveSiegeRoundV4(base({blue_hp:1000}),[
    m('blue','supply','depot'),m('blue','repair')]);
  assert.equal(refill.hp.blue,1220);
  assert.equal(refill.v4.supplies.blue,1);
  assert.equal(refill.repairs.blue,1);
  const noStock=resolveSiegeRoundV4(base({blue_supplies:0,blue_hp:1000}),[m('blue','repair')]);
  assert.equal(noStock.hp.blue,1000);
  assert.equal(noStock.repairs.blue,0);
  const exhausted=resolveSiegeRoundV4(base({blue_repairs:2,blue_hp:1000}),[m('blue','repair')]);
  assert.equal(exhausted.hp.blue,1000);
});
test('espionagem na mesma frente exige coordenação entre dois integrantes',()=>{
  const mismatch=resolveSiegeRoundV4(base(),[m('blue','attack'),m('blue','spy','gate')]);
  assert.equal(mismatch.result.blueDamage,180);
  assert.equal(mismatch.v4.spyState.blue.gate,1);
  const marked=resolveSiegeRoundV4(base(),[m('blue','attack'),m('blue','spy','castle')]);
  assert.equal(marked.result.blueDamage,234);
  const next=resolveSiegeRoundV4(base({round:2,blue_spy_state:marked.v4.spyState.blue}),[
    m('blue','attack')]);
  assert.equal(next.result.blueDamage,288);
  assert.equal(next.v4.spyState.blue.castle,0);
});
test('empate de HP desempata por objetivos, portão e estoque, sem moeda aleatória',()=>{
  const score=resolveSiegeRoundV4(base({round:6,blue_hp:600,red_hp:600,blue_score:2}),[]);
  assert.equal(score.winner,'5');
  assert.equal(score.result.victoryRule,'objectives');
  const gate=resolveSiegeRoundV4(base({round:6,blue_hp:600,red_hp:600,red_gate:1}),[]);
  assert.equal(gate.winner,'5');
  assert.equal(gate.result.victoryRule,'gate');
  const supply=resolveSiegeRoundV4(base({round:6,blue_hp:600,red_hp:600,blue_supplies:2}),[]);
  assert.equal(supply.winner,'5');
  assert.equal(supply.result.victoryRule,'supplies');
  const tie=resolveSiegeRoundV4(base({round:6,blue_hp:600,red_hp:600}),[]);
  assert.equal(tie.winner,null);
  assert.equal(tie.result.victoryRule,'tie');
});
test('invariantes de 1500 confrontos: limite de HP, portão e suprimentos',()=>{
  const actions=[['attack','castle'],['attack','gate'],['attack','depot'],
    ['defend','castle'],['defend','gate'],['defend','depot'],
    ['repair','castle'],['repair','gate'],['spy','castle'],['spy','gate'],
    ['spy','depot'],['supply','depot']];
  for(let i=0;i<1500;i++){
    const moves=Array.from({length:4},(_,j)=>{
      const [action,target]=actions[(i*7+j*11+Math.floor(i/13)*3)%actions.length];
      return m(j<2?'blue':'red',action,target);
    });
    const r=resolveSiegeRoundV4(base({round:i%6+1,
      blue_hp:i%1200+200,red_hp:(i*17)%1200+200,
      blue_gate:i%3,red_gate:(i*5)%3,
      blue_supplies:i%4,red_supplies:(i*3)%4,
      blue_repairs:i%3,red_repairs:(i*7)%3}),moves);
    for(const side of ['blue','red']){
      assert.ok(Number.isInteger(r.hp[side])&&r.hp[side]>=0&&r.hp[side]<=2000);
      assert.ok(Number.isInteger(r.v4.gate[side])&&r.v4.gate[side]>=0&&r.v4.gate[side]<=2);
      assert.ok(Number.isInteger(r.v4.supplies[side])&&r.v4.supplies[side]>=0&&r.v4.supplies[side]<=3);
      assert.ok(Number.isInteger(r.repairs[side])&&r.repairs[side]<=2);
    }
  }
});
test('a API e o motor mantêm V1/V2/V3 e criam V4 apenas para novas guerras',()=>{
  const server=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
  assert.match(server,/if\(Number\(match\.rules_version\|\|1\)>=4\)return resolveSiegeRoundV4/);
  assert.match(server,/VALUES\(\$1,\$2,\$3,\$4,'active',4/);
  assert.match(server,/alpha_siege_moves.*ADD COLUMN IF NOT EXISTS target/);
  assert.match(server,/blue_spy_state=COALESCE/);
  assert.doesNotMatch(server,/UPDATE wallets SET/);
});
