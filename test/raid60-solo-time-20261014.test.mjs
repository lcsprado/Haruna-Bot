import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const duration=src.match(/const raidDurationMinutes=level=>\(\(\{([^}]+)\}/)
assert.ok(duration,'tabela de duração')
const pairs=Object.fromEntries(duration[1].split(',').map(p=>p.split(':').map(Number)))
test('Raid 60 permite até 40 minutos com 300 rodadas de 8s',()=>{
 assert.equal(pairs[60],40)
 assert.equal(pairs[60]*60/8,300)
})
test('Duração das outras raids permanece inalterada',()=>{
 assert.deepEqual(pairs,{10:12,15:15,20:18,25:22,30:30,40:40,50:50,60:40,65:25,70:30})
})
test('Boss Raid 60 mantém HP, ataque e recompensas',()=>{
 assert.match(src,/level:60,name:'Titã do Caos',hp:410000,atk:135/)
 assert.match(src,/cashPool:440000,xpPool:14500,petXpPool:1450/)
 assert.match(src,/const raidCadenceMs=8000/)
 assert.match(src,/s\.activeElapsedMs=elapsedMs\+8000/)
})
