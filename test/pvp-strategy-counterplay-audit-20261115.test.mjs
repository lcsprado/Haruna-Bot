import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateStrategicDuel} from '../src/neon/pvp-strategy-balance-harness.js';
import {simulateFairDuel} from '../src/neon/pvp-balance-simulator.js';

// Mirrored-side deterministic comparison. The current combat stats and abilities are
// unchanged; we compare only postures + a fixed 3-decision counterplay policy.
const pairs=[
  ['pecado_ban','samurai'],['pecado_diane','berserker'],
  ['pecado_meliodas','paladin'],['pecado_gowther','necromancer'],
  ['pecado_escanor','pecado_king'],['warrior','assassin'],
  ['druid','mage'],['pecado_merlin','mage'],['pecado_king','archer']
];
const plans=[
  {name:'A uses tactical counter',postureA:'tatica',postureB:'agressiva',
    actionsA:['tecnica','proteger','tecnica'],actionsB:['atacar','tecnica','proteger']},
  {name:'B uses tactical counter',postureA:'agressiva',postureB:'tatica',
    actionsA:['atacar','tecnica','proteger'],actionsB:['tecnica','proteger','tecnica']},
  {name:'A uses aggressive / B defensive',postureA:'agressiva',postureB:'defensiva',
    actionsA:['atacar','tecnica','atacar'],actionsB:['proteger','tecnica','proteger']},
  {name:'A uses defensive / B tactical',postureA:'defensiva',postureB:'tatica',
    actionsA:['proteger','tecnica','proteger'],actionsB:['tecnica','atacar','tecnica']}
];
test('inverted strategies: report 9 cross-role matchups with identical randomized inputs',()=>{
  const report=[];
  let observedPositive=0,observedNegative=0;
  for(const [a,b] of pairs){
    let base=0;
    const sum=Object.fromEntries(plans.map(p=>[p.name,0]));
    const seeds=180;
    for(let n=1;n<=seeds;n++)for(let swapped=0;swapped<2;swapped++){
      const left=swapped?b:a,right=swapped?a:b,opts={seed:20261115+n*17,gear:true,awakening:5,mastery:5};
      base+=Number(simulateFairDuel(left,right,opts).winner===a);
      for(const p of plans){
        const actions=Object.fromEntries([3,7,11].map((r,i)=>[r,{[a]:p.actionsA[i],[b]:p.actionsB[i]}]));
        const result=simulateStrategicDuel(left,right,{
          ...opts,postures:{[a]:p.postureA,[b]:p.postureB},actions
        });
        sum[p.name]+=Number(result.winner===a);
      }
    }
    const total=seeds*2;
    const baseline=Math.round(base/total*1000)/10;
    const row={pair:a+' x '+b,baseline,...Object.fromEntries(
      plans.map(p=>[p.name,Math.round(sum[p.name]/total*1000)/10])
    )};
    for(const p of plans){
      const shift=row[p.name]-row.baseline;
      if(shift>0)observedPositive++;
      if(shift<0)observedNegative++;
      assert.ok(Math.abs(shift)<=40,'unbounded strategy shift '+JSON.stringify(row));
    }
    report.push(row);
  }
  assert.ok(observedPositive>0 && observedNegative>0,'both sides of counterplay must have effects across matchups');
  console.log('PVP_COUNTERPLAY_AUDIT '+JSON.stringify({matches:pairs.length,duels:pairs.length*180*2*5,report}));
});
