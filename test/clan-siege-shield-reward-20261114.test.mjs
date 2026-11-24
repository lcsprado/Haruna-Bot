import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  SIEGE_SHIELD_REWARD_DATE,SIEGE_SHIELD_REWARD_ITEM_ID,
  isSiegeShieldRewardMatch,eligibleForSiegeShield,
  grantSiegeShieldReward,ensureSiegeShieldRewardSchema
} from '../src/neon/clan-siege-shield-reward-20261114.js'

const match=(overrides={})=>({
 id:1401,status:'completed',rules_version:6,created_by:'system:siege-daily-20h',
 created_at:Date.parse('2026-11-14T21:30:00-03:00'),
 blue_clan_id:101,red_clan_id:202,winner_clan_id:101,...overrides
})
const roster=(blue,red)=>{
 const result=[]
 for(let i=0;i<blue;i++)result.push({jid:'blue'+i,clan_id:101})
 for(let i=0;i<red;i++)result.push({jid:'red'+i,clan_id:202})
 return result
}
function fake(rows,turns){
 const claimed=new Set(),inventories=[],bound=[],items=[],queries=[]
 return {claimed,inventories,bound,items,queries,
  async query(sql,args=[]){
   const q=String(sql);queries.push(q)
   if(q.includes('FROM alpha_siege_roster'))return {rows}
   if(q.includes('FROM alpha_siege_moves'))return {rows:rows.map((x,i)=>({jid:x.jid,turns:turns?.[i]??2}))}
   if(q.startsWith('INSERT INTO items')){items.push({sql:q,args});return {rowCount:1}}
   if(q.startsWith('INSERT INTO alpha_siege_shield_rewards_20261114')){
     if(claimed.has(args[0]))return {rowCount:0}
     claimed.add(args[0]);return {rowCount:1}
   }
   if(q.startsWith('INSERT INTO inventories')){inventories.push({sql:q,args});return {rowCount:1}}
   if(q.startsWith('INSERT INTO bound_inventory_items')){bound.push({sql:q,args});return {rowCount:1}}
   throw Error('Unexpected SQL '+q.slice(0,170))
  }}
}
test('AB-07: prêmio vale só 14/11 em partida semanal encerrada',()=>{
 assert.equal(SIEGE_SHIELD_REWARD_DATE,'2026-11-14')
 assert.equal(SIEGE_SHIELD_REWARD_ITEM_ID,'bastiao_eclipse')
 assert.equal(isSiegeShieldRewardMatch(match()),true)
 for(const invalid of [
  {created_at:Date.parse('2026-11-07T21:30:00-03:00')},
  {created_at:Date.parse('2026-11-21T21:30:00-03:00')},
  {status:'active'},{created_by:'player'},{rules_version:4}
 ])assert.equal(isSiegeShieldRewardMatch(match(invalid)),false)
})
test('AB-07: clã campeão com duas rodadas recebe; empate e 1 rodada não',()=>{
 assert.equal(eligibleForSiegeShield(match(),101,2),true)
 assert.equal(eligibleForSiegeShield(match(),101,1),false)
 assert.equal(eligibleForSiegeShield(match(),202,6),false)
 assert.equal(eligibleForSiegeShield(match({winner_clan_id:null}),101,6),false)
})
test('AB-07: todos os elencos válidos 2×6, 3×5, 6×6 recebem só campeões elegíveis',async()=>{
 for(const [blue,red] of [[2,6],[3,5],[6,6]]){
  const people=roster(blue,red),turns=people.map((x,i)=>i===0?1:2)
  const conn=fake(people,turns)
  const first=await grantSiegeShieldReward(conn,match())
  assert.equal(first.eligible,blue-1)
  assert.equal(first.delivered,blue-1)
  assert.equal(conn.inventories.length,blue-1)
  assert.equal(conn.bound.length,blue-1)
  assert.ok(conn.inventories.every(x=>x.sql.includes('quantity=inventories.quantity+1')))
  assert.ok(conn.bound.every(x=>String(x.args[2]).includes('clan-siege:v6:20261114:1401')))
  assert.ok(conn.items.every(x=>x.sql.includes('sellable=FALSE')))
  assert.ok(conn.inventories.every(x=>x.args[0].startsWith('blue')))
  const repeat=await grantSiegeShieldReward(conn,match())
  assert.equal(repeat.delivered,0)
  assert.equal(conn.inventories.length,blue-1,'idempotência após reinício')
 }
})
test('AB-07: recusa elencos adulterados, sem dar prêmio',async()=>{
 for(const people of [roster(1,6),roster(2,7),
   roster(6,6).map((x,i)=>i===2?{...x,jid:'blue0'}:x)]){
  const conn=fake(people)
  await assert.rejects(grantSiegeShieldReward(conn,match()),/escalação inválida/)
  assert.equal(conn.inventories.length,0)
 }
 const legacy=fake(roster(2,6))
 await assert.rejects(grantSiegeShieldReward(legacy,match({rules_version:5})),/escalação inválida/)
})
test('AB-07: empate ou data errada não gera distribuição',async()=>{
 const draw=fake(roster(6,6))
 const r=await grantSiegeShieldReward(draw,match({winner_clan_id:null}))
 assert.equal(r.draw,true)
 assert.equal(r.delivered,0)
 assert.equal(draw.items.length,0)
 const off=fake(roster(6,6))
 assert.equal(await grantSiegeShieldReward(off,match({created_at:Date.parse('2026-11-15T21:30:00-03:00')})),null)
 assert.equal(off.queries.length,0)
})
test('AB-07: tabela de claims é única por jogador e prêmio vinculado',async()=>{
 const sql=[]
 await ensureSiegeShieldRewardSchema({query:async q=>{sql.push(q)}})
 assert.match(sql[0],/jid TEXT PRIMARY KEY/)
 assert.match(sql[0],/alpha_siege_shield_rewards_20261114/)
 const source=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8')
 assert.match(source,/await ensureSiegeShieldRewardSchema\(db\)/)
 assert.match(source,/const shieldPrize=r.finished\?await grantSiegeShieldReward\(conn,updated\):null/)
 assert.match(source,/SIEGE_SHIELD_REWARD_DATE/)
 assert.match(source,/PRÊMIO ESPECIAL DE 14\/11/)
})
