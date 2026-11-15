import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateFairDuel} from '../src/neon/pvp-balance-simulator.js';
import {simulateStrategicDuel} from '../src/neon/pvp-strategy-balance-harness.js';

const pairs=[
  ['pecado_ban','samurai'],
  ['pecado_diane','berserker'],
  ['pecado_meliodas','paladin'],
  ['pecado_gowther','necromancer'],
  ['pecado_escanor','pecado_king'],
  ['warrior','assassin'],
  ['druid','mage']
];
test('experimental simulator exactly reproduces real baseline when strategies are neutral',()=>{
  for(const [a,b] of pairs)for(const seed of [1,2,3,17,222,777]){
    const before=simulateFairDuel(a,b,{seed,gear:true,awakening:5,mastery:5});
    const after=simulateStrategicDuel(a,b,{seed,gear:true,awakening:5,mastery:5});
    assert.equal(after.winner,before.winner,a+'/'+b+' seed='+seed);
    assert.equal(after.a.hp,before.a.hp,a+'/'+b+' HP a seed='+seed);
    assert.equal(after.b.hp,before.b.hp,a+'/'+b+' HP b seed='+seed);
    assert.deepEqual(after.a.metrics,before.a.metrics,a+'/'+b+' stats seed='+seed);
    assert.deepEqual(after.b.metrics,before.b.metrics,a+'/'+b+' stats seed='+seed);
  }
});
test('strategic tactics change actual combat calculations without touching permanent data',()=>{
  const opts={seed:1701,gear:true,awakening:5,mastery:5};
  const regular=simulateFairDuel('pecado_ban','samurai',opts);
  const tactical=simulateStrategicDuel('pecado_ban','samurai',{
    ...opts,postures:{pecado_ban:'tatica',samurai:'agressiva'},
    actions:{3:{pecado_ban:'tecnica',samurai:'atacar'},7:{pecado_ban:'proteger',samurai:'tecnica'}}
  });
  assert.ok(regular.a.hp!==tactical.a.hp||regular.b.hp!==tactical.b.hp);
  assert.ok(tactical.a.hp>=0&&tactical.a.hp<=tactical.a.maxHp);
  assert.ok(tactical.b.hp>=0&&tactical.b.hp<=tactical.b.maxHp);
});
test('matched progression audit: report posture win-rate shift across mirrored orders',()=>{
  const results=[];
  for(const [a,b] of pairs){
    let neutral=0,strategic=0,duels=0;
    for(let seed=1;seed<=80;seed++)for(const reverse of [false,true]){
      const left=reverse?b:a,right=reverse?a:b,options={seed:seed*977+19,gear:true,awakening:5,mastery:5};
      const before=simulateFairDuel(left,right,options);
      const after=simulateStrategicDuel(left,right,{...options,
        postures:{[a]:'tatica',[b]:'agressiva'},
        actions:{3:{[a]:'tecnica',[b]:'atacar'},7:{[a]:'proteger',[b]:'tecnica'},11:{[a]:'tecnica',[b]:'proteger'}}
      });
      neutral+=Number(before.winner===a);
      strategic+=Number(after.winner===a);
      duels++;
    }
    const baselineRate=neutral/duels,strategicRate=strategic/duels,shift=strategicRate-baselineRate;
    results.push({pair:a+' vs '+b,baselinePct:Math.round(baselineRate*1000)/10,
      strategicPct:Math.round(strategicRate*1000)/10,shiftPp:Math.round(shift*1000)/10});
    // This audit detects huge balance swings, not a guarantee of 50:50 for distinct builds.
    assert.ok(Math.abs(shift)<=.30,'strategy shifted over 30pp '+JSON.stringify(results.at(-1)));
  }
  console.log('PVP_STRATEGY_MATCHED_AUDIT '+JSON.stringify(results));
});