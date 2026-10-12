import test from 'node:test'
import assert from 'node:assert/strict'
import {petPvpSpecialty} from '../src/neon/game-catalog.js'
import {runPvpCombat} from '../src/neon/pvp-combat.js'
const fighter=(name,petBonus=null,settings={})=>({
 name,hp:2000,maxHp:2000,atk:170,def:330,crit:.10,spd:100,
 classId:'paladin',classApplied:true,attackIndex:0,lastProcAttack:0,
 petBonus,petSpecies:petBonus?'fenix_celestial':null,petHealUses:0,...settings
})
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}

test('Fênix cura só abaixo de 70%, a cada quatro ataques, no máximo três vezes',()=>{
 const a=fighter('Paladino',petPvpSpecialty('fenix_celestial',49),{hp:900,atk:160,def:1000})
 const b=fighter('Berserker',null,{hp:50000,maxHp:50000,atk:1,def:1000})
 const log=runPvpCombat(a,b,lcg(17))
 const heals=log.filter(x=>x.petHeal)
 assert.equal(heals.length,3)
 assert.equal(a.petHealUses,3)
 assert.ok(heals.every(x=>x.heal>0&&x.heal<=Math.round(2000*a.petBonus.healPct)))
 assert.ok(a.hp<=a.maxHp)
})
test('Fênix com HP acima de 70% não cura',()=>{
 const a=fighter('Paladino',petPvpSpecialty('fenix_celestial',49),{def:1000})
 const b=fighter('Berserker',null,{hp:50000,maxHp:50000,atk:1,def:1000})
 assert.equal(runPvpCombat(a,b,lcg(20)).filter(x=>x.petHeal).length,0)
})
test('Pet nenhum: não cria curas nem esquivas',()=>{
 const a=fighter('Paladino')
 const b=fighter('Berserker',{dodge:0},{atk:180})
 const log=runPvpCombat(a,b,lcg(23))
 assert.equal(log.filter(x=>x.petHeal||x.dodged).length,0)
})
test('Esquiva do pet não recebe dano ao ativar',()=>{
 const a=fighter('Paladino',petPvpSpecialty('fenix_celestial',100),{spd:1})
 const b=fighter('Berserker',null,{spd:300,atk:200})
 const log=runPvpCombat(a,b,()=>0,1)
 const first=log.find(x=>!x.petHeal)
 assert.equal(first.to,'Paladino')
 assert.equal(first.dodged,true)
 assert.equal(first.dmg,0)
})
test('Sem cura após nocaute antes do primeiro turno',()=>{
 const a=fighter('Paladino',petPvpSpecialty('fenix_celestial',100),{hp:300,spd:1})
 const b=fighter('Berserker',null,{spd:300,atk:4000})
 const log=runPvpCombat(a,b,lcg(1))
 assert.equal(a.hp,0)
 assert.equal(log.filter(x=>x.petHeal).length,0)
})
test('Paladino x Berserker em 200 cenários: HP válido, eventos coerentes, sem mais de três curas',()=>{
 for(let seed=1;seed<=200;seed++){
  const a=fighter('Paladino',petPvpSpecialty('fenix_celestial',49),{hp:1600,spd:180,atk:434,def:404,maxHp:2063})
  const b=fighter('Berserker',petPvpSpecialty('leao_solar',100),{hp:1800,maxHp:2000,spd:175,atk:550,def:450,classId:'berserker'})
  const log=runPvpCombat(a,b,lcg(seed))
  assert.ok(a.hp>=0&&a.hp<=a.maxHp)
  assert.ok(b.hp>=0&&b.hp<=b.maxHp)
  assert.ok(a.petHealUses<=3&&b.petHealUses<=3)
  assert.ok(log.length<=43)
  assert.ok(log.filter(x=>x.petHeal).every(x=>x.heal>0&&x.hp>0))
 }
})
