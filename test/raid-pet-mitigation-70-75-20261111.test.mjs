import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {RAID_HIGH_TIER_PET_DAMAGE_REDUCTION,raidPetDamageMultiplier,mitigateRaidPetDamage,estimatedRaidPetHit} from '../src/neon/raid-pet-mitigation.js'
import {chooseEconomicPetPotion} from '../src/neon/pet-potion-economy.js'

test('30% apenas nas Raids 70/75, sem reduzir Boss, PvP ou outras Raids',()=>{
  assert.equal(RAID_HIGH_TIER_PET_DAMAGE_REDUCTION,.30)
  for(const level of [70,75]){
    assert.ok(Math.abs(raidPetDamageMultiplier(level)-.7)<1e-10)
    assert.equal(mitigateRaidPetDamage(level,100),70)
  }
  for(const level of [10,15,50,60,65,69,71,76,99,0,undefined]){
    assert.equal(raidPetDamageMultiplier(level),1)
    assert.equal(mitigateRaidPetDamage(level,100),100)
  }
  assert.equal(mitigateRaidPetDamage(75,1),1)
  assert.equal(mitigateRaidPetDamage(75,0),0)
  assert.equal(mitigateRaidPetDamage(75,3),2)
})

test('estimativa de risco acompanha mitigação sem subestimar dano especial',()=>{
  assert.equal(estimatedRaidPetHit(75,285),120)
  assert.equal(estimatedRaidPetHit(70,200),84)
  assert.equal(estimatedRaidPetHit(65,285),171)
  assert.equal(estimatedRaidPetHit(75,0),0)
})

test('integração altera apenas o dano do pet no motor de Raid',()=>{
  const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(source,/import \{mitigateRaidPetDamage,estimatedRaidPetHit\} from '\.\/raid-pet-mitigation\.js'/)
  assert.equal(source.split('mitigateRaidPetDamage(cfg.level,').length-1,1)
  assert.equal(source.split('estimatedRaidPetHit(cfg.level,cfg.atk)').length-1,3)
  assert.match(source,/petDamage=mitigateRaidPetDamage\(cfg\.level,Math\.max\(1,Math\.round\(cfg\.atk/)
})

function seededRandom(seed){
  return ()=>{
    seed=(Math.imul(1664525,seed)+1013904223)>>>0
    return seed/4294967296
  }
}

function simulate(level,reduced,seed,rounds=179){
  const atk=level===75?285:200
  const random=seededRandom(seed)
  let hp=3137,potions=0,cost=0,faints=0
  const potionsStock=[
    {item_id:'pocao_pet_suprema',quantity:999},
    {item_id:'pocao_pet_full',quantity:999}
  ]
  const expectedHit=reduced?estimatedRaidPetHit(level,atk):Math.ceil(atk*.60)
  for(let round=0;round<rounds;round++){
    const special=random()<.22
    const raw=Math.max(1,Math.round(atk*(.28+random()*.20)*(special?1.25:1)*(1-.125)))
    const damage=reduced?mitigateRaidPetDamage(level,raw):raw
    hp=Math.max(0,hp-damage)
    if(hp===0)faints++
    if(hp/3137<.35){
      const chosen=chooseEconomicPetPotion(potionsStock,3137-hp,{currentHp:hp,maxHp:3137,imminentDamage:expectedHit})
      if(!chosen)break
      hp=Math.min(3137,hp+chosen.heal)
      potions++
      cost+=chosen.price
    }
  }
  return {potions,cost,faints}
}

test('simulação de 179 rodadas reduz custos sem suprimir dano dos pets',()=>{
  for(const level of [70,75]){
    let baseline=0,adjusted=0,usesBefore=0,usesAfter=0
    for(let seed=1;seed<=300;seed++){
      const s=seed*97+level*100
      const before=simulate(level,false,s)
      const after=simulate(level,true,s)
      baseline+=before.cost
      adjusted+=after.cost
      usesBefore+=before.potions
      usesAfter+=after.potions
    }
    assert.ok(adjusted<baseline*.8,'economia insuficiente Lv.'+level)
    assert.ok(adjusted>baseline*.5,'mitigação excessiva Lv.'+level)
    assert.ok(usesAfter<usesBefore,'poções não diminuíram Lv.'+level)
  }
})
