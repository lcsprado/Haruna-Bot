import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSiegeRound,isClanSiegeEnabled} from '../src/neon/clan-siege.js';

function match(overrides={}){
  return {blue_clan_id:'1',red_clan_id:'2',blue_hp:2000,red_hp:2000,
    blue_repairs:0,red_repairs:0,blue_spy:0,red_spy:0,round:1,...overrides};
}
const move=(clan_id,action)=>({clan_id,action});

test('cerco: 180 de ataque, -35% com guarda, reparo de 140, efeitos simultâneos',()=>{
  const result=resolveSiegeRound(match(),[
    move('1','attack'),move('1','repair'),move('2','defend'),move('2','attack')
  ]);
  assert.equal(result.hp.blue,1960);
  assert.equal(result.hp.red,1883);
  assert.equal(result.repairs.blue,1);
  assert.equal(result.result.blueDamage,117);
  assert.equal(result.finished,false);
});

test('cerco: defesa dupla não ultrapassa 60%',()=>{
  const result=resolveSiegeRound(match(),[
    move('1','attack'),move('1','attack'),move('2','defend'),move('2','defend')
  ]);
  assert.equal(result.hp.red,1856);
});

test('cerco: espionagem concede +20% somente no round seguinte',()=>{
  const first=resolveSiegeRound(match(),[
    move('1','spy'),move('1','defend'),move('2','attack')
  ]);
  assert.equal(first.spy.blue,1);
  assert.equal(first.result.blueDamage,0);
  const second=resolveSiegeRound(match({round:2,blue_spy:1,red_hp:first.hp.red}),[
    move('1','attack')
  ]);
  assert.equal(second.result.blueDamage,216);
  assert.equal(second.spy.blue,0);
});

test('cerco: limita reparos acumulados e respeita 2.000 HP',()=>{
  const r=resolveSiegeRound(match({blue_hp:1000,blue_repairs:2}),[
    move('1','repair'),move('1','repair')
  ]);
  assert.equal(r.hp.blue,1000);
  assert.equal(r.repairs.blue,2);
  const capped=resolveSiegeRound(match({blue_hp:1990}),[move('1','repair')]);
  assert.equal(capped.hp.blue,2000);
});

test('cerco: encerra no round 6 e admite empate sem prêmio',()=>{
  const tie=resolveSiegeRound(match({round:6,blue_hp:400,red_hp:400}),[]);
  assert.equal(tie.finished,true);
  assert.equal(tie.winner,null);
  const win=resolveSiegeRound(match({round:6,blue_hp:500,red_hp:400}),[]);
  assert.equal(win.winner,'1');
});

test('cerco: ativação somente com flag explícita 1',()=>{
  const prev=process.env.ALPHA_CLAN_SIEGE_ENABLED;
  try{
    process.env.ALPHA_CLAN_SIEGE_ENABLED='0';
    assert.equal(isClanSiegeEnabled(),false);
    process.env.ALPHA_CLAN_SIEGE_ENABLED='1';
    assert.equal(isClanSiegeEnabled(),true);
  }finally{
    if(prev===undefined)delete process.env.ALPHA_CLAN_SIEGE_ENABLED;
    else process.env.ALPHA_CLAN_SIEGE_ENABLED=prev;
  }
});
