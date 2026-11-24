import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {businessV4IntervalGross} from '../src/neon/business-rebalance-v4.js'
import {businessCollectionCooldownRemainingSeconds} from '../src/neon/business-profit.js'

const v4Cutover=1800000000
const rate=75000
const base={v3EffectiveAt:v4Cutover-3600,v4EffectiveAt:v4Cutover,baseHourV2:300,baseHourV3:1000,baseHourV4:rate,level:1,maxHours:24}

test('coleta V4 libera lucro proporcional aos 5 minutos mesmo para negocio de ciclo 7h',()=>{
 const started=v4Cutover+3600
 const first=businessV4IntervalGross({...base,start:started,now:started+300})
 assert.equal(first,6250)
 assert.equal(businessCollectionCooldownRemainingSeconds(started+300,started),0)
 assert.equal(businessCollectionCooldownRemainingSeconds(started+301,started+300),299)
 const second=businessV4IntervalGross({...base,start:started+300,now:started+600})
 assert.equal(second,6250)
 assert.equal(first+second,businessV4IntervalGross({...base,start:started,now:started+600}))
})

test('coleta segue respeitando espera global de 5 minutos, nao os ciclos do negocio',()=>{
 assert.equal(businessCollectionCooldownRemainingSeconds(1000000,0),0)
 assert.equal(businessCollectionCooldownRemainingSeconds(1000000,999999),299)
 assert.equal(businessCollectionCooldownRemainingSeconds(1000000,999700),0)
 assert.equal(businessCollectionCooldownRemainingSeconds(1000000,999000),0)
})

test('24 horas permanecem como teto do lucro acumulado offline, sem multiplicar as coletas',()=>{
 const start=v4Cutover+3600
 assert.equal(businessV4IntervalGross({...base,start,now:start+26*3600}),rate*24)
 assert.equal(businessV4IntervalGross({...base,start,now:start+24*3600}),rate*24)
 const first=businessV4IntervalGross({...base,start,now:start+9*3600})
 const second=businessV4IntervalGross({...base,start:start+9*3600,now:start+24*3600})
 assert.equal(first+second,rate*24)
})

test('rota !coletar nao aplica a trava V4 de ciclo e mantem o cooldown',()=>{
 const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
 const start=source.indexOf('export async function collectBusinesses(jid)')
 const end=source.indexOf('export function businessUpgradeQuote(',start)
 assert.ok(start>=0&&end>start)
 const method=source.slice(start,end)
 assert.match(method,/businessCollectionCooldownRemainingSeconds\(now,lastClaim\)/)
 assert.match(method,/businessIntervalGrossV2\(b,row,now\)/)
 assert.doesNotMatch(method,/businessV4CycleStatus|nextCycleRemaining|cycle\.ready/)
})
