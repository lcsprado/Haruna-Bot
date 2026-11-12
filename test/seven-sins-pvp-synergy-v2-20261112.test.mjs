import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroCollabGearBonus,heroPvpAttack,heroPvpDefense} from '../src/neon/playable-heroes-core.js';
import {PECADOS_HEROES,PECADOS_WEAPONS,PECADOS_ARMORS} from '../src/neon/sete-pecados-catalog.js';
import {simulateFairDuel,buildFairFighter} from '../src/neon/pvp-balance-simulator.js';
import {formatPvpBattleReport} from '../src/neon/pvp-report.js';

const gearFor=(idx,mode='full')=>heroCollabGearBonus(
  PECADOS_HEROES[idx].species,
  mode==='armor'?null:PECADOS_WEAPONS[idx].id,
  mode==='weapon'?null:PECADOS_ARMORS[idx].id,'pvp'
);

test('seven matched sets share the same V2 offense, defense and critical bonuses',()=>{
  assert.equal(PECADOS_HEROES.length,7);
  for(let i=0;i<7;i++){
    const id=PECADOS_HEROES[i].species;
    const weapon=gearFor(i,'weapon'),armor=gearFor(i,'armor'),full=gearFor(i);
    assert.deepEqual([weapon.weapon,weapon.armor,weapon.set,weapon.finalDamage,weapon.finalReduction,weapon.crit],
      [true,false,false,.04,0,0],id);
    assert.deepEqual([armor.weapon,armor.armor,armor.set,armor.finalDamage,armor.finalReduction,armor.crit],
      [false,true,false,0,.04,0],id);
    assert.deepEqual([full.weapon,full.armor,full.set,full.finalDamage,full.finalReduction,full.crit],
      [true,true,true,.06,.04,.015],id);
    const mismatched=heroCollabGearBonus(id,PECADOS_WEAPONS[(i+1)%7].id,PECADOS_ARMORS[(i+1)%7].id,'pvp');
    assert.equal(mismatched.finalDamage,0,id);
    assert.equal(mismatched.finalReduction,0,id);
    assert.equal(mismatched.crit,0,id);
    const raid=heroCollabGearBonus(id,PECADOS_WEAPONS[i].id,PECADOS_ARMORS[i].id,'raid');
    assert.equal(raid.attack,.04,id+' raid damage must remain unchanged');
    assert.equal(raid.defense,.04,id+' raid armor must remain unchanged');
  }
});

test('weapons apply damage AFTER the hero 8 percent technique ceiling; armor applies AFTER 10 percent ceiling',()=>{
  for(let i=0;i<7;i++){
    const id=PECADOS_HEROES[i].species;
    const plain=heroPvpAttack({heroId:id,damage:1000,masteryStage:5,attackIndex:1});
    const armed=heroPvpAttack({heroId:id,damage:1000,masteryStage:5,attackIndex:1,gear:gearFor(i,'weapon')});
    const full=heroPvpAttack({heroId:id,damage:1000,masteryStage:5,attackIndex:1,gear:gearFor(i)});
    assert.equal(armed.damage,Math.round(plain.damage*1.04),id+' weapon bonus got absorbed by technique cap');
    assert.equal(full.damage,Math.round(plain.damage*1.06),id+' full set must add extra 2 percent');
    const naked=heroPvpDefense({heroId:id,damage:1000}).damage;
    const guarded=heroPvpDefense({heroId:id,damage:1000,gear:gearFor(i,'armor')}).damage;
    assert.equal(guarded,Math.round(naked*.96),id+' armor reduction got absorbed by technique cap');
  }
});

test('Ban PvP heals 1 percent naked, 3 percent with weapon, 5 percent with full set on hits 3 and 6 only',()=>{
  const idx=1,heroId='pecado_ban',maxHp=6000;
  const build=(gear,attackIndex,state={})=>heroPvpAttack({
    heroId,damage:1000,attackIndex,maxHp,masteryStage:5,state,gear
  });
  const none=build({},3),armor=build(gearFor(idx,'armor'),3);
  const weapon=build(gearFor(idx,'weapon'),3),full=build(gearFor(idx),3);
  assert.deepEqual([none.heal,armor.heal,weapon.heal,full.heal],[60,60,180,300]);
  assert.equal(gearFor(idx,'weapon').heal,.03);
  assert.equal(gearFor(idx).heal,.05);
  assert.equal(build(gearFor(idx),2).heal,0,'no healing before the 3rd hit');
  assert.equal(build(gearFor(idx),4).heal,0,'no healing on hit 4');
  assert.equal(build(gearFor(idx),5).heal,0,'no healing on hit 5');
  const naked=heroPvpDefense({heroId,damage:1000,state:{snatchBlocks:1}}).damage;
  const guarded=heroPvpDefense({heroId,damage:1000,state:{snatchBlocks:1},gear:gearFor(idx)}).damage;
  assert.ok(guarded<naked,'full set must strengthen Snatch defense');

  for(const [gear,perProc] of [[{},60],[gearFor(idx,'weapon'),180],[gearFor(idx),300]]){
    let state={},healed=0,healingIndices=[];
    for(let attackIndex=1;attackIndex<=24;attackIndex++){
      const hit=build(gear,attackIndex,state);
      if(hit.heal){healed+=hit.heal;healingIndices.push(attackIndex);}
      state=hit.state;
    }
    assert.deepEqual(healingIndices,[3,6],'only third and sixth attacks trigger Ban heal');
    assert.equal(healed,perProc*2,'Ban must never heal more than twice per duel');
    assert.equal(state.healCount,2,'heal counter persists through the duel');
  }
});

test('Meliodas full set reinforces counter without removing counter cap; Diane full set strengthens Heavy Metal',()=>{
  const counterState={counterCharge:1};
  const weapon=heroPvpAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:5,masteryStage:5,state:counterState,gear:gearFor(0,'weapon')});
  const full=heroPvpAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:5,masteryStage:5,state:counterState,gear:gearFor(0)});
  assert.ok(full.damage>weapon.damage);
  assert.ok(full.damage<=1161);
  const armor=heroPvpDefense({heroId:'pecado_diane',damage:1000,state:{rockGuard:1},gear:gearFor(4,'armor')});
  const fullGuard=heroPvpDefense({heroId:'pecado_diane',damage:1000,state:{rockGuard:1},gear:gearFor(4)});
  assert.ok(fullGuard.damage<armor.damage);
});

test('real PvP reads matched set critical once for each fighter and reports bonuses visibly',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  assert.match(db,/heroGear:aHeroGear/);assert.match(db,/heroGear:bHeroGear/);
  assert.match(db,/\+Number\(aHeroGear\?\.crit\|\|0\)/);
  assert.match(db,/\+Number\(bHeroGear\?\.crit\|\|0\)/);
  const full=gearFor(1);
  const msg=formatPvpBattleReport({ok:true,opening:{
    attacker:{jid:'a',name:'Ban',heroId:'pecado_ban',heroMasteryStage:5,heroGear:full,hp:1000,maxHp:1000,atk:1000,def:1000,spd:500,crit:.25},
    defender:{jid:'b',name:'Samurai',classId:'samurai',classApplied:true,awakeningStage:5,hp:1000,maxHp:1000,atk:1000,def:1000,spd:500,crit:.25}},
    log:[],roundCount:0,winner:{jid:'a',name:'Ban',hp:1000},loser:{jid:'b',name:'Samurai',hp:0},reward:0});
  assert.match(msg,/Conjunto sagrado/);assert.match(msg,/Arma vinculada \+4%/);
  assert.match(msg,/Armadura vinculada -4%/);assert.match(msg,/\+1,5 p\.p\. CRIT/);
});

test('deterministic duel audit actually includes both complete sets and raises hero stats against Samurai',()=>{
  const before=buildFairFighter('pecado_ban',{gear:true,collab:false});
  const after=buildFairFighter('pecado_ban',{gear:true,collab:true});
  assert.ok(Math.abs(after.crit-before.crit-.015)<1e-9);
  assert.equal(after.heroGear.set,true);
  for(const id of ['pecado_ban','pecado_meliodas','pecado_diane']){
    const noSet=simulateFairDuel(id,'samurai',{seed:20261112,gear:true,collab:false});
    const withSet=simulateFairDuel(id,'samurai',{seed:20261112,gear:true,collab:true});
    assert.equal(noSet.a.heroGear,null,id);
    assert.equal(withSet.a.heroGear.set,true,id);
  }
});
