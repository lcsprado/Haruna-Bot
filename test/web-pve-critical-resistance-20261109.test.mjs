import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BOSS_CRIT_RESISTANCE,raidBossCritResistance,effectivePveCritChance} from '../src/neon/boss-crit-resistance.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const webApi=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')

test('Web e WhatsApp: Boss remove 15 pontos percentuais, sem antigo teto 45%',()=>{
 assert.equal(BOSS_CRIT_RESISTANCE,.15)
 assert.ok(Math.abs(effectivePveCritChance(.828,BOSS_CRIT_RESISTANCE)-.678)<1e-12)
 assert.equal(effectivePveCritChance(1.25,BOSS_CRIT_RESISTANCE),1)
 assert.equal(effectivePveCritChance(.10,BOSS_CRIT_RESISTANCE),0)
 assert.match(games,/effectivePveCritChance\(totalCritChance,BOSS_CRIT_RESISTANCE\)/)
 assert.match(games,/const crit=roll<effectiveCritChance/)
 assert.doesNotMatch(games,/totalCritChance=Math\.min\(\.45/)
})

test('Raids: resistencia progressiva preserva acesso de novos jogadores',()=>{
 for(const [level,expected] of [[10,0],[15,0],[20,0],[25,0],[30,0],[40,0],[50,.15],[60,.20],[65,.25],[70,.30],[75,.35]]){
  assert.equal(raidBossCritResistance(level),expected)
 }
 assert.equal(effectivePveCritChance(1.2,raidBossCritResistance(75)),.85)
 assert.ok(Math.abs(effectivePveCritChance(.828,raidBossCritResistance(65))-.578)<1e-12)
})

test('Ataque real de Raid usa chance pos-resistencia e nao o antigo limite 50%',()=>{
 assert.match(games,/effectivePveCritChance\(petCritChance\+gearCritChance,raidBossCritResistance\(s\.level\)\)/)
 assert.match(games,/petCritChance>0&&roll<Math\.min\(petCritChance,effectiveCritChance\)/)
 assert.match(games,/gearCrit=!petCrit&&gearCritChance>0&&roll<effectiveCritChance/)
 assert.doesNotMatch(games,/roll<Math\.min\(\.50,petCritChance\+gearCritChance\)/)
})

test('O catalogo de Raid expõe resistencia para a API sem mudar XP ou recompensas',()=>{
 assert.match(games,/critResistance:raidBossCritResistance\(r\.level\)/)
 assert.match(webApi,/getRaidCatalog\(/)
 assert.match(webApi,/case 'raid\.create'/)
 assert.match(webApi,/case 'boss\.attack'/)
 assert.match(webApi,/case 'raid\.round'/)
})

test('Pontos de resistencias e monotonicidade; taxa final limitada a 100%',()=>{
 for(let level of [10,40,50,60,65,70,75]){
  let resistance=raidBossCritResistance(level),last=-1
  for(let raw=0;raw<=1.6;raw+=.01){
   const effective=effectivePveCritChance(raw,resistance)
   assert.ok(effective>=last-1e-12)
   assert.ok(effective>=0&&effective<=1)
   last=effective
  }
 }
})
