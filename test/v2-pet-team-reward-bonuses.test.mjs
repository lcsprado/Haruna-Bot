import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {petTeamRewardBonuses} from '../src/neon/pet-team-reward-bonuses.js'

const active={xp:.10,drop:.08}
const row=(slot,xp,drop,hp=100,energy=10)=>({slot,xp,drop,hp,energy})
const sum=(bonus,slot,rows)=>petTeamRewardBonuses(bonus,slot,rows,x=>x)
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10)
test('mixed styles: active 100%, support 50%, reserve 25%',()=>{
  const out=sum(active,1,[row(1,.10,.08),row(2,.06,.06),row(3,.04,.04)])
  near(out.xp,.14);near(out.drop,.12)
})
test('no double counting, KO or empty energy; reserve promoted to 100%',()=>{
  const out=sum(active,3,[row(1,.10,.08,0),row(2,.06,.06),row(2,.06,.06),row(3,.10,.08)])
  near(out.xp,.13);near(out.drop,.11)
  assert.deepEqual(sum(active,1,[row(2,.06,.06,100,0),row(3,.04,.04,0)]),active)
})
test('no active pet means zero reward bonuses; per-pet caps preserved',()=>{
  assert.deepEqual(sum(null,1,[row(2,.15,.15)]),{xp:0,drop:0})
  const out=sum({xp:.8,drop:.8},1,[row(2,.8,.8),row(3,.8,.8)])
  near(out.xp,.2625);near(out.drop,.2625)
})
test('reward snapshots are shared by manual raid, raidlote and boss; sempet is excluded',()=>{
  const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.ok(src.includes('p.petRewardBonus=p.usePet!==false&&p.pet?.roundActive'))
  assert.ok(src.includes('p.usePet===false?{xp:0,drop:0}:p.petRewardBonus'))
  assert.ok(src.includes('petDrop:pb.drop'))
  assert.ok(src.includes('raidLoteGearChance(boxChance)'))
  assert.ok(src.includes('v2Reward.xp*(1+Number(pb.xp||0))'))
  assert.ok(src.includes('if(commonV2){cash=commonV2.cash;exp=commonV2.xp}'))
  assert.ok(src.includes('v2Reward.exclusiveChance>0'))
  const web=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.ok(web.includes("case 'raid.round': return raidRound"))
  assert.ok(web.includes("case 'boss.attack': return attackBoss"))
})

test('all seven passives share the weights in the real squad function, combat caps remain',()=>{
  const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  const body=src.slice(src.indexOf('function squadCombatBonus('),src.indexOf('// Aplica HP temporário'))
  const combine=new Function('rebootEconomyEnabled','petBossBonus','petTeamRewardBonuses',body+';return squadCombatBonus')(()=>true,x=>x.bonus,petTeamRewardBonuses)
  const keys=['damage','defense','crit','dodge','hp','xp','drop']
  const values=v=>Object.fromEntries(keys.map(k=>[k,v]))
  const pet=(slot,v,hp=100,energy=10)=>({slot,hp,energy,bonus:values(v)})
  for(const [active,slot,team,expected] of [
    [values(.08),1,[pet(1,.08),pet(2,.06),pet(3,.04)],.12],
    [values(.08),3,[pet(1,.08,0),pet(2,.06),pet(3,.08)],.11],
    [values(.08),1,[pet(2,.06,100,0),pet(3,.04,0)],.08]
  ]){
    const result=combine(active,slot,team)
    for(const key of keys)near(result[key],expected)
  }
  const capped=combine(values(.3),1,[pet(2,.3),pet(3,.3)])
  near(capped.damage,.30);near(capped.defense,.25);near(capped.crit,.20);near(capped.dodge,.20);near(capped.hp,.30)
})
