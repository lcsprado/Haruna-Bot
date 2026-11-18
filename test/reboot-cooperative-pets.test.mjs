import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {activeCombatPetTeam} from '../src/neon/reboot-pet-team.js'
import {raidNecromancerCurse,recordRaidAuraProtection} from '../src/neon/raid-cooperative-roles.js'
import {raidV2MeaningfulContribution} from '../src/neon/reboot-economy-policy.js'
const active=(jid,classId)=>({jid,classId,hp:1000,maxHp:1000,alive:true,classApplied:true,awakeningStage:4})
test('Equipe ativa: desmaio, falta de energia, último turno e recuperação',()=>{
 const team=[1,2,3].map(slot=>({slot,species:'pet'+slot,hp:100,energy:10}))
 const exhausted={teamSlot:1,species:'pet1',hp:100,energy:0,roundActive:true}
 assert.equal(activeCombatPetTeam(team,[exhausted],{enabled:true}).length,2)
 assert.equal(activeCombatPetTeam(team,[exhausted],{enabled:true,lastEnergyActive:true}).length,3)
 assert.equal(activeCombatPetTeam(team,[{...exhausted,hp:0}],{enabled:true,lastEnergyActive:true}).length,2)
 assert.equal(activeCombatPetTeam(team,[{...exhausted,energy:5}],{enabled:true}).length,3)
 assert.equal(activeCombatPetTeam(team,[exhausted],{enabled:false}),team)
 assert.equal(activeCombatPetTeam(team.map(p=>({...p,energy:0})),[],{enabled:true}).length,0)
})
test('Maldição de 3% não acumula, não cria dano além do HP e não é contada 2x',()=>{
 const n=active('n','necromancer'),n2=active('n2','necromancer'),a=active('a','samurai')
 assert.deepEqual(raidNecromancerCurse([n,n2,a],a,1000,1010),{damage:1010,bonus:10,source:'n'})
 assert.equal(n.curseTeamDamage,10)
 assert.equal(n2.curseTeamDamage,undefined)
 assert.equal(raidNecromancerCurse([n,n2,a],n,1000,2000).bonus,0)
 assert.equal(raidNecromancerCurse([n,n2,a],a,1000,5).bonus,0)
})
test('Aura IV registra mitigação, não desloca HP nem conta esquiva/shield total',()=>{
 const p=active('p','paladin'),a=active('a','berserker')
 assert.equal(recordRaidAuraProtection(p,a,500,490,{damage:490}),10)
 assert.equal(p.hp,1000);assert.equal(a.hp,1000)
 assert.equal(recordRaidAuraProtection(p,a,500,490,{damage:0}),0)
 assert.equal(recordRaidAuraProtection(p,a,500,490,{dodged:true,damage:490}),0)
 p.awakeningStage=3
 assert.equal(recordRaidAuraProtection(p,a,500,490,{damage:490}),0)
 assert.equal(raidV2MeaningfulContribution({jid:'a',damage:0,alliedProtection:200},10000),true)
 assert.equal(raidV2MeaningfulContribution({jid:'a',damage:0,curseTeamDamage:199},10000),false)
})
test('Runtime cooperativo e sinergias usam snapshots e mantêm dano único',()=>{
 const g=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 assert.match(g,/rebootEconomyEnabled\(\)\?raidNecromancerCurse\(alive,p,baseRaidDamage,Number\(s.hp\)\)/)
 assert.match(g,/p\.damage=Number\(p.damage\|\|0\)\+\(rebootEconomyEnabled\(\)\?actualDamage:dmg\)/)
 assert.match(g,/recordRaidAuraProtection\(guardian,p,hitDamage,protectedDamage,passiveDefense\)/)
 assert.match(g,/activeCombatPetTeam\(p.teamPassives\|\|\[\],\[p.pet,p.reservePet\],\{lastEnergyActive:true\}\)/)
})
