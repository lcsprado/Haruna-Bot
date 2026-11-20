import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const web=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
const start=source.indexOf('const ALPHA_CONTRACT_TEMPLATES=')
const end=source.indexOf('export async function getAlphaContractBoard',start)
assert.ok(start>=0&&end>start)
const build=new Function('rebootEconomyEnabled',source.slice(start,end)+'\nreturn {effectiveAlphaContractRecord,alphaContractBoardFor}')
const v2=build(()=>true),v1=build(()=>false)
test('V2 every rotating board preserves tasks and scales down rewards',()=>{
 for(const period of [100,101]){
  const old=v1.alphaContractBoardFor(period),now=v2.alphaContractBoardFor(period)
  assert.equal(now.length,5)
  for(let i=0;i<now.length;i++){
   assert.equal(now[i].id,old[i].id)
   assert.equal(now[i].target,old[i].target)
   assert.equal(now[i].level,old[i].level)
   assert.equal(now[i].cash,Math.floor(old[i].cash/10))
   assert.equal(now[i].xp,Math.floor(old[i].xp/4))
   assert.equal(now[i].item,old[i].item?'caixa_rara':undefined)
  }
 }
})
test('V2 outstanding legacy rewards capped without inflating lower stored amounts; history and V1 unchanged',()=>{
 const row={contract_id:'raid40',reward_cash:8000,reward_xp:4200,reward_item:'caixa_epica',claimed:false}
 assert.deepEqual(v2.effectiveAlphaContractRecord(row),{...row,reward_cash:800,reward_xp:1050,reward_item:'caixa_rara'})
 const low={...row,reward_cash:10,reward_xp:20,reward_item:null}
 assert.deepEqual(v2.effectiveAlphaContractRecord(low),low)
 assert.equal(v1.effectiveAlphaContractRecord(row),row)
 const history={...row,claimed:true}
 assert.equal(v2.effectiveAlphaContractRecord(history),history)
 assert.throws(()=>v2.effectiveAlphaContractRecord({...row,contract_id:'unknown'}),/indisponível/)
})
test('contract claim settles capped persisted reward and both channels show cooldown',()=>{
 assert.match(source,/const contract=effectiveAlphaContractRecord\(rows\[0\]\)/)
 assert.match(source,/UPDATE alpha_contracts SET claimed=TRUE,reward_cash=\$3,reward_xp=\$4,reward_item=\$5/)
 assert.match(wa,/r\.rewardCooldown\?'Prêmio em recarga/)
 assert.match(wa,/r\.rewardCooldown\?'⏳ Prêmio em recarga/)
 assert.match(web,/result\?\.rewardCooldown\) return '✅ Acertou! Prêmio em recarga/)
})
