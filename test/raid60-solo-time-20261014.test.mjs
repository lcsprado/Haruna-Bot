import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const duration=src.match(/const raidDurationMinutes=(level=>[^\n]+)/)
assert.ok(duration,'tabela de duração')
const expected={10:12,15:15,20:18,25:22,30:25,40:30,50:35,60:40,65:45,70:50,75:35}
const levels=Object.keys(expected).map(Number)
const table=enabled=>{
 const getDuration=new Function('rebootEconomyEnabled','return '+duration[1])(()=>enabled)
 return Object.fromEntries(levels.map(level=>[level,getDuration(level)]))
}
const pairs=table(false)

test('Durações preservam V1 e a Raid 50 V2 aprovada no PR #444',()=>{
 assert.deepEqual(pairs,expected)
 assert.deepEqual(table(true),{...expected,50:38})
 for(const mode of [false,true]){
  const actual=table(mode)
  for(let i=1;i<levels.length;i++){
   if(levels[i]===75)continue
   assert.ok(actual[levels[i]]>actual[levels[i-1]])
  }
 }
})

test('Raid 60 oferece 40 minutos e 300 rodadas de 8 segundos',()=>{
 assert.equal(pairs[60],40)
 assert.equal(pairs[60]*60/8,300)
})

test('Raids em andamento preservam seu tempo salvo no estado',()=>{
 assert.match(src,/s\.durationMinutes=raidDurationMinutes\(cfg.level\)/)
 assert.match(src,/const durationMs=Number\(s\.durationMinutes\|\|raidDurationMinutes\(cfg.level\)\)\*60\*1000/)
})

test('Boss Raid 60 mantém HP, ataque e recompensas; cadência não muda',()=>{
 assert.match(src,/level:60,name:'Titã do Caos',hp:410000,atk:135/)
 assert.match(src,/cashPool:440000,xpPool:14500,petXpPool:1450/)
 assert.match(src,/const raidCadenceMs=8000/)
 assert.match(src,/s\.activeElapsedMs=elapsedMs\+8000/)
})
