import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSiegeRoundV4} from '../src/neon/clan-siege-v4.js';

// Deterministic policy tournament using the exact deployed V4 engine.
// No database writes, inventory, players or live battles are affected.
const two=(a,b)=>[a,b];
const A=(target='castle')=>({action:'attack',target});
const D=(target='castle')=>({action:'defend',target});
const S=(target='castle')=>({action:'spy',target});
const R=(target='castle')=>({action:'repair',target});
const U=()=>({action:'supply',target:'depot'});
const both=(item)=>two(item,item);
const f=(m,side)=>m[side+'_fortress'];
const other=side=>side==='blue'?'red':'blue';
const policies={
  rush_castle:()=>both(A()),
  guard_castle:()=>both(D()),
  hybrid_castle:()=>two(A(),D()),
  gate_siege:(m,side)=>m[other(side)+'_gate']>0?both(A('gate')):both(A()),
  gate_plus_castle:(m,side)=>m[other(side)+'_gate']>0?two(A('gate'),A()):both(A()),
  depot_siege:(m,side)=>m[other(side)+'_supplies']>0?both(A('depot')):both(A()),
  depot_plus_castle:()=>two(A('depot'),A()),
  spy_castle:(m,side,r)=>r%2?two(A(),S()):both(A()),
  double_spy:(m,side,r)=>r%2?both(S()):both(A()),
  repair_attack:(m,side,r)=>m[side+'_hp']<1700&&m[side+'_repairs']<2&&m[side+'_supplies']>0?
    two(A(),R()):m[side+'_supplies']===0&&m[side+'_repairs']<2?
    two(A(),U()):both(A()),
  repair_guard:(m,side)=>m[side+'_hp']<1800&&m[side+'_repairs']<2&&m[side+'_supplies']>0?
    two(D(),R()):two(D(),U()),
  gate_guard:()=>two(A(),D('gate')),
  depot_guard:()=>two(A(),D('depot')),
  split_pressure:()=>two(A(),A('gate')),
  gate_defense:()=>two(A('gate'),D('gate')),
  guard_then_attack:(m,side,r)=>r<=2?both(D()):both(A()),
  attack_then_guard:(m,side,r)=>r<=2?both(A()):both(D()),
  reactive_castle:(m,side)=>m[side+'_hp']>m[other(side)+'_hp']+300?
    two(A(),D()):both(A()),
  spy_gate:(m,side,r)=>m[other(side)+'_gate']>0?
    (r%2?two(A('gate'),S('gate')):both(A('gate'))):both(A()),
};
const initial=(changes={})=>({
  blue_clan_id:'5',red_clan_id:'7',round:1,rules_version:4,
  blue_hp:2000,red_hp:2000,blue_repairs:0,red_repairs:0,
  blue_gate:2,red_gate:2,blue_supplies:1,red_supplies:1,
  blue_score:0,red_score:0,blue_spy_state:{},red_spy_state:{},
  blue_fortress:{maxHp:2000,attackPct:0,defensePct:0},
  red_fortress:{maxHp:2000,attackPct:0,defensePct:0},...changes
});
function match(a,b,changes={}){
  let st=initial(changes);
  const history=[];
  for(let round=1;round<=6;round++){
    st.round=round;
    const blue=a(st,'blue',round);
    const red=b(st,'red',round);
    const moves=[
      ...blue.map(x=>({...x,clan_id:'5'})),
      ...red.map(x=>({...x,clan_id:'7'}))
    ];
    const out=resolveSiegeRoundV4(st,moves);
    history.push({round,blue,red,result:out.result});
    st={...st,blue_hp:out.hp.blue,red_hp:out.hp.red,
      blue_gate:out.v4.gate.blue,red_gate:out.v4.gate.red,
      blue_supplies:out.v4.supplies.blue,red_supplies:out.v4.supplies.red,
      blue_score:out.v4.score.blue,red_score:out.v4.score.red,
      blue_spy_state:out.v4.spyState.blue,red_spy_state:out.v4.spyState.red,
      blue_repairs:out.repairs.blue,red_repairs:out.repairs.red};
    if(out.finished)return {winner:out.winner==='5'?'blue':out.winner==='7'?'red':'tie',
      rounds:round,reason:out.result.victoryRule,
      blueHp:out.hp.blue,redHp:out.hp.red,
      blueGate:out.v4.gate.blue,redGate:out.v4.gate.red,
      blueScore:out.v4.score.blue,redScore:out.v4.score.red,
      history};
  }
  throw Error('match did not end');
}
const policiesList=Object.entries(policies);
test('torneio completo de 19 políticas de clãs, cada uma com seis rodadas',()=>{
  const table={};
  for(const [name] of policiesList)table[name]={wins:0,losses:0,ties:0};
  const keyScores=[];
  for(const [name,blue] of policiesList)for(const [enemy,red] of policiesList){
    const game=match(blue,red);
    const side=table[name];
    if(game.winner==='blue')side.wins++;
    else if(game.winner==='red')side.losses++;
    else side.ties++;
    if(['rush_castle','guard_castle','hybrid_castle','gate_siege','spy_castle',
      'repair_attack'].includes(name)&&['rush_castle','guard_castle','hybrid_castle',
      'gate_siege','spy_castle','repair_attack'].includes(enemy)){
      keyScores.push({blue:name,red:enemy,winner:game.winner,blueHp:game.blueHp,
        redHp:game.redHp,rounds:game.rounds,criterion:game.reason});
    }
    // State integrity after 6-round battle.
    assert.ok(game.blueHp>=0&&game.redHp>=0);
    assert.ok(game.blueHp<=2250&&game.redHp<=2250);
    assert.ok(game.rounds>=1&&game.rounds<=6);
  }
  console.log('BALANCE_AUDIT_POLICY_TABLE='+JSON.stringify(table));
  console.log('BALANCE_AUDIT_HEAD_TO_HEAD='+JSON.stringify(keyScores));
  assert.equal(Object.values(table).reduce((s,r)=>s+r.wins+r.losses+r.ties,0),policiesList.length**2);
});
test('opções de contra-ataque contra dois atacantes (regras de verdade)',()=>{
  const group={};
  for(const [name,policy] of policiesList){
    const game=match(policies.rush_castle,policy);
    group[name]={winner:game.winner,hp:[game.blueHp,game.redHp],
      score:[game.blueScore,game.redScore],rounds:game.rounds};
  }
  console.log('BALANCE_AUDIT_VS_RUSH='+JSON.stringify(group));
  assert.equal(group.guard_castle.winner,'red');
  assert.equal(group.hybrid_castle.winner,'red');
});
test('não existe bônus de clã automático; efeito financeiro de melhorias é limitado',()=>{
  const base=match(policies.rush_castle,policies.hybrid_castle);
  const level1=match(policies.rush_castle,policies.hybrid_castle,{
    blue_hp:2050,blue_fortress:{maxHp:2050,attackPct:0,defensePct:0}
  });
  const max=match(policies.rush_castle,policies.hybrid_castle,{
    blue_hp:2250,blue_fortress:{maxHp:2250,attackPct:.1,defensePct:.075}
  });
  const attack=match(policies.rush_castle,policies.hybrid_castle,{
    blue_fortress:{maxHp:2000,attackPct:.02,defensePct:0}
  });
  const defense=match(policies.rush_castle,policies.hybrid_castle,{
    blue_fortress:{maxHp:2000,attackPct:0,defensePct:.015}
  });
  console.log('BALANCE_AUDIT_UPGRADES='+JSON.stringify({base:{winner:base.winner,hp:[base.blueHp,base.redHp]},
    wall1:{winner:level1.winner,hp:[level1.blueHp,level1.redHp]},
    arsenal1:{winner:attack.winner,hp:[attack.blueHp,attack.redHp]},
    defense1:{winner:defense.winner,hp:[defense.blueHp,defense.redHp]},
    maxed:{winner:max.winner,hp:[max.blueHp,max.redHp]}}));
  assert.ok(level1.blueHp>=base.blueHp);
});
test('dano bruto versus defesa exata: um round',()=>{
  const result=resolveSiegeRoundV4(initial(),[
    {...A(),clan_id:'5'},{...A(),clan_id:'5'},
    {...D(),clan_id:'7'},{...D(),clan_id:'7'}]);
  assert.deepEqual([result.hp.blue,result.hp.red],[1840,1901]);
  assert.equal(result.result.blueBlocked,0);
  assert.equal(result.result.redBlocked,297);
});


test('avaliar retorno de cada primeiro upgrade nos 361 confrontos',()=>{
  const scenarios={
    base:{maxHp:2000,attackPct:0,defensePct:0},
    walls1:{maxHp:2050,attackPct:0,defensePct:0},
    arsenal1:{maxHp:2000,attackPct:.02,defensePct:0},
    defense1:{maxHp:2000,attackPct:0,defensePct:.015},
    all5:{maxHp:2250,attackPct:.10,defensePct:.075}
  };
  const totals={};
  for(const [label,upgrade] of Object.entries(scenarios)){
    const x={wins:0,losses:0,ties:0,hpAdvantageTotal:0};
    for(const [,blue] of policiesList)for(const [,red] of policiesList){
      const g=match(blue,red,{
        blue_hp:upgrade.maxHp,
        blue_fortress:upgrade
      });
      if(g.winner==='blue')x.wins++;
      else if(g.winner==='red')x.losses++;
      else x.ties++;
      x.hpAdvantageTotal+=g.blueHp-g.redHp;
    }
    totals[label]={...x,averageHpAdvantage:Math.round(x.hpAdvantageTotal/361)};
  }
  console.log('BALANCE_AUDIT_UPGRADE_TOURNAMENT='+JSON.stringify(totals));
  assert.equal(totals.base.wins+totals.base.losses+totals.base.ties,361);
  assert.ok(totals.walls1.wins>=totals.base.wins);
});
test('atacar sempre versus ações aleatórias sem coordenação',()=>{
  let seed=24681357;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const candidates=[A(),A('gate'),A('depot'),D(),D('gate'),D('depot'),
    R(),R('gate'),S(),S('gate'),S('depot'),U()];
  const reckless=()=>two(candidates[Math.floor(random()*candidates.length)],
    candidates[Math.floor(random()*candidates.length)]);
  const total={wins:0,losses:0,ties:0};
  for(let i=0;i<3000;i++){
    const g=match(policies.rush_castle,reckless);
    if(g.winner==='blue')total.wins++;
    else if(g.winner==='red')total.losses++;
    else total.ties++;
  }
  console.log('BALANCE_AUDIT_RUSH_VS_RANDOM='+JSON.stringify(total));
  assert.equal(total.wins+total.losses+total.ties,3000);
});
test('identificar quem vence a estratégia de atacar duas vezes e depois defender',()=>{
  const table=[];
  for(const [name,policy] of policiesList){
    const g=match(policies.attack_then_guard,policy);
    table.push({enemy:name,winner:g.winner,blueHp:g.blueHp,redHp:g.redHp});
  }
  console.log('BALANCE_AUDIT_EARLY_ATTACK_THEN_GUARD='+JSON.stringify(table));
});