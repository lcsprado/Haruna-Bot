import test from 'node:test'
import assert from 'node:assert/strict'
import {POCO_SEASON} from '../src/neon/poco-abismo-rules.js'
import {
 pocoFinalLeaderboard,pocoSettleFinalRanking,
 POCO_LIVE_PLAYER_PREFIX,POCO_LIVE_SETTLEMENT_KEY
} from '../src/neon/poco-abismo-settlement.js'

function entry(jid,best,{prefix=POCO_LIVE_PLAYER_PREFIX,season=POCO_SEASON.id}={}){
 return {key:prefix+jid,value:{season,name:'Jogador '+jid,best:{jid,completed:best.floor===30,
  hp:900,potions:1,endedAt:POCO_SEASON.startAt+720000,...best}}}
}
test('desempate prioriza andar, depois rodadas virtuais, não a leitura no WhatsApp',()=>{
 const ranked=pocoFinalLeaderboard([
  entry('joao',{floor:30,turns:71,endedAt:POCO_SEASON.startAt+7200}),
  entry('augusto',{floor:30,turns:65,endedAt:POCO_SEASON.startAt+720000}),
  entry('kaique',{floor:29,turns:44,endedAt:POCO_SEASON.startAt+720})
 ])
 assert.deepEqual(ranked.map(x=>x.jid),['augusto','joao','kaique'])
 assert.equal(ranked[0].turns,65)
})
test('igualdade de tempo virtual usa HP, poções e timestamp, com JID como último recurso determinístico',()=>{
 const same=POCO_SEASON.startAt+60000
 const ranked=pocoFinalLeaderboard([
  entry('a',{floor:30,turns:63,hp:100,potions:0,endedAt:same}),
  entry('c',{floor:30,turns:63,hp:400,potions:1,endedAt:same}),
  entry('b',{floor:30,turns:63,hp:400,potions:1,endedAt:same}),
  entry('d',{floor:30,turns:63,hp:400,potions:0,endedAt:same})
 ])
 assert.deepEqual(ranked.map(x=>x.jid),['b','c','d','a'])
})
test('não paga prévia ou score inválido, não conta pontuação fora da temporada',()=>{
 const ranked=pocoFinalLeaderboard([
  entry('preview',{floor:30,turns:40},{prefix:'poco_abismo_preview_20261116:player:'}),
  entry('fora',{floor:30,turns:30,endedAt:POCO_SEASON.endAt+1}),
  entry('falso',{floor:30,turns:30,jid:'outro'}),
  entry('semturnos',{floor:28,turns:-1}),
  entry('ok',{floor:12,turns:20}),
  entry('old',{floor:30,turns:30},{season:'evento-outro'})
 ])
 assert.deepEqual(ranked.map(x=>x.jid),['ok'])
})
test('encerramento antecipado não sequer acessa banco',async()=>{
 const result=await pocoSettleFinalRanking({connect:()=>{throw Error('não pode acessar DB')}},POCO_SEASON.endAt-1)
 assert.deepEqual(result,{settled:false,reason:'season_not_ended'})
 assert.ok(!POCO_LIVE_SETTLEMENT_KEY.includes('preview'))
})
