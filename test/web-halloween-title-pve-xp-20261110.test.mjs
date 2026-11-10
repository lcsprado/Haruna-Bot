import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {HALLOWEEN_TITLE_ID,HALLOWEEN_TITLE_XP_BONUS,halloweenTitleBonusXp,ownsHalloweenTitle,halloweenPveXp} from '../src/neon/halloween-title-pve.js'
const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const region=name=>{
 const i=src.indexOf(name)
 assert.ok(i>=0,'missing '+name)
 const j=src.indexOf('\nexport ',i+name.length)
 return src.slice(i,j>=0?j:undefined)
}
const raid=region('async function finishRaidRewards(')
const boss=region('export async function attackBoss(')

test('AB-01: título Halloween tem 10% XP exatamente como WhatsApp e sem arredondamentos cumulativos',()=>{
 assert.equal(HALLOWEEN_TITLE_ID,'titulo_soberano_almas_halloween_20261031')
 assert.equal(HALLOWEEN_TITLE_XP_BONUS,0.10)
 for(const xp of [0,1,5,10,101,450,2500,9999]){
  assert.equal(halloweenTitleBonusXp(xp,true),Math.round(xp*1.1))
  assert.equal(halloweenTitleBonusXp(xp,false),xp)
 }
 assert.equal(halloweenTitleBonusXp(-5,true),0)
 assert.equal(halloweenTitleBonusXp(100.99,true),110)
})

test('AB-01: ownership is checked by a read-only query inside the combat transaction',async()=>{
 const logs=[]
 const client=(owned)=>({query:async(query,params)=>{
   logs.push({query,params})
   return {rowCount:owned?1:0,rows:owned?[{ok:1}]:[]}
 }})
 assert.equal(await halloweenPveXp(client(false),'player-a',1000),1000)
 assert.equal(await halloweenPveXp(client(true),'player-b',1000),1100)
 assert.equal(await ownsHalloweenTitle(client(false),'player-c'),false)
 assert.equal(logs.length,3)
 assert.ok(logs.every(x=>x.query.startsWith('SELECT 1 FROM inventories')))
 assert.ok(logs.every(x=>x.params[1]===HALLOWEEN_TITLE_ID))
 assert.ok(logs.every(x=>!/(UPDATE|DELETE|INSERT INTO)/.test(x.query)))
})

test('AB-01: Raid XP adds title once before the transactional credit and does not add it twice',()=>{
 assert.match(src,/import \{halloweenPveXp\} from '\.\/halloween-title-pve\.js'/)
 assert.match(raid,/const exp=await halloweenPveXp\(c,p\.jid,Math\.round\(/)
 assert.match(raid,/const expCredit=await grantExpInTransaction\(c,p\.jid,exp,\{chatJid:chat\}\)/)
 assert.doesNotMatch(raid,/grantExpInTransaction\(c,p\.jid,await halloweenPveXp\(c,p\.jid,exp\)/)
 assert.match(src,/baseGain=await halloweenPveXp\(c,jid,Math\.max\(0,Math\.round\(baseGain\*petXpEventMultiplier/)
})

test('AB-01: all Boss phases have title-aware XP credit while other gameplay stays untouched',()=>{
 const calls=[...src.matchAll(/await grantExpInTransaction\(c,p\.jid,([^\n]+)/g)].map(x=>x[1])
 assert.ok(calls.length>=9,'expected Boss and Raid reward paths to be counted')
 assert.equal(calls.filter(x=>x.startsWith('exp,{chatJid:chat})')).length,1,
  'only Raid pays a pre-boosted exp without repeating the title')
 assert.ok(calls.every(x=>x.startsWith('exp,{chatJid:chat})')||x.startsWith('await halloweenPveXp(c,p.jid,')),
  'Boss compensation is limited to title-aware PvE credit only')
 assert.match(boss,/halloweenPveXp\(c,p\.jid,exp\)/)
 assert.doesNotMatch(src,/halloweenTitleBonusXp\(.*?\)\s*\*\s*1\.10/)
})

test('AB-01: title grants 10% to a character on 6000 HP without altering stats or inventory',async()=>{
 const client={query:async()=>({rowCount:1,rows:[{value:1}]})}
 const base=1540
 const credit=await halloweenPveXp(client,'player',base)
 assert.equal(credit,1694)
 assert.equal(base,1540)
})
