import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const start=source.indexOf('function verifiedRebootOwner(')
const end=source.indexOf('\n}\n',start)
assert.ok(start>=0&&end>start)
const check=new Function('return ('+source.slice(start,end+2)+')')()
const phone='5511999999999@s.whatsapp.net',other='5511888888888@s.whatsapp.net',lid='5511999999999@lid'
const config={ownerJid:phone,ownerNumber:'5511999999999',pairingNumber:'5511888888888',ownerLid:'123456789012345@lid'}
const allowed=(sender,rawSender,opts=config)=>check({...opts,sender,rawSender})
test('V2 owner requires verified full identity, not numeric namespace collision',()=>{
 assert.equal(allowed(phone,phone),true)
 assert.equal(allowed(phone,'5511999999999:2@s.whatsapp.net'),true)
 assert.equal(allowed(phone,'123456789012345@lid'),true)
 assert.equal(allowed(lid,lid),false)
 assert.equal(allowed(other,other),false)
 assert.equal(allowed(phone,other),false)
 assert.equal(allowed(phone,'group@g.us'),false)
})
test('V2 pairing fallback never grants a second owner when owner explicitly configured',()=>{
 assert.equal(allowed(other,other,{ownerJid:phone,pairingNumber:'5511888888888'}),false)
 assert.equal(allowed(other,other,{pairingNumber:'5511888888888'}),true)
 assert.equal(allowed(other,other,{}),false)
})
test('V2 supports explicitly configured LID without matching unrelated phone digits',()=>{
 const c={ownerJid:lid}
 assert.equal(allowed(lid,lid,c),true)
 assert.equal(allowed(phone,lid,c),true)
 assert.equal(allowed(phone,phone,c),false)
})
test('direct item grant uses same verified target route in V2, with owner-only guard',()=>{
 assert.match(source,/classesOnlyRebootEnabled\(\)&&cmd==='daritem'/)
 assert.match(source,/ownerTarget=await resolveVerifiedAdminTarget\(sock,chat,ownerMention,msg\)/)
 assert.match(source,/\} else if\(\['daritem'\]\.includes\(cmd\)\)\{\s*if\(!isOwner\)/)
 assert.match(source,/ownerGrantItem\(ownerTarget,itemArg\.toLowerCase\(\),qty\)/)
})
