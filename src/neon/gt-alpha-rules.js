// GT Alpha Bot — regras puras e testáveis de classificação.
// Reutiliza a física existente da Garagem Alpha, sem normalizar o tuning.
import {racingPower,racingTrack,racingModel,RACING_STRATEGIES} from './racing-rules.js'

export const GT_TRACK_IDS=Object.freeze(['reta','cidade','serra'])
export const GT_PLACE_POINTS=Object.freeze([10,7,5,3])
export const GT_WEEKLY_PRIZES=Object.freeze([15000000,8000000,5000000,1000000])
export const GT_MIN_DRIVERS=2
export const GT_DAILY_WEAR=9
export const GT_TIME='20:00'
export const GT_GROUP='120363429534634131@g.us'

const z=n=>String(n).padStart(2,'0')
const dateUtcString=date=>date.toISOString().slice(0,10)
export function gtBrazilDay(now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
 return parts.year+'-'+parts.month+'-'+parts.day
}
export function gtWeekStart(day){
 const dt=new Date(String(day)+'T12:00:00Z')
 if(Number.isNaN(dt.getTime()))throw Error('Dia inválido')
 const daysSinceMonday=(dt.getUTCDay()+6)%7
 dt.setUTCDate(dt.getUTCDate()-daysSinceMonday)
 return dateUtcString(dt)
}
export function gtWeekEnd(weekStart){
 const dt=new Date(String(weekStart)+'T12:00:00Z')
 dt.setUTCDate(dt.getUTCDate()+6)
 return dateUtcString(dt)
}
export function gtDayStartMs(day){return Date.parse(String(day)+'T20:00:00-03:00')}
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
function optimalStrategy(car,trackId){
 return RACING_STRATEGIES.map(strategy=>({id:strategy.id,power:racingPower(car,trackId,strategy.id)}))
  .sort((a,b)=>b.power-a.power||a.id.localeCompare(b.id))[0]
}
// participantes: exatamente o carro principal, já filtrado na consulta à garagem.
// A diferença de potência é preservada; apenas ±3% de variação da prova.
export function gtRunHeats(participants,random=Math.random){
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
 const heats=GT_TRACK_IDS.map(trackId=>{
  const track=racingTrack(trackId)
  const finish=participants.map(p=>{
   const best=optimalStrategy(p,trackId)
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
  return {id:trackId,name:track.name,positions}
 })
 return {heats,standings:gtLeaderboard([...board.values()])}
}
