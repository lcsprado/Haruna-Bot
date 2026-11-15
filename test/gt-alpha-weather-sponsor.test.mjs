import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 GT_TRACK_IDS,GT_SPECIAL_TRACKS,GT_WEATHER_LABELS,gtTrackProgram,gtClimateMultiplier,
 gtRunHeats,gtWeekStart,gtWeekEnd
} from '../src/neon/gt-alpha-rules.js'
import {GT_SPONSORS,gtSponsorIncrement,gtSponsorDiscount} from '../src/neon/gt-alpha-sponsor-rules.js'

const source=path=>readFileSync(new URL('../src/neon/'+path,import.meta.url),'utf8')
const allUp=Object.fromEntries(['motor','cambio','pneus','suspensao','freios','turbo'].map(x=>[x,7]))
const driver=(jid,modelId,upgrades={})=>({jid,carId:Number(jid),modelId,upgrades,name:'Piloto '+jid,driverLevel:20,condition:100})

test('clima e pistas especiais sao previsiveis, 3 provas por dia, sem mudanca de carro',()=>{
 assert.deepEqual(GT_TRACK_IDS,['reta','cidade','serra'])
 assert.equal(GT_SPECIAL_TRACKS.length,3)
 assert.ok(GT_WEATHER_LABELS.chuva && GT_WEATHER_LABELS.neblina && GT_WEATHER_LABELS.poeira)
 const dailyPrograms=['2026-11-16','2026-11-17','2026-11-18','2026-11-19']
  .map(day=>gtTrackProgram(day))
 for(const program of dailyPrograms){
  assert.equal(program.length,3)
  assert.deepEqual(program.map(p=>p.baseId),GT_TRACK_IDS)
  assert.equal(new Set(program.map(p=>p.id)).size,3)
  assert.equal(program.filter(p=>p.weather!=='seco').length,1)
 }
 assert.deepEqual(gtTrackProgram('2026-11-17'),gtTrackProgram('2026-11-17'))
 assert.equal(new Set(dailyPrograms.map(a=>a.find(x=>x.weather!=='seco').id)).size,3)
 assert.throws(()=>gtTrackProgram('teste'),/inválida/)
})
test('pecas melhoradas criam vantagem real sob chuva, neblina e terra',()=>{
 const stock={upgrades:{}},prepared={upgrades:allUp}
 for(const weather of ['chuva','neblina','poeira']){
  assert.ok(gtClimateMultiplier(prepared,weather)>gtClimateMultiplier(stock,weather))
  assert.ok(gtClimateMultiplier(prepared,weather)<=1.06)
  assert.ok(gtClimateMultiplier(stock,weather)>=.9)
 }
 assert.equal(gtClimateMultiplier(stock,'seco'),1)
})
test('piloto preparado vence em clima especial sem vantagem inventada por sorte',()=>{
 for(const day of ['2026-11-16','2026-11-17','2026-11-18']){
  const result=gtRunHeats([driver('1','gol',allUp),driver('2','gol',{})],()=>.5,day)
  assert.equal(result.heats.length,3)
  assert.deepEqual(result.heats.map(h=>h.weather),gtTrackProgram(day).map(x=>x.weather))
  for(const heat of result.heats){
   assert.equal(heat.positions[0].jid,'1')
   assert.equal(heat.positions[0].points,10)
   assert.equal(heat.positions[1].points,7)
  }
  assert.equal(result.standings[0].points,30)
 }
 // Compatibilidade com chamadas antigas: três pistas secas convencionais.
 assert.ok(gtRunHeats([driver('1','gol'),driver('2','corsa')],()=>.5).heats.every(h=>h.weather==='seco'))
})
test('patrocinadores tem metas e premios economicos limitados',()=>{
 assert.deepEqual(GT_SPONSORS.map(x=>x.id),['oficina','pitstop','turbo'])
 assert.deepEqual(GT_SPONSORS.map(x=>x.goal),[3,3,2])
 assert.deepEqual(GT_SPONSORS.map(x=>x.cap),[200000,300000,500000])
 const heats=[
  {positions:[{jid:'1',place:1},{jid:'2',place:2},{jid:'3',place:3}]},
  {positions:[{jid:'2',place:1},{jid:'3',place:2},{jid:'1',place:3}]},
  {positions:[{jid:'1',place:1},{jid:'3',place:2},{jid:'2',place:3}]}
 ]
 assert.equal(gtSponsorIncrement('oficina',heats,'1'),1)
 assert.equal(gtSponsorIncrement('pitstop',heats,'1'),3)
 assert.equal(gtSponsorIncrement('turbo',heats,'1'),2)
 assert.equal(gtSponsorIncrement('turbo',heats,'3'),0)
 assert.equal(gtSponsorDiscount('oficina',300000),200000)
 assert.equal(gtSponsorDiscount('oficina',75000),75000)
 assert.equal(gtSponsorDiscount('pitstop',500000),150000)
 assert.equal(gtSponsorDiscount('pitstop',3000000),300000)
 assert.equal(gtSponsorDiscount('turbo',150000),0)
 assert.equal(gtSponsorDiscount('pitstop',-1),0)
})
test('patrocinio sem progresso retroativo, idempotente, um por semana e consumo unico',()=>{
 const sponsors=source('gt-alpha-sponsors.js')
 const race=source('racing-alpha.js')
 const event=source('gt-alpha-event.js')
 assert.match(sponsors,/PRIMARY KEY\(jid,week_start\)/)
 assert.match(sponsors,/ON CONFLICT\(jid,week_start\) DO NOTHING/)
 assert.match(sponsors,/row\.last_day===day/)
 assert.match(sponsors,/row\.created_at\)>Math\.floor\(Number\(startedAt/)
 assert.match(sponsors,/reward_used_at=0/)
 assert.match(sponsors,/FOR UPDATE/)
 assert.match(sponsors,/UPDATE wallets SET cash=cash\+\$1/)
 assert.match(sponsors,/gt_sponsor_reward/)
 assert.match(race,/await initGtSponsors\(\)/)
 assert.match(race,/gtSponsorCouponInTx\(c,jid,'repair'/)
 assert.match(race,/gtSponsorCouponInTx\(c,jid,'upgrade'/)
 assert.match(race,/const price=cost-coupon\.discount/)
 assert.match(race,/const cost=next\.price-coupon\.discount/)
 assert.match(event,/gtSponsorProgressInTx\(c,\{day,heats:s\.results\.heats,participants:s\.participants,startedAt:s\.startedAt\}\)/)
 assert.match(event,/gtRunHeats\(participants,Math\.random,day\)/)
 assert.match(event,/WHERE c\.equipped=TRUE ORDER BY c\.jid FOR UPDATE OF c/)
 assert.match(event,/gtclima/)
 assert.match(event,/gtpatrocinio/)
 assert.equal(gtWeekStart('2026-11-16'),'2026-11-15')
 assert.equal(gtWeekEnd('2026-11-15'),'2026-11-22')
})
