import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {effectivePetAltar,assertV2PetAltarAccess,petSummonStartLevel,petDuplicateCash,petCombatExperience,petAdventureCash,effectiveExpeditionPlans,petExpeditionLimit,v2PetSacrifice} from '../src/neon/reboot-pet-economy.js'
const yes={enabled:true},no={enabled:false}
test('altar V2 tem custo progressivo e conserva 100% de chances e catálogo V1',()=>{
 const a={raidLevel:70,summonCost:100,pets:[{species:'lobo',chance:32},{species:'outro',chance:60},{species:'vital',chance:8}]}
 const b=effectivePetAltar(a,yes)
 assert.equal(b.summonCost,160)
 assert.equal(b.pets[2].chance,5)
 assert.equal(b.pets.reduce((n,p)=>n+p.chance,0),100)
 assert.equal(a.pets[2].chance,8)
 assert.equal(effectivePetAltar(a,no),a)
 assert.equal(petSummonStartLevel(70,yes),1)
 assert.equal(petSummonStartLevel(70,no),70)
})
test('altar requer vitória manual e nível; universais não furam a progressão',()=>{
 assert.throws(()=>assertV2PetAltarAccess(70,89,1,yes),/mínimo 90/)
 assert.throws(()=>assertV2PetAltarAccess(70,90,0,yes),/manualmente/)
 assert.equal(assertV2PetAltarAccess(70,90,1,yes),true)
 assert.throws(()=>assertV2PetAltarAccess(20,19,99,yes),/mínimo 20/)
 assert.equal(assertV2PetAltarAccess(70,1,0,no),true)
})
test('XP combate, aventura, expedições e sacrifício respeitam economia V2',()=>{
 assert.equal(petCombatExperience(2400,yes),840)
 assert.equal(petCombatExperience(2400,no),2400)
 assert.equal(petAdventureCash(18000,yes),1800)
 assert.equal(petDuplicateCash(80000,70,yes),1750)
 assert.equal(petDuplicateCash(80000,70,no),80000)
 assert.equal(petExpeditionLimit(yes),3)
 assert.equal(petExpeditionLimit(no),12)
 assert.deepEqual(effectiveExpeditionPlans(yes)[8],{xp:180,cash:1000})
 assert.deepEqual(effectiveExpeditionPlans(no)[8],{xp:330,cash:2500})
 assert.deepEqual(v2PetSacrifice({level:100,exp:800,cash:90000,originalPrice:180000,shopRefund:true},yes),{level:100,exp:100,cash:500,originalPrice:0,shopRefund:false})
})
test('invocação em lote e individual compartilham acesso, sem garantia pessoal na V2',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const tx=db.slice(db.indexOf('async function summonLegendaryPetTx'),db.indexOf('export async function summonLegendaryPet(jid'))
 assert.ok(tx.indexOf('assertV2PetAltarAccess')<tx.indexOf('UPDATE inventories'))
 assert.match(tx,/forcedRow=classesOnlyRebootEnabled\(\)\?null/)
 assert.match(tx,/scheduledRow=classesOnlyRebootEnabled\(\)\?null/)
 assert.match(tx,/specialGuaranteeEligible=!classesOnlyRebootEnabled\(\)/)
 assert.match(tx,/sphinxEligible=!classesOnlyRebootEnabled\(\)/)
 assert.match(tx,/startLevel=petSummonStartLevel/)
 assert.match(db,/\.map\(a=>effectivePetAltar\(a\)\)/)
 const g=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 assert.match(g,/rebootEconomyEnabled\(\)\?petCombatExperience\(baseGain\)/)
 assert.match(g,/lote\|\|rebootEconomyEnabled\(\)\?baseQty/)
})
