import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const begin=source.indexOf('export async function startRaid(')
const end=source.indexOf('async function finishRaidRewards(',begin)
assert.ok(begin>=0&&end>begin,'Raids: cannot find startRaid')
const body=source.slice(begin,end)
const at={
 hero:body.indexOf('const raidHero=await readRaidActiveHero('),
 awakening:body.indexOf('const awakeningStage=raidHero?0:'),
 team:body.indexOf('const teamPets=(await c.query('),
 exclude:body.indexOf('const heroPets=raidHeroPetSnapshot('),
 synergy:body.indexOf('const teamSynergy=petTeamSynergy(teamPassives)')
}

test('AB-01: startRaid initializes hero before reading Awakening stage',()=>{
 assert.ok(at.hero>=0&&at.awakening>at.hero,'TDZ: Raid start accesses uninitialized raidHero')
 assert.match(body,/const classStats=raidHero\?null:classCombatStats/)
 assert.match(body,/const awakeningStage=raidHero\?0:Number\(awakeningRows\.find/)
})
test('AB-01: initial synergy excludes the active playable hero pet',()=>{
 assert.ok(at.team>=0&&at.exclude>at.team&&at.synergy>at.exclude)
 assert.match(body,/const teamPassives=heroPets\.team/)
 assert.doesNotMatch(body,/const teamSynergy=petTeamSynergy\(teamPets\)/)
 assert.match(body,/teamSynergy,teamPassives/)
})
test('AB-01: executes actual initialization statements for hero and class without TDZ',async()=>{
 const lines=body.split('\n')
 const heroLine=lines.find(x=>x.includes('const raidHero=await readRaidActiveHero('))
 const classLine=lines.find(x=>x.includes('const classStats=raidHero?'))
 const awakeningLine=lines.find(x=>x.includes('const awakeningStage=raidHero?'))
 assert.ok(heroLine&&classLine&&awakeningLine)
 const execution=heroLine.replace('readRaidActiveHero(c,jid,st,heroGearHp)','Promise.resolve(raidHeroValue)')+
    '\n'+classLine+'\n'+awakeningLine
 const mock=new Function('classCombatStats',
  'return async function(raidHeroValue){'+
  'const c={},jid="player",st={class_id:"samurai",class_level:100,class_applied:true},heroGearHp=0,awakeningRows=[{jid:"player",stage:5}];'+
   execution+';return {heroId:raidHero?.heroId||null,classApplied:Boolean(classStats),awakeningStage};}'
 )( ()=>({maxHp:123}) )
 assert.deepEqual(await mock({heroId:'pecado_ban'}),{heroId:'pecado_ban',classApplied:false,awakeningStage:0})
 assert.deepEqual(await mock(null),{heroId:null,classApplied:true,awakeningStage:5})
})
test('AB-01: executes actual synergy line using filtered pet list',()=>{
 const lines=body.split('\n')
 const snippet=lines.filter(x=>/const heroPets=raidHeroPetSnapshot|combatPet=heroPets\.primary|const teamPassives=heroPets\.team|const teamSynergy=petTeamSynergy/.test(x)).join('\n')
 const code='(function(){'+
   'let combatPet={species:"pecado_ban"},reservePet=null;'+
   'const raidHero={heroId:"pecado_ban"};'+
   'const teamPets=[{species:"pecado_ban"},{species:"dragao_solar"}];'+
   'const raidHeroPetSnapshot=(hero,main,reserve,team)=>({primary:null,reserve,team:team.filter(p=>p.species!==hero.heroId)});'+
   'const petTeamSynergy=team=>({count:team.length});'+
   snippet+';return {teamPassives,teamSynergy};})()'
 const result=vm.runInNewContext(code)
 assert.equal(result.teamSynergy.count,1)
 assert.equal(result.teamPassives[0].species,'dragao_solar')
})
