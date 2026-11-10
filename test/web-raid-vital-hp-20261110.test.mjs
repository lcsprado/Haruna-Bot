import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {petCombatSpecialty} from '../src/neon/game-catalog.js'
import {applyVitalCombatHp,restoreVitalPersistentHp,vitalPulseHeal} from '../src/neon/vital-pets.js'
import {persistHeroHpDelta} from '../src/neon/playable-heroes-core.js'
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const start=games.indexOf('function petBossBonus(pet){')
const end=games.indexOf('export function profileCombatPetBonuses',start)
assert.ok(start>0&&end>start)
const region=games.slice(start,end)
const {petBossBonus,squadCombatBonus,vitalRaidOpening}=new Function('petCombatSpecialty','applyVitalCombatHp',
 region+'\nreturn {petBossBonus,squadCombatBonus,vitalRaidOpening}')(petCombatSpecialty,applyVitalCombatHp)

test('AB-01 Vital: suporte e reserva recebem pesos e HP permanece temporário',()=>{
 const pet={species:'quimera_rubra',level:100,teamSlot:1,hp:100,energy:10}
 const team=[
  {species:'quimera_rubra',slot:1,level:100,hp:100,energy:10},
  {species:'serafim_vida_abissal',slot:2,level:100,hp:100,energy:10},
  {species:'cervo_aurora_viva',slot:3,level:100,hp:100,energy:10}
 ]
 const bonus=squadCombatBonus(petBossBonus(pet),1,team)
 assert.ok(bonus.hp>.12)
 assert.ok(bonus.hp<=.30)
 const sheet={jid:'player',hp:500,maxHp:1000,pet,teamPassives:team,
  teamSynergy:{hp:.08,vitalPulse:.05},heroId:null}
 const output=vitalRaidOpening(sheet)
 const expected=applyVitalCombatHp(500,1000,bonus.hp,.08)
 assert.equal(output.hp,expected.hp)
 assert.equal(output.maxHp,expected.maxHp)
 assert.ok(Math.abs(output.hp/output.maxHp-.5)<.001)
 assert.equal(restoreVitalPersistentHp(output.hp,output.maxHp,1000),500)
 assert.equal(output.vitalPulseUsed,false)
 assert.ok(output.vitalHpRate<=.32)
})
test('AB-01 Vital: HP adicional nunca entra como cura permanente do herói',()=>{
 const p={jid:'hero',heroId:'pecado_diane',hp:500,maxHp:1000,
  heroStoredHp:500,heroLastHp:500,heroPersistentMaxHp:1000,
  pet:null,teamPassives:[],teamSynergy:{hp:.08,vitalPulse:.05}}
 vitalRaidOpening(p)
 assert.ok(p.hp>500)
 assert.equal(p.heroLastHp,p.hp)
 const settled=persistHeroHpDelta({
  previousPersistentHp:p.heroStoredHp,previousCombatHp:p.heroLastHp,
  currentCombatHp:p.hp,combatMaxHp:p.maxHp,persistentMaxHp:p.heroPersistentMaxHp,
  remainder:0
 })
 assert.equal(settled.hp,500,'bônus de 8% não pode adicionar HP na ficha')
})
test('AB-01 Vital: pulso só ativa vivo, sob 35%, uma vez por combate',()=>{
 const once=vitalPulseHeal(340,1000,false,.05)
 assert.equal(once.used,true)
 assert.equal(once.heal,50)
 const second=vitalPulseHeal(once.hp,1000,true,.05)
 assert.equal(second.heal,0)
 assert.equal(vitalPulseHeal(0,1000,false,.05).heal,0)
 assert.equal(vitalPulseHeal(360,1000,false,.05).heal,0)
})
test('AB-01: iniciador e entrada tardia ganham projeção uma vez, nunca cada round',()=>{
 assert.equal((games.match(/vitalRaidOpening\(s\.players\[jid\]\)/g)||[]).length,2)
 const raidRound=games.split('export async function raidRound(')[1]
 assert.ok(raidRound)
 assert.doesNotMatch(raidRound,/vitalRaidOpening\(/)
 assert.match(raidRound,/Object\.hasOwn\(p,'vitalHpRate'\)/)
 assert.match(raidRound,/vitalPulseHeal\(p\.hp,p\.maxHp,p\.vitalPulseUsed/)
 assert.match(raidRound,/restoreVitalPersistentHp\(p\.hp,p\.maxHp,p\.persistentMaxHp\)/)
 assert.match(raidRound,/restoreVitalPersistentHp\(participant\.hp,participant\.maxHp,participant\.persistentMaxHp\)/)
 assert.equal((games.match(/persistentMaxHp:Number\(st\.max_hp\)\+gearHp/g)||[]).length,2)
})
test('AB-01: dados antigos de Raid permanecem na escala antiga sem pulso automático novo',()=>{
 const raidRound=games.split('export async function raidRound(')[1]
 assert.match(raidRound,/const heart=Object\.hasOwn\(p,'vitalHpRate'\)/)
 assert.match(raidRound,/:null\s+if\(heart\?\.used/)
 assert.match(raidRound,/const storedHp=p\.heroId\?settleRaidHeroHp\(p\)/)
})
