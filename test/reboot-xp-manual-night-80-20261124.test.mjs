import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 V2_XP_NIGHT_RATE,V2_XP_DAY_RATE,v2HourlyXpRate,v2XpCredit,v2DailyXpStatus
} from '../src/neon/reboot-combat-progression.js'

const br=(day,hour)=>new Date(day+'T'+hour+'-03:00')
test('madrugada Brasilia 00:00–05:59 corresponde a 80%',()=>{
 assert.equal(V2_XP_NIGHT_RATE,0.8)
 assert.equal(V2_XP_DAY_RATE,1)
 for(const time of ['00:00:00','02:30:00','05:59:59'])assert.equal(v2HourlyXpRate(br('2026-11-25',time)),0.8)
 for(const time of ['06:00:00','12:00:00','23:59:59'])assert.equal(v2HourlyXpRate(br('2026-11-25',time)),1)
})
test('credito manual tem 80% exatos na madrugada sem mudar periodo diurno',()=>{
 const night=v2XpCredit(0,360,23,{now:br('2026-11-25','02:30:00')})
 assert.deepEqual([night.base,night.bonus,night.awarded,night.rate],[288,18,306,0.8])
 const day=v2XpCredit(0,360,23,{now:br('2026-11-25','06:00:00')})
 assert.deepEqual([day.base,day.bonus,day.awarded,day.rate],[360,23,383,1])
 assert.equal(v2DailyXpStatus(null,{now:br('2026-11-25','02:30:00')}).rate,0.8)
})
test('raid lote com skipNightRate nao sofre reducao noturna adicional',()=>{
 const lot=v2XpCredit(0,360,23,{now:br('2026-11-25','02:30:00'),skipNightRate:true})
 assert.deepEqual([lot.base,lot.bonus,lot.awarded,lot.rate],[360,23,383,1])
})
test('perfil apresenta mesma regra em todos os modos',()=>{
 const text=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.equal(text.split('00h–05h59: 80%').length-1,2)
 assert.equal(text.includes('00h–05h59: 70%'),false)
})
