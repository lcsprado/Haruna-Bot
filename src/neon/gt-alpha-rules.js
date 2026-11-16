// GT Alpha Bot — regras puras e testáveis de classificação.
// Reutiliza a física existente da Garagem Alpha, sem normalizar o tuning.
import {racingPower,racingTrack,racingModel,RACING_STRATEGIES} from './racing-rules.js'

export const GT_TRACK_IDS=Object.freeze(['reta','cidade','serra'])
export const GT_SPECIAL_TRACKS=Object.freeze([
 {id:'neblina',name:'🌫️ Retão da Neblina',baseId:'reta',weather:'neblina'},
 {id:'neon',name:'🌧️ Circuito Neon Molhado',baseId:'cidade',weather:'chuva'},
 {id:'terra',name:'🏜️ Serra de Terra',baseId:'serra',weather:'poeira'}
])
export const GT_WEATHER_LABELS=Object.freeze({seco:'☀️ Pista seca',neblina:'🌫️ Neblina',chuva:'🌧️ Chuva',poeira:'🏜️ Poeira'})
// Programação do GT é pública e determinística, igual para todos. Nunca recalcula com RNG.
export function gtTrackProgram(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||'')))throw Error('Data do GT inválida')
 const date=Date.parse(day+'T12:00:00Z')
 if(!Number.isFinite(date))throw Error('Data do GT inválida')
 const turn=Math.floor(date/86400000)
 const selected=(turn%3+3)%3
 return GT_TRACK_IDS.map((baseId,i)=>{
  const base=racingTrack(baseId)
  return i===selected?{...GT_SPECIAL_TRACKS[i]}:{id:baseId,name:base.name,baseId,weather:'seco'}
 })
}
export function gtClimateMultiplier(car,weather='seco'){
 const p=car?.upgrades||{}
 const part=id=>Math.max(0,Math.min(7,Number(p[id])||0))/7
 switch(weather){
  case 'chuva':return .92+.06*part('pneus')+.04*part('freios')+.02*part('suspensao')
  case 'neblina':return .94+.05*part('freios')+.03*part('suspensao')
  case 'poeira':return .92+.07*part('pneus')+.05*part('suspensao')
  default:return 1
 }
}
export const GT_PLACE_POINTS=Object.freeze([10,7,5,3])
export const GT_WEEKLY_PRIZES=Object.freeze([15000000,8000000,5000000,1000000])
// Posição da prova (não ranking diário/semanal): XP do personagem escala
// com o nível fixado no momento da largada, mesmo que suba durante a etapa.
export const GT_RACE_XP_PERCENTS=Object.freeze([60,50,40,35,30])
export const GT_RACE_CASH_PRIZES=Object.freeze([300000,200000,120000,70000,30000])
export const GT_RACE_PILOT_XP=Object.freeze([750,550,400,300,200])
export function gtRaceReward(place,startingLevel){
 const rank=Number(place)
 const lv=Number(startingLevel)
 if(!Number.isSafeInteger(rank)||rank<1||!Number.isSafeInteger(lv)||lv<1)throw Error('Colocação ou nível inicial inválido para XP do GT')
 const idx=Math.min(rank,5)-1
 const need=Math.max(100,lv*100)
 const playerXp=Math.floor(need*GT_RACE_XP_PERCENTS[idx]/100)
 if(!Number.isSafeInteger(playerXp))throw Error('XP fora do limite')
 return {cash:GT_RACE_CASH_PRIZES[idx],pilotXp:GT_RACE_PILOT_XP[idx],playerXp,percent:GT_RACE_XP_PERCENTS[idx]}
}
export const GT_MIN_DRIVERS=2
export const GT_DAILY_WEAR=9
export const GT_TIME='20:30'
export const GT_GROUP='120363429534634131@g.us'

const dateUtcString=date=>date.toISOString().slice(0,10)
export function gtBrazilDay(now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
 return parts.year+'-'+parts.month+'-'+parts.day
}
export const GT_FIRST_SEASON_START='2026-11-15'
export const GT_FIRST_SEASON_END='2026-11-22'
export function gtWeekStart(day){
 // Estreia no domingo 15/11; a primeira temporada acumula até domingo 22/11.
 if(day>=GT_FIRST_SEASON_START&&day<=GT_FIRST_SEASON_END)return GT_FIRST_SEASON_START
 const dt=new Date(String(day)+'T12:00:00Z')
 if(Number.isNaN(dt.getTime()))throw Error('Dia inválido')
 const daysSinceMonday=(dt.getUTCDay()+6)%7
 dt.setUTCDate(dt.getUTCDate()-daysSinceMonday)
 return dateUtcString(dt)
}
export function gtWeekEnd(weekStart){
 if(weekStart===GT_FIRST_SEASON_START)return GT_FIRST_SEASON_END
 const dt=new Date(String(weekStart)+'T12:00:00Z')
 dt.setUTCDate(dt.getUTCDate()+6)
 return dateUtcString(dt)
}
export function gtDayStartMs(day){return Date.parse(String(day)+'T20:30:00-03:00')}
export function gtDayIsSunday(day){return new Date(String(day)+'T12:00:00Z').getUTCDay()===0}
export function gtPoints(position){return GT_PLACE_POINTS[position]??1}
export function gtCleanName(name){
 return String(name||'Piloto').replace(/[\r\n*_~]/g,' ').replace(/\s+/g,' ').trim().slice(0,42)||'Piloto'
}
export function gtFormatCash(amount){return 'R$ '+Number(amount||0).toLocaleString('pt-BR')}
const rounded=n=>Math.round(Number(n)*100)/100
export function gtLeaderboard(entries){
 return [...entries].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.performance-a.performance||String(a.jid).localeCompare(String(b.jid)))
}
// A etapa do dia ainda não existe antes da largada. Null precisa
// resultar em classificação vazia (e não gerar erro no !gttabela).
export function gtPartialStandings(s){
 const table=new Map()
 const stage=Math.max(0,Math.min(3,Number(s?.stage)||0))
 for(const heat of (s?.results?.heats||[]).slice(0,stage)){
  for(const p of (heat?.positions||[])){
   const row=table.get(p.jid)||{jid:p.jid,name:p.name,points:0,wins:0,performance:0}
   row.points+=Number(p.points||0)
   row.wins+=p.place===1?1:0
   row.performance+=Number(p.score||0)
   table.set(p.jid,row)
  }
 }
 return gtLeaderboard([...table.values()])
}
function optimalStrategy(car,trackId,weather='seco'){
 return RACING_STRATEGIES.map(strategy=>({id:strategy.id,power:racingPower(car,trackId,strategy.id)*gtClimateMultiplier(car,weather)}))
  .sort((a,b)=>b.power-a.power||a.id.localeCompare(b.id))[0]
}
// participantes: exatamente o carro principal, já filtrado na consulta à garagem.
// A diferença de potência é preservada; apenas ±3% de variação da prova.
export function gtRunHeats(participants,random=Math.random,day=null){
 const unique=new Set()
 for(const p of participants){
  if(!p.jid || unique.has(p.jid))throw Error('Participante duplicado/sem identificação')
  if(!racingModel(p.modelId))throw Error('Modelo da garagem inválido')
  unique.add(p.jid)
 }
 const board=new Map(participants.map(p=>[p.jid,{
  jid:p.jid,name:gtCleanName(p.name),model:racingModel(p.modelId).name,
  carId:p.carId,points:0,wins:0,performance:0
 }]))
 const program=day?gtTrackProgram(day):GT_TRACK_IDS.map(baseId=>({
  id:baseId,name:racingTrack(baseId).name,baseId,weather:'seco'
 }))
 const heats=program.map(track=>{
  const finish=participants.map(p=>{
   const best=optimalStrategy(p,track.baseId,track.weather)
   const luck=.97+Math.max(0,Math.min(1,Number(random())||0))*.06
   return {jid:p.jid,name:gtCleanName(p.name),model:racingModel(p.modelId).name,
    carId:p.carId,strategy:best.id,score:rounded(best.power*luck)}
  }).sort((a,b)=>b.score-a.score||String(a.jid).localeCompare(String(b.jid)))
  const positions=finish.map((r,position)=>{
   const pts=gtPoints(position),b=board.get(r.jid)
   b.points+=pts
   if(position===0)b.wins++
   b.performance=rounded(b.performance+r.score)
   return {...r,place:position+1,points:pts}
  })
  return {id:track.id,baseId:track.baseId,weather:track.weather,name:track.name,positions}
 })
 return {heats,standings:gtLeaderboard([...board.values()])}
}
