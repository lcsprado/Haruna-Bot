import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {awardWebRaidHeroProgress} from '../src/neon/pve-raid-hero-awards.js'
import {heroMasteryAwardPolicy} from '../src/neon/playable-heroes-core.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
function fakeClient(){
 const writes=[],queries=[],paid=new Set(),state={level:50,xp:4900,levelCredit:0,masteryCredit:0,masteryXp:200}
 return {writes,queries,state,client:{async query(sql,params=[]){
  const q=String(sql).replace(/\s+/g,' ').trim()
  queries.push({q,params})
  if(q.startsWith('SELECT jid,level FROM users'))return {rows:[{jid:'fake',level:500}]}
  if(q.startsWith('SELECT id,level,xp FROM pet_collection'))return {rows:[{id:123,level:state.level,xp:state.xp}]}
  if(q.includes('FROM hero_level_awards')&&q.startsWith('SELECT'))return {rows:[{gained:state.levelCredit}]}
  if(q.startsWith('INSERT INTO hero_level_awards')){
   const key='level:'+params[1]
   if(paid.has(key))return {rowCount:0,rows:[]}
   paid.add(key);writes.push('level_award');state.levelCredit+=Number(params[3]);return {rowCount:1,rows:[{jid:'fake'}]}
  }
  if(q.startsWith('UPDATE pet_collection')){
   writes.push('level_update');state.xp=Number(params[0]);state.level=Number(params[1]);return {rowCount:1,rows:[]}
  }
  if(q.startsWith('SELECT jid FROM users WHERE jid=$1 FOR UPDATE'))return {rows:[{jid:'fake'}]}
  if(q.includes('FROM hero_mastery_awards')&&q.startsWith('SELECT'))return {rows:[{gained:state.masteryCredit,regular_gained:state.masteryCredit}]}
  if(q.startsWith('INSERT INTO hero_mastery_awards')){
   const key='mastery:'+params[1]
   if(paid.has(key))return {rowCount:0,rows:[]}
   paid.add(key);writes.push('mastery_award');state.masteryCredit+=Number(params[3]);return {rowCount:1,rows:[{jid:'fake'}]}
  }
  if(q.startsWith('INSERT INTO player_hero_mastery')){
   writes.push('mastery_update');state.masteryXp+=Number(params[2]);return {rowCount:1,rows:[{xp:state.masteryXp}]}
  }
  throw Error('Query not stubbed: '+q.slice(0,160))
 }}}
}
const participant={jid:'fake',heroId:'pecado_ban',damage:2500}
const args={participant,share:.05,level:65,collab:true,startedAt:1794230000000,nowMs:Date.parse('2026-11-09T11:30:00-03:00')}
test('Raid Web concede heroi/maestria uma vez com unique award key',async()=>{
 const fx=fakeClient()
 const first=await awardWebRaidHeroProgress(fx.client,args)
 assert.equal(first.earned,90)
 assert.equal(first.reason,'creditado')
 assert.equal(fx.writes.filter(x=>x==='level_award').length,1)
 assert.equal(fx.writes.filter(x=>x==='mastery_award').length,1)
 const twice=await awardWebRaidHeroProgress(fx.client,args)
 assert.equal(twice.reason,'duplicado')
 assert.equal(twice.earned,0)
 assert.equal(fx.writes.filter(x=>x==='level_award').length,1)
 assert.equal(fx.writes.filter(x=>x==='mastery_award').length,1)
 assert.equal(fx.state.levelCredit,125)
 assert.equal(fx.state.masteryCredit,90)
})
test('2% e pelo menos 2500 dano impedem carona e nao fazem consultas de escrita',async()=>{
 for(const [damage,share] of [[2499,.5],[2500,.0199],[0,.8]]){
  const fx=fakeClient()
  const result=await awardWebRaidHeroProgress(fx.client,{...args,share,participant:{...participant,damage}})
  assert.equal(result.reason,'participacao_insuficiente')
  assert.equal(fx.queries.length,0)
 }
})
test('Classe comum nao recebe maestria de heroi',async()=>{
 const fx=fakeClient()
 const result=await awardWebRaidHeroProgress(fx.client,{...args,participant:{jid:'fake',damage:6000}})
 assert.equal(result,null)
 assert.equal(fx.queries.length,0)
})
test('Web usa mesma semantica de semana sem limite de maestria via modulo atualizado',()=>{
 const p=heroMasteryAwardPolicy({earnedToday:9999,regularEarnedToday:9999,xp:90,nowMs:Date.parse('2026-11-09T11:30:00-03:00')})
 assert.equal(p.amount,90)
 assert.equal(p.dailyCap,null)
})
test('Pagamento na Raid ocorre exclusivamente na funcao de liquidacao apos encerramento',()=>{
 const fn=games.slice(games.indexOf('async function finishRaidRewards('),games.indexOf('async function recordPlayerDamage('))
 assert.match(fn,/const masteryReport=await awardWebRaidHeroProgress\(c,/)
 assert.match(fn,/masteryReport,activeHeroId:p\.heroId\|\|null/)
 const round=games.slice(games.indexOf('export async function raidRound('),games.indexOf('async function grantBossItem('))
 assert.match(round,/if\(Number\(s\.hp\)<=0\)\{/)
 assert.match(round,/const rewards=await finishRaidRewards\(c,s,cfg,chat\)/)
 assert.doesNotMatch(round,/awardWebRaidHeroProgress\(/)
})
