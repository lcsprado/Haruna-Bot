import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 GT_TRACK_IDS,GT_TIME,GT_GROUP,GT_WEEKLY_PRIZES,GT_MIN_DRIVERS,
 gtBrazilDay,gtWeekStart,gtWeekEnd,gtDayStartMs,gtDayIsSunday,
 gtPoints,gtLeaderboard,gtRunHeats,gtReplayWithEntrant,gtPartialStandings,gtRaceReward,
 GT_RACE_XP_PERCENTS,GT_RACE_CASH_PRIZES,GT_RACE_PILOT_XP
} from '../src/neon/gt-alpha-rules.js'

const source=path=>readFileSync(new URL('../src/neon/'+path,import.meta.url),'utf8')
const full=Object.fromEntries(['motor','cambio','pneus','suspensao','freios','turbo'].map(id=>[id,7]))
const player=(jid,modelId,upgrades={},condition=100)=>({
 jid,name:'Piloto '+jid,carId:Number(jid),modelId,upgrades,condition,driverLevel:20
})
test('!gttabela nao quebra antes da largada: dia inexistente ou anuncio sem stage',()=>{
 assert.deepEqual(gtPartialStandings(null),[])
 assert.deepEqual(gtPartialStandings(undefined),[])
 assert.deepEqual(gtPartialStandings({}),[])
 assert.deepEqual(gtPartialStandings({preparationNotice:Date.now()}),[])
 const twoHeats={results:{heats:[
  {positions:[{jid:'a',name:'A',place:1,points:10,score:80},{jid:'b',name:'B',place:2,points:7,score:75}]},
  {positions:[{jid:'b',name:'B',place:1,points:10,score:83},{jid:'a',name:'A',place:2,points:7,score:79}]},
 ]},stage:2,phase:'running'}
 const p=gtPartialStandings(twoHeats)
 assert.deepEqual(p.map(x=>[x.jid,x.points,x.wins]),[['a',17,1],['b',17,1]])
 assert.deepEqual(gtPartialStandings({...twoHeats,stage:0}),[])
 assert.equal(gtPartialStandings({...twoHeats,stage:1})[0].points,10)
 const src=source('gt-alpha-event.js')
 assert.match(src,/if\(!s\?\.phase\)\{/)
 assert.match(src,/ORDER BY key DESC LIMIT 1/)
 assert.match(src,/value->>'phase'='completed'/)
 assert.match(src,/ÚLTIMO RANKING DIÁRIO/)
 assert.match(src,/gtPartialStandings\(s\)/)
 assert.match(src,/\!gttabela semana/)
})

test('horario de 20h30 Brasil com etapa de domingo na inauguracao',()=>{
 assert.equal(GT_TIME,'20:30')
 assert.equal(gtDayStartMs('2026-11-15'),Date.parse('2026-11-15T20:30:00-03:00'))
 assert.equal(gtBrazilDay(Date.parse('2026-11-15T20:00:00-03:00')),'2026-11-15')
 assert.equal(gtWeekStart('2026-11-15'),'2026-11-15')
 assert.equal(gtWeekStart('2026-11-16'),'2026-11-15')
 assert.equal(gtWeekStart('2026-11-22'),'2026-11-15')
 assert.equal(gtWeekEnd('2026-11-15'),'2026-11-22')
 assert.equal(gtWeekStart('2026-11-23'),'2026-11-23')
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
test('XP do personagem e premios por prova seguem a colocacao com nivel congelado na largada',()=>{
 assert.deepEqual(GT_RACE_XP_PERCENTS,[60,50,40,35,30])
 assert.deepEqual(GT_RACE_CASH_PRIZES,[300000,200000,120000,70000,30000])
 assert.deepEqual(GT_RACE_PILOT_XP,[750,550,400,300,200])
 const expected=[
  {cash:300000,pilotXp:750,playerXp:30000,percent:60},
  {cash:200000,pilotXp:550,playerXp:25000,percent:50},
  {cash:120000,pilotXp:400,playerXp:20000,percent:40},
  {cash:70000,pilotXp:300,playerXp:17500,percent:35},
  {cash:30000,pilotXp:200,playerXp:15000,percent:30}
 ]
 for(let i=1;i<=6;i++)assert.deepEqual(gtRaceReward(i,500),expected[Math.min(i,5)-1])
 assert.deepEqual(gtRaceReward(1,700),{cash:300000,pilotXp:750,playerXp:42000,percent:60})
 assert.equal(gtRaceReward(1,500).playerXp*3,90000)
 assert.equal(gtRaceReward(2,500).playerXp+gtRaceReward(3,500).playerXp+gtRaceReward(4,500).playerXp,62500)
 assert.throws(()=>gtRaceReward(0,500),/inválido/)
 assert.throws(()=>gtRaceReward(1,null),/inválido/)
 assert.throws(()=>gtRaceReward(1,500.5),/inválido/)
})
test('premios do GT sao atomicos por prova; sem alterar semanal ou carros historicos',()=>{
 const src=source('gt-alpha-event.js')
 assert.match(src,/u\.level AS player_level/)
 assert.match(src,/playerLevel:Number\(r\.player_level\)/)
 assert.match(src,/playerLevel:p\.playerLevel/)
 assert.match(src,/const reward=gtRaceReward\(position\.place,participant\.playerLevel\)/)
 assert.match(src,/UPDATE racing_profiles_alpha SET xp=xp\+\$1/)
 assert.match(src,/UPDATE wallets SET cash=cash\+\$1,updated_at=\$2/)
 assert.match(src,/grantExpInTransaction\(c,position\.jid,reward\.playerXp/)
 assert.match(src,/ignoreXpBoost:true,ignoreGroupProgressionEvent:true/)
 assert.match(src,/gt_alpha_heat/)
 assert.match(src,/s\.stage\+\+;s\.nextAt/)
 assert.match(src,/position\.reward=\{\.\.\.reward/)
 assert.match(src,/if\(\['completed','cancelled'\]\.includes\(s\.phase\)\)return/)
 assert.match(src,/await c\.query\('COMMIT'\)/)
 assert.match(src,/await c\.query\('ROLLBACK'\)/)
 assert.match(src,/GT_WEEKLY_PRIZES\[i\]/)
 assert.ok(!src.includes('gt_alpha_heat_retroactive'))
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
 assert.match(src,/lastIdleSweep/)
 assert.match(src,/async function prepNotice/)
 assert.match(src,/start-20\*60000/)
 assert.match(src,/preparationNotice/)
 assert.match(src,/sunday<GT_FIRST_SEASON_END/)
 assert.match(src,/Date\.now\(\)<start\+10000/)
 assert.match(src,/Date\.now\(\)>start\+\(day==='2026-11-15'\?15:10\)\*60000/)
 assert.match(src,/!s\.phase/)
 assert.match(src,/Math\.max\(start\+30000,Date\.now\(\)\+30000\)/)
 assert.ok(!src.includes('user_cars'))
 assert.ok(!src.includes('clt_uber'))
})


test('carro em melhoria continua elegível e usa as peças já concluídas',()=>{
 const src=source('gt-alpha-event.js')
 assert.match(src,/rows\.filter\(r=>Number\(r\.condition\)>=RACING_MIN_CONDITION\)/)
 assert.doesNotMatch(src,/rows\.filter\(r=>!r\.pending_part/)
 assert.match(src,/melhoria em andamento não impede a corrida/)
})
test('correção da etapa preserva desempenho dos adversários e reapura quatro carros',()=>{
 const base=gtRunHeats([
  player('1','palio',{motor:5,turbo:5}),
  player('2','corsa',{motor:5,freios:3}),
  player('3','gol',{motor:1})
 ],()=>.5,'2026-11-16')
 const missing=player('4','gol',full,100)
 const rerun=gtReplayWithEntrant(base,missing,'2026-11-16')
 assert.equal(rerun.heats.length,3)
 for(let i=0;i<3;i++){
  assert.equal(rerun.heats[i].positions.length,4)
  assert.equal(rerun.heats[i].positions[0].jid,'4')
  for(const original of base.heats[i].positions){
   assert.equal(rerun.heats[i].positions.find(p=>p.jid===original.jid).score,original.score)
  }
  assert.deepEqual(rerun.heats[i].positions.map(p=>p.points),[10,7,5,3])
 }
 assert.equal(rerun.standings.find(p=>p.jid==='4')?.points,30)
 assert.equal(rerun.standings.reduce((total,p)=>total+p.points,0),75)
 assert.equal(base.heats[0].positions.length,3)
 assert.throws(()=>gtReplayWithEntrant(base,player('1','gol',full),'2026-11-16'),/já estava/)
})
test('reparação de 16-11 atômica, não duplica prêmios e preserva histórico',()=>{
 const src=source('gt-alpha-event.js')
 assert.match(src,/GT_ALPHA_REPLAY_20261116/)
 assert.match(src,/s\.correction\?\.id===mark/)
 assert.match(src,/originalResults:oldResults/)
 assert.match(src,/gtReplayWithEntrant\(oldResults,entrant,day\)/)
 assert.match(src,/GT_DAILY_WEAR\*3/)
 assert.match(src,/gt_alpha_rematch_adjustment/)
 assert.match(src,/gtSponsorProgressInTx\(c,/)
 assert.match(src,/grantExpInTransaction\(c,delta\.jid,delta\.playerXp/)
 assert.match(src,/AND cash\+\$1>=0/)
 assert.match(src,/AND exp\+\$1>=0/)
 assert.match(src,/await c\.query\('ROLLBACK'\)/)
})
