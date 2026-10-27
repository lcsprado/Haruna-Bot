import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  HERO_COMBAT_PROFILES,PLAYABLE_HERO_IDS,playableHero,heroCombatStats,
  heroHpToPersistent,persistHeroHpDelta,excludeActiveHeroPet,heroAttack,heroDefense,heroMasteryStage
} from '../src/neon/playable-heroes-core.js'

test('sete personagens unicos com perfis equilibrados',()=>{
  assert.equal(PLAYABLE_HERO_IDS.length,7)
  assert.equal(new Set(PLAYABLE_HERO_IDS).size,7)
  for(const id of PLAYABLE_HERO_IDS){
    assert.ok(playableHero(id))
    assert.ok(HERO_COMBAT_PROFILES[id])
    assert.ok(HERO_COMBAT_PROFILES[id].atk<=25)
  }
})

test('estatisticas de classe viram heroi sem alterar dados persistentes',()=>{
  const st={hp:900,max_hp:1000,atk:650,def:540,spd:200,
    class_hp_bonus:130,class_atk_bonus:7,class_def_bonus:22,class_spd_bonus:5}
  const original=structuredClone(st)
  const h=heroCombatStats(st,'pecado_escanor')
  assert.equal(h.atk,664)
  assert.equal(h.def,528)
  assert.equal(h.spd,202)
  assert.equal(h.maxHp,955)
  assert.ok(Math.abs(h.hp/h.maxHp-.9)<.001)
  assert.deepEqual(st,original)
  assert.equal(heroHpToPersistent(h.hp,h.maxHp,st.max_hp),st.hp)
  assert.equal(heroHpToPersistent(0,h.maxHp,st.max_hp),0)
})

test('HP nao se perde ao percorrer milhares de turnos sem dano',()=>{
  let hp=2109,heroHp=2101,rem=0;
  for(let i=0;i<5000;i++){
    const after=persistHeroHpDelta({
      previousPersistentHp:hp,previousCombatHp:heroHp,currentCombatHp:heroHp,
      combatMaxHp:2451,persistentMaxHp:2496,remainder:rem
    });
    hp=after.hp;
    rem=after.remainder;
  }
  assert.equal(hp,2109);
  assert.equal(rem,0);
});

test('HP fracionario acumula danos, cura, derrota e nunca gera vida gratuita',()=>{
  let pHp=900,cHp=859,rem=0;
  // 200 impactos de um HP viram ~209 de perda persistida, em vez de 0 ou 200
  for(let i=0;i<200;i++){
    const next=persistHeroHpDelta({previousPersistentHp:pHp,previousCombatHp:cHp,
      currentCombatHp:cHp-1,combatMaxHp:955,persistentMaxHp:1000,remainder:rem});
    pHp=next.hp;cHp--;rem=next.remainder;
  }
  assert.ok(pHp>=690&&pHp<=692,'danos devem acompanhar a escala, sem erosao adicional');
  const restored=persistHeroHpDelta({previousPersistentHp:pHp,previousCombatHp:cHp,
    currentCombatHp:cHp+150,combatMaxHp:955,persistentMaxHp:1000,remainder:rem});
  assert.ok(restored.hp<=849);
  const barelyAlive=persistHeroHpDelta({previousPersistentHp:1,previousCombatHp:2,
    currentCombatHp:1,combatMaxHp:955,persistentMaxHp:1000});
  assert.equal(barelyAlive.hp,1,'um herói vivo não deve virar personagem morto no banco');
  const defeated=persistHeroHpDelta({previousPersistentHp:100,previousCombatHp:100,
    currentCombatHp:0,combatMaxHp:955,persistentMaxHp:1000});
  assert.equal(defeated.hp,0);
});

test('heroi nunca e contabilizado como pet e nao ativa trio falso',()=>{
  const squad=[
    {species:'pecado_escanor',slot:1},
    {species:'pecado_meliodas',slot:2},
    {species:'pecado_ban',slot:3}
  ]
  const filtered=excludeActiveHeroPet(squad,'pecado_escanor')
  assert.equal(filtered.length,0)
  assert.deepEqual(squad.map(p=>p.species),['pecado_escanor','pecado_meliodas','pecado_ban'])
  assert.equal(excludeActiveHeroPet(squad,null).length,0)
  assert.deepEqual(excludeActiveHeroPet([...squad,{species:'fenix_celestial',slot:4}],null).map(p=>p.species),['fenix_celestial'])
})

test('skills automaticas sao finitas e limitadas em Raid e Boss',()=>{
  for(const id of PLAYABLE_HERO_IDS){
    let state={}
    for(let index=1;index<=100;index++){
      const hit=heroAttack({heroId:id,damage:1000,hp:800,maxHp:1000,attackIndex:index,state,context:'boss',masteryStage:5})
      assert.ok(Number.isFinite(hit.damage) && hit.damage>=1 && hit.damage<=1300,id)
      assert.ok(hit.heal>=0&&hit.allyHeal>=0,id)
      const def=heroDefense({heroId:id,damage:1000,state:hit.state})
      assert.ok(def.damage>=700&&def.damage<=1000,id)
      state=def.state
    }
  }
})

test('herois possuem identidades mecanicas diferentes',()=>{
  assert.ok(heroAttack({heroId:'pecado_escanor',damage:1000,hp:100,maxHp:1000,attackIndex:25,masteryStage:5}).damage>1000)
  assert.ok(heroAttack({heroId:'pecado_ban',damage:1000,maxHp:2000,attackIndex:8,masteryStage:5}).heal>0)
  assert.ok(heroAttack({heroId:'pecado_king',damage:1000,maxHp:2000,attackIndex:8,masteryStage:5}).allyHeal>0)
  assert.ok(heroDefense({heroId:'pecado_diane',damage:1000,state:{guardCharges:1}}).damage<950)
  assert.ok(heroDefense({heroId:'pecado_merlin',damage:1000,state:{cubeCharges:1}}).damage<900)
  assert.equal(heroMasteryStage(0),1)
  assert.equal(heroMasteryStage(1300),5)
})

test('maestria libera habilidades no estagio correto, sem bonus prematuro',()=>{
  const first=heroAttack({heroId:'pecado_escanor',damage:1000,hp:500,maxHp:1000,attackIndex:8,masteryStage:1});
  const skilled=heroAttack({heroId:'pecado_escanor',damage:1000,hp:500,maxHp:1000,attackIndex:8,masteryStage:2});
  const ultimate=heroAttack({heroId:'pecado_escanor',damage:1000,hp:500,maxHp:1000,attackIndex:25,masteryStage:3});
  assert.equal(first.damage,1000);
  assert.ok(skilled.damage>first.damage);
  assert.ok(ultimate.damage>first.damage);
  assert.equal(heroHpToPersistent(1,1200,1000),1);
})

test('integracao protege classe, pet, modo e progresso',()=>{
  const db=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8')
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  const whatsapp=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.ok(db.includes('FROM pet_collection WHERE jid=$1 AND species=$2'))
  assert.ok(!db.includes('DELETE FROM pet_collection'))
  assert.ok(!db.includes('DELETE FROM pet_team'))
  assert.ok(db.includes('hero_mastery_awards'))
  assert.ok(db.includes('Você está em combate ativo'))
  assert.ok(games.includes('heroAttack({heroId:p.heroId'))
  assert.ok(games.includes('heroDefense({heroId:p.heroId'))
  assert.ok(games.includes('persistHeroHpDelta({'))
  assert.ok(games.includes('heroHpRemainder'))
  assert.ok(games.includes('excludeActiveHeroPet(combatSnapshot?.team_pets||[],heroId)'))
  assert.equal(games.split('if(heroId&&!combatPet&&reservePet)').length-1,2)
  assert.ok(games.includes('primary.species!==p.heroId'))
  assert.ok(games.includes('if(usePet&&heroId&&!petRow&&activePetSlot===1)'))
  assert.ok(games.includes('awardPlayableHeroMastery(c'))
  assert.ok(whatsapp.includes('await initPlayableHeroes()'))
  assert.ok(whatsapp.includes('handlePlayableHeroCommand({cmd,args,sender,reply})'))
  assert.ok(api.includes("case 'hero.select'"))
  assert.ok(api.includes("case 'hero.class'"))
})
