import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASCENSION_WEEK, ascensionWeekActive, ascensionPlayerMultiplier,
  ascensionHeroLevelDailyCap, ascensionVeteranTrial,
  ascensionTerritoryOpen, ascensionTerritoryPhase, ascensionTerritoryPoints,
  ascensionTerritoryTally, recordAscensionVeteranActivity,
  chooseAscensionTerritoryAction, getAscensionVeteranProgress
} from '../src/neon/ascension-week-20261102.js';
import {heroLevelAwardPolicy} from '../src/neon/playable-heroes-core.js';

const within = Date.parse('2026-11-04T12:00:00-03:00');
const before = Date.parse('2026-11-01T23:59:59-03:00');
const after = Date.parse('2026-11-09T00:00:00-03:00');

test('start and end use Brasilia local time and do not affect today', () => {
  assert.equal(ascensionWeekActive(before), false);
  assert.equal(ascensionWeekActive(ASCENSION_WEEK.startsAt), true);
  assert.equal(ascensionWeekActive(after), false);
  assert.equal(ascensionPlayerMultiplier(50, before), 1);
  assert.equal(ascensionPlayerMultiplier(50, after), 1);
});
test('catch-up tiers stop strictly at level 300', () => {
  for(const [lv,expected] of [[1,4],[99,4],[100,3],[199,3],[200,2],[299,2],[300,1],[342,1],[600,1]]) {
    assert.equal(ascensionPlayerMultiplier(lv,within),expected,'level '+lv);
  }
});
test('hero bonus requires eligible player, hero below 70, and event window', () => {
  assert.equal(ascensionHeroLevelDailyCap({playerLevel:299,heroLevel:69,nowMs:within}),1000);
  assert.equal(ascensionHeroLevelDailyCap({playerLevel:299,heroLevel:70,nowMs:within}),550);
  assert.equal(ascensionHeroLevelDailyCap({playerLevel:300,heroLevel:20,nowMs:within}),550);
  assert.equal(ascensionHeroLevelDailyCap({playerLevel:299,heroLevel:20,nowMs:before}),550);
  assert.equal(heroLevelAwardPolicy({earnedToday:500,currentXp:6800,xp:150,playerLevel:299,heroLevel:69,nowMs:within}).amount,150);
  assert.equal(heroLevelAwardPolicy({earnedToday:550,currentXp:6800,xp:150,playerLevel:299,heroLevel:70,nowMs:within}).amount,0);
  assert.equal(heroLevelAwardPolicy({earnedToday:550,currentXp:6800,xp:150}).amount,0);
});
test('veteran goals validate eligible raid levels and existing activities', () => {
  assert.equal(ascensionVeteranTrial('raid',{raidLevel:20}),null);
  assert.deepEqual(ascensionVeteranTrial('raid',{raidLevel:75}),{kind:'raid',goal:1});
  assert.deepEqual(ascensionVeteranTrial('boss'),{kind:'boss',goal:1});
  assert.deepEqual(ascensionVeteranTrial('dungeon'),{kind:'dungeon',goal:2});
  assert.equal(ascensionVeteranTrial('ifood'),null);
});
test('veteran proof writes only for valid activities during event and player 300+',async()=>{
  const writes=[];
  const db={query:async(sql,params)=>{
    writes.push({sql,params});
    return sql.startsWith('SELECT level')?{rows:[{level:342}]}:{rowCount:1,rows:[]};
  }};
  assert.equal(await recordAscensionVeteranActivity(db,'veteran','raid',{raidLevel:75},within),true);
  assert.equal(writes.length,2);
  assert.equal(writes[1].params[0],'ascension_20261102:veteran:raid:veteran');
  assert.equal(await recordAscensionVeteranActivity(db,'veteran','raid',{raidLevel:20},within),false);
  assert.equal(await recordAscensionVeteranActivity(db,'veteran','boss',{},before),false);
  assert.equal(writes.length,2);
  const newPlayer={query:async(sql)=>sql.startsWith('SELECT level')?{rows:[{level:299}]}:{rowCount:1}};
  assert.equal(await recordAscensionVeteranActivity(newPlayer,'new','boss',{},within),false);
});
test('territory is three phases only, one action per player per phase',async()=>{
  const at=ASCENSION_WEEK.territoryStartsAt;
  assert.equal(ascensionTerritoryOpen(at-1),false);
  assert.equal(ascensionTerritoryPhase(at),0);
  assert.equal(ascensionTerritoryPhase(at+10*60*1000),1);
  assert.equal(ascensionTerritoryPhase(at+20*60*1000),2);
  assert.equal(ascensionTerritoryOpen(ASCENSION_WEEK.territoryEndsAt),false);
  assert.equal(ascensionTerritoryPoints(0,2),4);
  assert.equal(ascensionTerritoryPoints(1,1),4);
  assert.equal(ascensionTerritoryPoints(2,3),4);
  const writes=[];
  const mock={query:async(sql,params)=>{
    writes.push({sql,params});
    return sql.startsWith('SELECT level')?{rows:[{level:320}]}:{rowCount:1};
  }};
  const result=await chooseAscensionTerritoryAction(mock,'test-player',2,at);
  assert.equal(result.team,'veteranos');
  assert.equal(result.points,4);
  assert.equal(writes[1].params[0],'ascension_20261102:district:0:test-player');
  const twice={query:async(sql)=>sql.startsWith('SELECT level')?{rows:[{level:300}]}:{rowCount:0}};
  await assert.rejects(()=>chooseAscensionTerritoryAction(twice,'test-player',1,at),/já participou/);
  await assert.rejects(()=>chooseAscensionTerritoryAction(mock,'test-player',1,at-1),/08\/11/);
});
test('territory scores normalize by number of unique contributors',()=>{
  const rows=[
    {value:{team:'ascendentes',jid:'A',phase:0,action:2}},
    {value:{team:'ascendentes',jid:'A',phase:1,action:1}},
    {value:{team:'veteranos',jid:'V',phase:0,action:1}},
    {value:{team:'veteranos',jid:'V',phase:1,action:2}}
  ];
  const score=ascensionTerritoryTally(rows);
  assert.equal(score.ascendentes.players,1);
  assert.equal(score.ascendentes.score,8);
  assert.equal(score.veteranos.score,5);
  assert.equal(score.winner,'ascendentes');
});
test('veteran status shows durable trial counters and finished condition',async()=>{
  const mock={query:async()=>({rows:[
    {key:'ascension_20261102:veteran:raid:v',value:{count:1}},
    {key:'ascension_20261102:veteran:boss:v',value:{count:5}},
    {key:'ascension_20261102:veteran:dungeon:v',value:{count:2}}
  ]})};
  const state=await getAscensionVeteranProgress(mock,'v');
  assert.equal(state.complete,true);
  assert.equal(state.boss.count,1);
});
