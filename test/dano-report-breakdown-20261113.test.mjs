import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDamageSamples,combineDamageStats,damageReportBreakdown} from '../src/neon/damage-hero-stats.js';

test('!dano reports normal and critical averages independently across Boss and Raid',()=>{
  const boss=summarizeDamageSamples([
    [4000,true],[4000,true],[4000,true],[4000,true],
    [2000,false],[2000,false],[2000,false],[2000,false],[2000,false],[2000,false]
  ]);
  const raid=summarizeDamageSamples(Array.from({length:10},()=>[5000,false]));
  const combined=combineDamageStats(boss,raid);
  const split=damageReportBreakdown(boss,raid);
  assert.equal(combined.count,20);
  assert.equal(combined.average,3900);
  assert.deepEqual(split,{
    normalCount:16,critCount:4,
    normalAverage:3875,critAverage:4000,critPercent:20
  });
});

test('!dano shows only normal average when raid has no critical hits',()=>{
  const raid=summarizeDamageSamples([[5600,false],[6000,false],[5900,false]]);
  assert.deepEqual(damageReportBreakdown(null,raid),{
    normalCount:3,critCount:0,
    normalAverage:5833,critAverage:null,critPercent:0
  });
});

test('!dano shows only critical average when there are no normal hits',()=>{
  const boss=summarizeDamageSamples([[7000,true],[9000,true]]);
  assert.deepEqual(damageReportBreakdown(boss,null),{
    normalCount:0,critCount:2,
    normalAverage:null,critAverage:8000,critPercent:100
  });
});

test('!dano does not invent samples for an empty report',()=>{
  assert.deepEqual(damageReportBreakdown(null,null),{
    normalCount:0,critCount:0,normalAverage:null,critAverage:null,critPercent:null
  });
});
