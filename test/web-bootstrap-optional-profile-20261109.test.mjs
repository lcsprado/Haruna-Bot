import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {createOptionalBootstrapLoader} from '../src/neon/web-bootstrap-optional.js'

const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const begin=api.indexOf('async function playerBootstrap(session){')
const end=api.indexOf('async function playerExtras(session){',begin)
assert.ok(begin>=0&&end>begin)
const bootstrapSource=api.slice(begin,end)
const baseFuncs=['getProfile','getCombatProfile','getInventory','listPets','getPetTeam',
 'getPetExpeditions','getDailyMissions','getDailyStreak','getCareer','getHome',
 'getGarage','getMotorcycleGarage','getBusinesses','getPatrimony','getCltUberStatus',
 'getLoanOverview','listMyMarketListings','getAchievements','getRelationship',
 'getRelationshipProposals','groupSnapshot','getDoubleRewardEvent','getLuckyBoxEvent']

function fixture({broken=[],criticalBroken=[]}={}){
 const logs=[],calls=[],needed=new Set(criticalBroken),optionalBroken=new Set(broken)
 const ctx={
  createOptionalBootstrapLoader,now:()=>1234,PECADOS_HERO_IDS:['pecado_king'],
  petTeamSynergy:()=>null,excludeActiveHeroPet:x=>x,
  webPlayableHeroesSnapshot:async()=>({heroes:[],activeHeroCombat:null,activeHeroId:null}),
  db:{query:async(sql,params)=>{
   const category=String(sql).includes('FROM transactions t')?'recentTransactions':'dbOther'
   calls.push({name:category,params})
   if(optionalBroken.has(category))throw Object.assign(new Error('secret!'),{code:'DATABASE_DOWN'})
   return {rows:[]}
  }},
  console:{warn:(...args)=>logs.push(args)}
 }
 for(const name of baseFuncs){
  ctx[name]=async jid=>{
   calls.push({name,jid})
   if(needed.has(name)||optionalBroken.has(name))throw Object.assign(new Error('should not leak personal info'),{code:'FAIL_'+name.toUpperCase()})
   if(name==='getProfile')return {hp:1234,level:500,push_name:'Fixture'}
   if(name==='getCombatProfile')return {hp:1234,crit:0.6}
   if(name==='getInventory')return [{id:'weapon',quantity:1}]
   if(name==='listPets'||name==='getPetTeam')return [{species:'raposa_astral'},{species:'pecado_king'}]
   if(name==='getRelationshipProposals')return {incoming:[{id:1}],outgoing:[]}
   if(name==='groupSnapshot')return {linked:true}
   return ['getAchievements','getDailyMissions','getPetExpeditions'].includes(name)?[]:{value:name}
  }
 }
 const run=vm.runInNewContext(bootstrapSource+'\nplayerBootstrap',ctx)
 return {run,logs,calls}
}
test('falhas opcionais não derrubam perfil, inventário nem pets',async()=>{
 const f=fixture({broken:['getDailyMissions','getAchievements','recentTransactions']})
 const result=await f.run({jid:'fake-jid',chatJid:'fake-group',expiresAt:99999})
 assert.equal(result.profile.hp,1234)
 assert.equal(result.combatProfile.crit,0.6)
 assert.equal(result.inventory.length,1)
 assert.equal(result.pets.length,1)
 assert.equal(result.petTeam.length,1)
 assert.deepEqual([...result.unavailableSections].sort(),['achievements','dailyMissions','recentTransactions'])
 assert.equal(result.dailyMissions.length,0)
 assert.equal(result.recentTransactions.length,0)
 assert.equal(f.logs.length,3)
 assert.ok(f.logs.every(entry=>!JSON.stringify(entry).includes('fake-jid')))
 assert.ok(f.logs.every(entry=>!JSON.stringify(entry).includes('should not leak personal info')))
})
test('perfil, inventário e banco essenciais nunca são mascarados',async()=>{
 for(const critical of ['getProfile','getInventory','getLoanOverview','getCombatProfile','groupSnapshot']){
  const f=fixture({criticalBroken:[critical]})
  await assert.rejects(f.run({jid:'fake',chatJid:null}),/should not leak personal info/)
  assert.equal(f.logs.length,0,critical)
 }
})
test('todos os grupos essenciais permanecem fora de wrappers opcionais',()=>{
 for(const k of ['getLoanOverview','getProfile','getCombatProfile','getInventory','listPets','getPetTeam','groupSnapshot']){
  assert.ok(!bootstrapSource.includes("optional('"+k),k)
 }
})
test('carregamento normal preserva dados sem avisos',async()=>{
 const f=fixture()
 const data=await f.run({jid:'fake',chatJid:null})
 assert.equal(data.profile.hp,1234)
 assert.equal(data.group.linked,true)
 assert.equal(data.recentTransactions.length,0)
 assert.equal(data.unavailableSections.length,0)
 assert.equal(f.logs.length,0)
})
test('erros logam somente seção e código, sem mensagens sensíveis',async()=>{
 const logs=[],l=createOptionalBootstrapLoader(p=>logs.push(p))
 const v=await Promise.all([
  l.optional('streak',async()=>{throw Object.assign(new Error('secreto'),{code:'PGFAIL'})},null),
  l.optional('petExpeditions',async()=>[{id:1}],[]),
  l.optional('career',async()=>{throw new Error('secreto')},null)
 ])
 assert.equal(v[0],null);assert.equal(v[1][0].id,1);assert.equal(v[2],null)
 assert.deepEqual(l.unavailableSections,['streak','career'])
 assert.deepEqual(logs.map(x=>x.code),['PGFAIL','Error'])
 assert.ok(!JSON.stringify(logs).includes('secreto'))
})
