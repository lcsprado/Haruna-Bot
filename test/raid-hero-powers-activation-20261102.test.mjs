import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroAttack,heroDefense} from '../src/neon/playable-heroes-core.js';
import {raidAttackSkillEvents,formatRaidSkillLine} from '../src/neon/raid-skill-summary.js';

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
const messages=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');

test('151 ataques Ban na maestria III disparam Imortalidade 18x, Snatch 18x e Hunter Fest 6x',()=>{
  const counts={Imortalidade:0,Snatch:0,'Hunter Fest':0};
  let state={};
  let positiveHeal=0;
  for(let n=1;n<=151;n++){
    const r=heroAttack({heroId:'pecado_ban',damage:1000,hp:3900,maxHp:5982,attackIndex:n,masteryStage:3,state,
      gear:{attack:.04,defense:.04,heal:.02}});
    state=r.state;
    for(const skill of raidAttackSkillEvents({heroId:'pecado_ban',attackIndex:n,masteryStage:3,result:r}))counts[skill]++;
    if(r.heal>0)positiveHeal++;
    // O bônus temporário de Snatch é limitado a 3 golpes recebidos.
    const d=heroDefense({heroId:'pecado_ban',damage:1000,state,gear:{defense:.04}});
    state=d.state;
    assert.ok(d.damage>=0&&d.damage<=1000);
  }
  assert.deepEqual(counts,{Imortalidade:18,Snatch:18,'Hunter Fest':6});
  assert.equal(positiveHeal,24);
  assert.equal(state.snatchCharges,0);
});

test('maestrias I e II não ativam Hunter Fest antes da III, nem Snatch antes da II',()=>{
  for(const stage of [1,2,3]){
    const a=heroAttack({heroId:'pecado_ban',attackIndex:8,maxHp:1000,masteryStage:stage});
    const b=heroAttack({heroId:'pecado_ban',attackIndex:25,maxHp:1000,masteryStage:stage});
    assert.ok(a.banActivations.includes('Imortalidade'));
    assert.equal(a.banActivations.includes('Snatch'),stage>=2);
    assert.equal(b.banActivations.includes('Hunter Fest'),stage>=3);
  }
});

test('na coincidência dos ataques 8 e 25 registra os três poderes sem perder nenhum',()=>{
  const x=heroAttack({heroId:'pecado_ban',attackIndex:200,maxHp:1000,masteryStage:3});
  assert.deepEqual(x.banActivations,['Snatch','Imortalidade','Hunter Fest']);
});

test('boletim conta poderes do Ban e também de outros heróis e classes',()=>{
  assert.match(games,/incrementRaidSkillCounts\(p\.skillActivations,raidAttackSkillEvents/);
  assert.match(games,/incrementRaidSkillCounts\(p\.skillActivations,raidDefenseSkillEvents/);
  assert.match(messages,/formatRaidSkillLine\(x,fmt\)/);
  const line=formatRaidSkillLine({activeHeroId:'pecado_ban',skillActivations:{Imortalidade:18,Snatch:18,'Hunter Fest':6}});
  assert.match(line,/Imortalidade 18× · Snatch 18× · Hunter Fest 6×/);
});
