import test from 'node:test'
import assert from 'node:assert/strict'
import {WEEKLY_BOSS_POOL_CASH,isWeeklyBossPoolEdition,weeklyBossCashPoolShares} from '../src/neon/weekly-boss-prize-pool.js'

test('somente edicoes a partir de 20/11/2026 recebem bolo proporcional',()=>{
 assert.equal(isWeeklyBossPoolEdition('2026-11-13'),false)
 assert.equal(isWeeklyBossPoolEdition('2026-11-20'),true)
 assert.equal(weeklyBossCashPoolShares('2026-11-13',[{jid:'a',damage:5}]),null)
})
test('o total e exatamente 50 milhoes e nao depende da colocacao',()=>{
 const players=[{jid:'joao',damage:4_305_680},{jid:'lp',damage:3_205_848},{jid:'augusto',damage:1_849_529},{jid:'kaique',damage:75_235}]
 const shares=weeklyBossCashPoolShares('2026-11-20',players)
 assert.equal([...shares.values()].reduce((a,b)=>a+b,0),WEEKLY_BOSS_POOL_CASH)
 assert.ok(shares.get('kaique')<500_000)
 assert.ok(shares.get('joao')>shares.get('lp'))
 assert.ok(shares.get('lp')>shares.get('augusto'))
})
test('dano zero nao recebe nada; jogador solo recebe bolo inteiro',()=>{
 assert.equal(weeklyBossCashPoolShares('2026-11-20',[{jid:'a',damage:100},{jid:'b',damage:0}]).get('a'),50_000_000)
 assert.equal(weeklyBossCashPoolShares('2026-11-20',[{jid:'a',damage:100},{jid:'b',damage:0}]).get('b'),undefined)
})
test('maiores restos resolvem empate sem criar ou perder reais',()=>{
 const shares=weeklyBossCashPoolShares('2026-11-27',[{jid:'a',damage:1},{jid:'b',damage:1},{jid:'c',damage:1}])
 assert.deepEqual([...shares.values()],[16_666_667,16_666_667,16_666_666])
})
