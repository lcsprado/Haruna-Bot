import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  HERO_COMBAT_PROFILES,PLAYABLE_HERO_IDS,playableHero,heroCombatStats,
  heroHpToPersistent,excludeActiveHeroPet,heroAttack,heroDefense,heroMasteryStage
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

test('heroi nunca e contabilizado como pet e nao ativa trio falso',()=>{
  const squad=[
    {species:'pecado_escanor',slot:1},
    {species:'pecado_meliodas',slot:2},
    {species:'pecado_ban',slot:3}
  ]
  const filtered=excludeActiveHeroPet(squad,'pecado_escanor')
  assert.equal(filtered.length,2)
  assert.deepEqual(squad.map(p=>p.species),['pecado_escanor','pecado_meliodas','pecado_ban'])
  assert.equal(excludeActiveHeroPet(squad,null).length,3)
})

test('skills automaticas sao finitas e limitadas em Raid e Boss',()=>{
  for(const id of PLAYABLE_HERO_IDS){
    let state={}
    for(let index=1;index<=100;index++){
      const hit=heroAttack({heroId:id,damage:1000,hp:800,maxHp:1000,attackIndex:index,state,context:'boss'})
      assert.ok(Number.isFinite(hit.damage) && hit.damage>=1 && hit.damage<=1300,id)
      assert.ok(hit.heal>=0&&hit.allyHeal>=0,id)
      const def=heroDefense({heroId:id,damage:1000,state:hit.state})
      assert.ok(def.damage>=700&&def.damage<=1000,id)
      state=def.state
    }
  }
})

test('herois possuem identidades mecanicas diferentes',()=>{
  assert.ok(heroAttack({heroId:'pecado_escanor',damage:1000,hp:100,maxHp:1000,attackIndex:25}).damage>1000)
  assert.ok(heroAttack({heroId:'pecado_ban',damage:1000,maxHp:2000,attackIndex:8}).heal>0)
  assert.ok(heroAttack({heroId:'pecado_king',damage:1000,maxHp:2000,attackIndex:8}).allyHeal>0)
  assert.ok(heroDefense({heroId:'pecado_diane',damage:1000,state:{guardCharges:1}}).damage<950)
  assert.ok(heroDefense({heroId:'pecado_merlin',damage:1000,state:{cubeCharges:1}}).damage<900)
  assert.equal(heroMasteryStage(0),1)
  assert.equal(heroMasteryStage(1300),5)
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
  assert.ok(games.includes('heroHpToPersistent(php,effectiveMaxHp,st.max_hp)'))
  assert.ok(games.includes('excludeActiveHeroPet(combatSnapshot?.team_pets||[],heroId)'))
  assert.ok(games.includes('awardPlayableHeroMastery(c'))
  assert.ok(whatsapp.includes('await initPlayableHeroes()'))
  assert.ok(whatsapp.includes('handlePlayableHeroCommand({cmd,args,sender,reply})'))
  assert.ok(api.includes("case 'hero.select'"))
  assert.ok(api.includes("case 'hero.class'"))
})
