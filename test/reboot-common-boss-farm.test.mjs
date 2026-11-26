import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {commonBossRewardV2} from '../src/neon/reboot-pve-policy.js'
const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const start=src.indexOf('let commonV2=rebootEconomyEnabled()')
const end=src.indexOf('const tier=',start)
assert.ok(start>=0&&end>start)
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
const run=new AsyncFunction('rebootEconomyEnabled','weekly','eventMode','p','total','c','claimCooldown','commonBossRewardV2',src.slice(start,end)+'\nreturn commonV2')
function fixture(){
  const claimed=new Set(),keys=[]
  return {keys,claim:async(c,key,seconds)=>{
    assert.equal(seconds,3600);keys.push(key)
    if(claimed.has(key))return {ok:false}
    claimed.add(key);return {ok:true}
  }}
}
const attempt=(f,jid,damage=100,enabled=true,weekly=false,event=false)=>run(()=>enabled,weekly,event,{jid,damage},100,{},f.claim,commonBossRewardV2)
test('common Boss: global cooldown limits rewards across settlements but not other players',async()=>{
  const f=fixture()
  assert.deepEqual(await attempt(f,'p'),{cash:2500,xp:120,boxChance:.03})
  assert.deepEqual(await attempt(f,'p'),{cash:0,xp:0,boxChance:0})
  assert.deepEqual(await attempt(f,'q'),{cash:2500,xp:120,boxChance:.03})
  assert.deepEqual(f.keys,['v2:common-boss-reward:p','v2:common-boss-reward:p','v2:common-boss-reward:q'])
})
test('common Boss: insufficient contribution, weekly, event and V1 do not consume V2 cooldown',async()=>{
  const f=fixture()
  assert.deepEqual(await attempt(f,'p',1),{cash:0,xp:0,boxChance:0})
  assert.equal(await attempt(f,'p',100,false),null)
  assert.equal(await attempt(f,'p',100,true,true),null)
  assert.deepEqual(await attempt(f,'p',100,true,false,true),{cash:2500,xp:120,boxChance:.03})
  assert.equal(f.keys.length,0)
  assert.equal((await attempt(f,'p')).cash,2500)
})
test('common Boss: suppressed payouts do not enter money, XP, pet XP, box or reclass paths',()=>{
  assert.match(src,/if\(!commonV2\|\|cash>0\) await credit/)
  assert.match(src,/if\(!commonV2\|\|exp>0\) await grantExpInTransaction/)
  assert.match(src,/if\(pp&&\(!commonV2\|\|commonV2\.xp>0\)\)/)
  assert.match(src,/if\(commonV2\.boxChance>0&&Math\.random\(\)<Math\.min\(\.05,commonV2\.boxChance\+Number\(pb\.drop\|\|0\)\*\.10\)\)/)
  assert.match(src,/\(commonV2&&commonV2\.xp===0\)\?null:await maybeGrantReclassScroll/)
})
