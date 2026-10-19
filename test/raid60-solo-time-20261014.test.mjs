import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const duration=src.match(/const raidDurationMinutes=level=>\(\{([^}]+)\}/)
assert.ok(duration,'tabela de duração')
const pairs=Object.fromEntries(duration[1].split(',').map(p=>p.split(':').map(Number)))
const expected={10:12,15:15,20:18,25:22,30:25,40:30,50:35,60:40,65:45,70:50}

test('Durações das Raids seguem a progressão acordada',()=>{
 assert.deepEqual(pairs,expected)
 const levels=Object.keys(expected).map(Number).sort((a,b)=>a-b)
 for(let i=1;i<levels.length;i++){
  assert.ok(pairs[levels[i]]>pairs[levels[i-1]],'Tempo deve aumentar com o nível da Raid')
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
