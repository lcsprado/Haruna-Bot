import test from 'node:test'
import assert from 'node:assert/strict'
import {raidDruidSupport,raidPaladinProtection,raidNecromancerCurse,raidRoleReport} from '../src/neon/raid-cooperative-roles.js'
const player=(id,classId,hp=1000)=>({jid:id,classId,hp,maxHp:2000,alive:true,classApplied:true,awakeningStage:5})
test('Druida cura aliado e registra contribuicao a cada oito rodadas',()=>{
 const a=player('d','druid'),b=player('a','warrior',500)
 assert.deepEqual(raidDruidSupport([a,b],7),[])
 const r=raidDruidSupport([a,b],8)
 assert.equal(r.length,1)
 assert.equal(r[0].healed,80)
 assert.equal(b.hp,580)
 assert.equal(a.alliedHealing,80)
})
test('Paladino protege aliado sem matar a si mesmo ou ultrapassar teto por rodada',()=>{
 const a=player('p','paladin',1000),b=player('a','assassin')
 let r=raidPaladinProtection([a,b],b,900)
 assert.equal(r.absorbed,160)
 assert.equal(r.damage,740)
 r=raidPaladinProtection([a,b],b,900)
 assert.equal(r.absorbed,0)
 assert.equal(a.hp,840)
 assert.equal(raidRoleReport(a).alliedProtection,160)
})
test('Dois Paladinos nao dobram a protecao no mesmo golpe',()=>{
 const p1=player('p1','paladin'),p2=player('p2','paladin'),b=player('b','mage')
 assert.equal(raidPaladinProtection([p1,p2,b],b,500).absorbed,90)
 assert.equal((p1.alliedProtection||0)+(p2.alliedProtection||0),90)
})
test('Necromante gera bonus de grupo apenas para outros jogadores, sem empilhar',()=>{
 const n=player('n','necromancer'),n2=player('n2','necromancer'),a=player('a','archer')
 assert.deepEqual(raidNecromancerCurse([n,n2,a],a,1000),{damage:1030,bonus:30,source:'n'})
 assert.equal(raidNecromancerCurse([n,n2,a],n,1000).bonus,0)
 assert.equal(raidRoleReport(n).curseTeamDamage,30)
 assert.equal(raidRoleReport(n2).curseTeamDamage,0)
})
test('Suporte inativo ou solo nao concede bonus',()=>{
 const a=player('d','druid'),b=player('p','paladin'),c=player('n','necromancer')
 assert.deepEqual(raidDruidSupport([a],8),[])
 b.alive=false;c.alive=false
 assert.equal(raidPaladinProtection([b],a,100).absorbed,0)
 assert.equal(raidNecromancerCurse([c,a],a,100).bonus,0)
})
