const BASE='https://api.football-data.org/v4'
const cache=new Map()
async function api(path,params={},ttl=600000){
 const q=new URLSearchParams(params);const k=path+'?'+q;const old=cache.get(k);if(old&&old.exp>Date.now())return old.data
 const r=await fetch(BASE+path+(q.size?'?'+q:''),{headers:{'X-Auth-Token':process.env.FOOTBALL_DATA_KEY||''}})
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||('Football Data HTTP '+r.status))
 cache.set(k,{data:d,exp:Date.now()+ttl});return d
}
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function isoDay(off=0){const d=new Date(Date.now()+off*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
function tm(x){return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(x))}
function line(m){const done=['FINISHED','AWARDED'].includes(m.status),live=['IN_PLAY','PAUSED'].includes(m.status);const mid=done?((m.score?.fullTime?.home??'-')+' x '+(m.score?.fullTime?.away??'-')):live?('🔴 '+(m.score?.fullTime?.home??m.score?.halfTime?.home??0)+' x '+(m.score?.fullTime?.away??m.score?.halfTime?.away??0)):tm(m.utcDate);return '⚽ *'+m.homeTeam.name+'* '+mid+' *'+m.awayTeam.name+'*\n🏆 '+(m.competition?.name||'Competição')}
async function brasileirao(){return api('/competitions/BSA',{},86400000)}
export async function footballToday(off=0){await brasileirao();const date=isoDay(off);const d=await api('/competitions/BSA/matches',{dateFrom:date,dateTo:date},300000);return d.matches||[]}
export async function brazilStandings(){await brasileirao();const d=await api('/competitions/BSA/standings',{},1800000);return d.standings?.find(x=>x.type==='TOTAL')?.table||d.standings?.[0]?.table||[]}
export async function teamSummary(name){const comp=await brasileirao();const teams=await api('/competitions/BSA/teams',{},86400000);const hit=(teams.teams||[]).find(t=>norm(t.name).includes(norm(name))||norm(t.shortName).includes(norm(name))||norm(t.tla)===norm(name));if(!hit)throw new Error('Time não encontrado no Brasileirão.');const d=await api('/teams/'+hit.id+'/matches',{competitions:'BSA',limit:100},600000);const games=d.matches||[],now=Date.now();const past=games.filter(m=>new Date(m.utcDate).getTime()<now&&['FINISHED','AWARDED'].includes(m.status)).sort((a,b)=>new Date(b.utcDate)-new Date(a.utcDate));const future=games.filter(m=>new Date(m.utcDate).getTime()>=now&&!['FINISHED','AWARDED','CANCELLED'].includes(m.status)).sort((a,b)=>new Date(a.utcDate)-new Date(b.utcDate));return {team:hit,last:past[0],next:future[0],competition:comp}}
export function formatFixtures(a){if(!a.length)return 'Nenhum jogo do Brasileirão encontrado.';return a.slice(0,18).map(line).join('\n\n')}
export function formatTeamFixture(f){return f?line(f):'Nenhum encontrado.'}
