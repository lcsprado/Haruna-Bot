import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {siegeV6ActivePlayers,siegeV6NextTurns,siegeV6RosterValid} from '../src/neon/clan-siege-v6-roster.js'
import {analyzeSiegeEligibility} from '../src/neon/clan-siege.js'
import {grantSiegeWeeklyXp} from '../src/neon/clan-siege-weekly-xp.js'

const source=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8')
const xpSource=readFileSync(new URL('../src/neon/clan-siege-weekly-xp.js',import.meta.url),'utf8')
test('V6: 2-6 jogadores por clã têm exatamente 2 ações por rodada e pelo menos 2 turnos em 6 rodadas',()=>{
 for(let n=2;n<=6;n++){
  const roster=Array.from({length:n},(_,i)=>'player-'+i)
  const frequencies=Object.fromEntries(roster.map(id=>[id,0]))
  for(let round=1;round<=6;round++){
   const picked=siegeV6ActivePlayers(roster,round)
   assert.equal(picked.length,2)
   assert.equal(new Set(picked).size,2)
   for(const id of picked)frequencies[id]++
  }
  assert.equal(Object.values(frequencies).reduce((a,b)=>a+b),12)
  assert.ok(Object.values(frequencies).every(x=>x>=2),JSON.stringify({n,frequencies}))
  for(const jid of roster)assert.equal(siegeV6NextTurns(roster,1,jid).length,frequencies[jid])
 }
})
test('V6: ordem de entrada não altera alocação; rejeita duplicados, rodadas e elenco inválidos',()=>{
 const one=siegeV6ActivePlayers(['z','y','x'],2)
 const two=siegeV6ActivePlayers(['y','x','z'],2)
 assert.deepEqual(one,two)
 for(const people of [[],['a'],['a','a'],['a','','b'],['a','b','c','d','e','f','g']]){
  assert.throws(()=>siegeV6ActivePlayers(people,1),/elenco/)
 }
 for(const round of [0,7,1.5,NaN])assert.throws(()=>siegeV6ActivePlayers(['a','b'],round),/rodada/)
})
test('V6: valida exatamente dois clãs com 2-6 jogadores distintos, sem clãs externos',()=>{
 const rows=[...Array.from({length:3},(_,i)=>({jid:'blue-'+i,clan_id:10})),
  ...Array.from({length:5},(_,i)=>({jid:'red-'+i,clan_id:20}))]
 assert.equal(siegeV6RosterValid(rows,10,20),true)
 assert.equal(siegeV6RosterValid([...rows,rows[0]],10,20),false)
 assert.equal(siegeV6RosterValid([...rows,{jid:'other',clan_id:30}],10,20),false)
 assert.equal(siegeV6RosterValid(rows.slice(0,3),10,20),false)
 assert.equal(siegeV6RosterValid(rows,10,10),false)
})
test('Preflight: não altera o legado 2+2 sem toggle; com expansão aceita 3+5 e verifica autorização integral',()=>{
 const teams=[{id:10,name:'Azul',members:3,linked:3,jids:['a','b','c']},
 {id:20,name:'Vermelho',members:5,linked:5,jids:['d','e','f','g','h']}]
 const allowed=new Set(teams.flatMap(x=>x.jids))
 assert.equal(analyzeSiegeEligibility(teams,allowed).ready,false)
 const expanded=analyzeSiegeEligibility(teams,allowed,{expanded:true})
 assert.equal(expanded.ready,true)
 assert.equal(expanded.linkedPlayers,8)
 assert.equal(expanded.authorizedPlayers,8)
 assert.equal(JSON.stringify(expanded).includes('"a"'),false,'privacidade preservada')
 assert.equal(analyzeSiegeEligibility(teams,new Set([...allowed].filter(x=>x!=='d')),{expanded:true}).ready,false)
 assert.equal(analyzeSiegeEligibility([{...teams[0],linked:2},teams[1]],allowed,{expanded:true}).ready,false)
 assert.equal(analyzeSiegeEligibility([...teams,{id:30,name:'Third',members:2,linked:2,jids:['i','j']}],new Set([...allowed,'i','j']),{expanded:true}).ready,false)
})
const match=(rules_version=6)=>({
 id:121,rules_version,status:'completed',created_by:'system:siege-daily-20h',
 created_at:Date.parse('2026-11-14T21:30:00-03:00'),
 blue_clan_id:10,red_clan_id:20,winner_clan_id:10
})
test('Premiação V6 aceita 3+5 sem pagar inativos; V5 preserva bloqueio de elenco não 2+2',async()=>{
 const roster=[...Array.from({length:3},(_,i)=>({jid:'blue-'+i,clan_id:10})),
 ...Array.from({length:5},(_,i)=>({jid:'red-'+i,clan_id:20}))]
 const queries=[]
 const db={async query(sql,params=[]){
  const q=String(sql)
  queries.push(q)
  if(q.includes('FROM alpha_siege_roster'))return {rows:roster}
  if(q.includes('FROM alpha_siege_moves'))return {rows:[]}
  throw Error('nao deveria escrever recompensa para jogador sem 2 turnos: '+q.slice(0,90))
 }}
 const r=await grantSiegeWeeklyXp(db,match(6))
 assert.equal(r.paid,0)
 assert.equal(r.totalXp,0)
 assert.equal(r.minimumRounds,2)
 assert.equal(queries.length,2)
 await assert.rejects(grantSiegeWeeklyXp(db,match(5)),/2 clãs de 2/)
})
test('Cerco V6 cria versão nova somente com toggle; check de turnos é no servidor antes de registrar ação',()=>{
 assert.match(source,/ALPHA_SIEGE_V6_ROSTER_ENABLED==='1'/)
 assert.match(source,/expanded\?insertV6Sql:insertV5Sql/)
 assert.match(source,/const roster=\(await conn.query\(/)
 assert.match(source,/siegeV6ActivePlayers\(roster,Number\(match.round\)\)/)
 assert.match(source,/Sua vez ainda não chegou/)
 assert.match(source,/myTurn:currentTurn,nextTurns/)
 assert.match(source,/match.created_by===DAILY_CREATED_BY\|\|moves.length<4/)
 assert.match(xpSource,/siegeV6RosterValid\(players,blue,red\)/)
 assert.match(xpSource,/ON CONFLICT\(match_id,jid\) DO NOTHING RETURNING jid/)
})
