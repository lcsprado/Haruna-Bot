import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {restoreVitalPersistentHp} from '../src/neon/vital-pets.js'
import {classAttack} from '../src/neon/game-catalog.js'
const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const raid=source.slice(source.indexOf('export async function raidRound('))
const stageStart=raid.indexOf('if(rebootEconomyEnabled()&&!p.heroId&&healed>0){')
const stageEnd=raid.indexOf('\n        if(healed>0) p.classHealingActivations',stageStart)
const applyStart=raid.indexOf('if(!player.heroId){',raid.indexOf('// Finalização antes da fase defensiva'))
const applyEnd=raid.indexOf('\n        const settled=persistHeroHpDelta',applyStart)
assert.ok(stageStart>=0&&stageEnd>stageStart&&applyStart>=0&&applyEnd>applyStart)
const stage=new Function('rebootEconomyEnabled','restoreVitalPersistentHp','p','hpBefore','healed','classFinalRoundHealing',raid.slice(stageStart,stageEnd))
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
const apply=new AsyncFunction('rebootEconomyEnabled','c','classFinalRoundHealing','player','for(const once of [true]){'+raid.slice(applyStart,applyEnd)+'}')
test('V2 class healing on killing round persists only the projected healing delta',async()=>{
 const p={jid:'necro',classId:'necromancer',hp:300,maxHp:1200,heroPersistentMaxHp:1000}
 const prev=p.hp
 const hit=classAttack({classId:p.classId,damage:1000,hp:p.hp,maxHp:p.maxHp,context:'raid',attackIndex:4,awakeningStage:4})
 assert.ok(hit.heal>0)
 p.hp+=hit.heal
 const heals=new Map()
 stage(()=>true,restoreVitalPersistentHp,p,prev,hit.heal,heals)
 const delta=restoreVitalPersistentHp(p.hp,1200,1000)-restoreVitalPersistentHp(prev,1200,1000)
 assert.ok(delta>0)
 let hp=230,queries=0
 const client={query:async(sql,[max,amount,jid])=>{assert.match(sql,/hp>0 AND hp<\$1/);assert.equal(jid,'necro');assert.equal(amount,delta);queries++;if(hp>0&&hp<max)hp=Math.min(max,hp+amount)}}
 await apply(()=>true,client,heals,p)
 assert.equal(hp,230+delta)
 assert.equal(queries,1)
 hp=0
 await apply(()=>true,client,heals,p)
 assert.equal(hp,0)
 hp=999
 await apply(()=>true,client,heals,p)
 assert.equal(hp,1000)
 hp=1100
 await apply(()=>true,client,heals,p)
 assert.equal(hp,1100)
})
test('V1, non-healing attacks and collab heroes do not enter the class final round path',async()=>{
 const p={jid:'p',hp:300,maxHp:1200,heroPersistentMaxHp:1000}
 const heals=new Map()
 stage(()=>false,restoreVitalPersistentHp,p,250,50,heals)
 stage(()=>true,restoreVitalPersistentHp,p,300,0,heals)
 stage(()=>true,restoreVitalPersistentHp,{...p,heroId:'legacy'},250,50,heals)
 assert.equal(heals.size,0)
 const c={query:async()=>{throw Error('unexpected query')}}
 await apply(()=>true,c,heals,p)
 heals.set(p.jid,{delta:10,max:1000})
 await apply(()=>false,c,heals,p)
})
