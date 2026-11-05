import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {canonicalLid,canonicalPhone,pairFromGroupMember,createVerifiedLidDirectory} from '../src/neon/verified-lid-directory.js'

const fakeDb = () => {
  const pairs = new Map()
  const db = {
    query: async (sql,args=[]) => {
      if(sql.startsWith('CREATE TABLE'))return {rows:[]}
      if(sql.startsWith('INSERT INTO verified_whatsapp_lid_links')){
        const [lid,phone] = args
        if(pairs.has(lid) && pairs.get(lid)!==phone)return {rows:[]}
        pairs.set(lid,phone)
        return {rows:[{phone_jid:phone}]}
      }
      if(sql.startsWith('SELECT phone_jid'))return {rows:pairs.has(args[0])?[{phone_jid:pairs.get(args[0])}]:[]}
      if(sql.startsWith('SELECT chat_jid'))return {rows:[{chat_jid:'group1@g.us'},{chat_jid:'group2@g.us'}]}
      throw new Error('Unexpected SQL')
    }
  }
  return {db,pairs}
}

test('normalize only real WhatsApp identities, never a claimed phone',()=>{
  assert.equal(canonicalLid('123:4@lid'),'123@lid')
  assert.equal(canonicalPhone('5511988887777:4@s.whatsapp.net'),'5511988887777@s.whatsapp.net')
  assert.equal(canonicalPhone('5511988887777'),null)
  assert.equal(canonicalLid('Augusto'),null)
})

test('group participant proof requires exactly one LID and phone',()=>{
  assert.deepEqual(pairFromGroupMember({id:'543@lid',lid:'543@lid',phoneNumber:'5511999990000@s.whatsapp.net'}),{
    lid:'543@lid',phone:'5511999990000@s.whatsapp.net'
  })
  assert.equal(pairFromGroupMember({id:'543@lid',name:'Augusto'}),null)
  assert.equal(pairFromGroupMember({id:'543@lid',lid:'544@lid',phoneNumber:'5511999990000@s.whatsapp.net'}),null)
  assert.equal(pairFromGroupMember({id:'543@lid',phoneNumber:'5511999990000@s.whatsapp.net',pn:'5511988880000@s.whatsapp.net'}),null)
})

test('verified proof persists across directory instantiations; conflicting phone fails closed',async()=>{
  const {db} = fakeDb()
  const first=createVerifiedLidDirectory(db,{warn:()=>{}})
  assert.equal(await first.record('321@lid','5511999990000@s.whatsapp.net','group-member-metadata'),true)
  assert.equal(await first.record('321@lid','5511888880000@s.whatsapp.net','group-member-metadata'),false)
  assert.equal(await first.record('322@lid','5511999990000@s.whatsapp.net','typed-by-user'),false)
  const second=createVerifiedLidDirectory(db,{warn:()=>{}})
  assert.equal(await second.lookup('321@lid'),'5511999990000@s.whatsapp.net')
  assert.equal(await second.lookup('322@lid'),null)
})

test('private LID recovers only from authenticated matching group participant',async()=>{
  const {db} = fakeDb()
  const directory=createVerifiedLidDirectory(db,{warn:()=>{}})
  const sock={groupMetadata:async jid=>({
    participants:jid==='group1@g.us'
      ?[{id:'123@lid',lid:'123@lid',phoneNumber:'5511999990000@s.whatsapp.net'}]
      :[{id:'555@lid',lid:'555@lid',phoneNumber:'5511888880000@s.whatsapp.net'}]
  })}
  assert.equal(await directory.recoverFromActiveGroups('123@lid',sock),'5511999990000@s.whatsapp.net')
  assert.equal(await directory.recoverFromActiveGroups('444@lid',sock),null)
  assert.equal(await directory.lookup('123@lid'),'5511999990000@s.whatsapp.net')
})

test('private LID refuses ambiguous active group identities',async()=>{
  const {db} = fakeDb()
  const directory=createVerifiedLidDirectory(db,{warn:()=>{}})
  const sock={groupMetadata:async jid=>({participants:[{
    id:'123@lid',lid:'123@lid',
    phoneNumber:jid==='group1@g.us'?'5511999990000@s.whatsapp.net':'5511888880000@s.whatsapp.net'
  }]})}
  assert.equal(await directory.recoverFromActiveGroups('123@lid',sock),null)
  assert.equal(await directory.lookup('123@lid'),null)
})

test('unresolved LIDs are guarded before game progression and Web login',()=>{
  const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  const guard=source.indexOf("if(canonicalLid(sender)){")
  const ensure=source.indexOf("await ensureUser(sender",guard)
  assert.ok(guard>0 && ensure>guard)
  assert.match(source,/verifiedLidDirectory\.recoverFromActiveGroups/)
  assert.match(source,/verifiedLidDirectory\.record/)
  assert.match(source,/if\(canonicalLid\(sender\)\)[\s\S]*?continue[\s\S]*?setPlayerGroupContext/)
  assert.match(source,/consumePendingWebGroupLink\(sender\)/)
})
