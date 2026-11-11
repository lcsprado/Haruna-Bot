import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {RAID_LOTE_V1} from '../src/neon/raid-lote-policy.js'
import {summarizeRaidLoteXp} from '../src/neon/raid-lote-xp-summary.js'

const won=(exp,bonus)=>({status:'won',reward_summary:{rewards:[{exp,baseExp:exp-bonus,xpBoostBonus:bonus}]}})
test('Raid 75: ampulheta dobra quatro vitorias sem afetar outras cinco',()=>{
 const reports=Array.from({length:9},(_,i)=>won(i>=1&&i<=4?34800:17400,i>=1&&i<=4?17400:0))
 assert.deepEqual(summarizeRaidLoteXp(reports),{totalXp:226200,bonusXp:69600})
})
test('Bonus sem uso em nove vitorias nao altera a recompensa reduzida',()=>{
 const reports=Array.from({length:9},()=>won(17400,0))
 assert.deepEqual(summarizeRaidLoteXp(reports),{totalXp:156600,bonusXp:0})
})
test('Nao soma tentativas nao vencidas, nem resultados invalidos',()=>{
 const reports=[won(17400,0),{...won(34800,17400),status:'lost'},{...won(34800,17400),status:'active'},won(-500,999)]
 assert.deepEqual(summarizeRaidLoteXp(reports),{totalXp:17400,bonusXp:0})
})
test('Politica distingue item pessoal de multiplicador de evento',()=>{
 assert.equal(RAID_LOTE_V1.applyTemporaryRewardMultipliers,false)
 assert.equal(RAID_LOTE_V1.applyActivatedXpItems,true)
})
test('Combate nao ignora ampulheta e recibo persiste XP total e bonus',()=>{
 const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 assert.match(src,/ignoreGroupProgressionEvent:true,ignoreXpBoost:!RAID_LOTE_V1\.applyActivatedXpItems/)
 assert.match(src,/baseExp:p\.exp,xpBoostBonus:p\.xpBoostBonus/)
 assert.match(src,/exp:p\.awardedExp/)
})
test('Resumo final inclui XP adicional separadamente, sem somar duas vezes',()=>{
 const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(src,/summarizeRaidLoteXp\(records\)/)
 assert.match(src,/totalBoostXp>0/)
 assert.match(src,/já incluído no XP acima/)
})
