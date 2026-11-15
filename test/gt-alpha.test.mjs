import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 GT_TRACK_IDS,GT_TIME,GT_GROUP,GT_WEEKLY_PRIZES,GT_MIN_DRIVERS,
 gtBrazilDay,gtWeekStart,gtWeekEnd,gtDayStartMs,gtDayIsSunday,
 gtPoints,gtLeaderboard,gtRunHeats
} from '../src/neon/gt-alpha-rules.js'

const source=path=>readFileSync(new URL('../src/neon/'+path,import.meta.url),'utf8')
const full=Object.fromEntries(['motor','cambio','pneus','suspensao','freios','turbo'].map(id=>[id,7]))
const player=(jid,modelId,upgrades={},condition=100)=>({
 jid,name:'Piloto '+jid,carId:Number(jid),modelId,upgrades,condition,driverLevel:20
})
test('horario de 20h30 Brasil com etapa de domingo na inauguracao',()=>{
 assert.equal(GT_TIME,'20:30')
 assert.equal(gtDayStartMs('2026-11-15'),Date.parse('2026-11-15T20:30:00-03:00'))
 assert.equal(gtBrazilDay(Date.parse('2026-11-15T20:00:00-03:00')),'2026-11-15')
 assert.equal(gtWeekStart('2026-11-15'),'2026-11-09')
 assert.equal(gtWeekEnd('2026-11-09'),'2026-11-15')
 assert.ok(gtDayIsSunday('2026-11-15'))
 assert.equal(GT_GROUP,'120363429534634131@g.us')
})
test('tres pistas, pontos por colocacao e prêmios acordados',()=>{
 assert.deepEqual(GT_TRACK_IDS,['reta','cidade','serra'])
 assert.deepEqual([0,1,2,3,4].map(gtPoints),[10,7,5,3,1])
 assert.deepEqual(GT_WEEKLY_PRIZES,[15000000,8000000,5000000,1000000])
 assert.equal(GT_MIN_DRIVERS,2)
})
test('upgrade completo vence carros sem preparação em todas pistas',()=>{
 const result=gtRunHeats([
  player('1','gol',full),
  player('2','corsa',{}),
  player('3','palio',{})
 ],()=>.5)
 assert.equal(result.heats.length,3)
 for(const heat of result.heats){
  assert.equal(heat.positions.length,3)
  assert.equal(heat.positions[0].jid,'1')
  assert.deepEqual(heat.positions.map(x=>x.points).sort((a,b)=>b-a),[10,7,5])
 }
 assert.equal(result.standings[0].jid,'1')
 assert.equal(result.standings[0].points,30)
})
test('trava identificação única e empate deterministico',()=>{
 assert.throws(()=>gtRunHeats([player('1','gol'),player('1','corsa')]),/duplicado/)
 assert.throws(()=>gtRunHeats([player('1','invalid')]),/Modelo/)
 const arr=[{jid:'z',points:9,wins:1,performance:20},{jid:'a',points:9,wins:2,performance:1}]
 assert.equal(gtLeaderboard(arr)[0].jid,'a')
})
test('motor isolado e seguro contra troca de carro depois da largada',()=>{
 const src=source('gt-alpha-event.js')
 assert.match(src,/WHERE c\.equipped=TRUE ORDER BY c\.jid FOR UPDATE OF c/)
 assert.match(src,/s\.participants=participants\.map/)
 assert.match(src,/WHERE id=\$3 AND jid=\$4/)
 assert.match(src,/if\(s\.phase==='completed'\)return/)
 assert.match(src,/UPDATE wallets SET cash=cash\+\$1/)
 assert.match(src,/INSERT INTO transactions/)
 assert.match(src,/ON CONFLICT\(key\) DO UPDATE/)
 assert.match(src,/WhatsApp sem confirmação de mensagem/)
 assert.match(src,/if\(busy\)return/)
 assert.ok(!src.includes('user_cars'))
 assert.ok(!src.includes('clt_uber'))
})
