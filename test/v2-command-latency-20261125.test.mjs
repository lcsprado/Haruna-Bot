import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
test('manual raid starts and recovered room runners use unquoted automatic delivery',()=>{
 for(const level of ['r.level','requestedRoom.level']){
  assert.ok(source.includes('runRaidCombat(chat,Number('+level+'),text=>raidAutoReply?raidAutoReply(chat,text):false)'))
 }
 assert.ok(source.includes('await sock.sendMessage(chat,{text})'))
})
test('verified identity consolidation cache is bounded and V2-only outside eco mode',()=>{
 assert.ok(source.includes('const identityCacheMs=neonEcoMode?30*60*1000:classesOnlyRebootEnabled()?60*1000:0'))
 assert.ok(source.includes("JSON.stringify([sender,[...new Set(senderIdentity.aliases||[])].sort(),msg.pushName||''])"))
 assert.ok(source.includes("await consolidateUserIdentity(sender,senderIdentity.aliases,msg.pushName||'')\nif(identityCacheMs){"))
 assert.ok(source.includes('if(alphaIdentityMergeChecked.size>5000)alphaIdentityMergeChecked.clear()'))
})
test('inventory exposes pet potion stock from live inventory rows',()=>{
 assert.ok(source.includes("Poções de pet: '+potions.filter(i=>String(i.item_id).startsWith('pocao_pet_')).reduce"))
})
