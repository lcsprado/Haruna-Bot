import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {recoverAuthorizedBetaGroup} from '../src/neon/web-beta-session-recovery.js'

const player='5511999990000@s.whatsapp.net'
const chat='120363429534634131@g.us'
function fakeDb(records) {
  const queries=[]
  const db={query:async (sql,args)=>{
    queries.push({sql,args})
    return {rows:records.filter(x=>x.jid===args[0] && x.expiresAt>args[1])
      .map(x=>({chat_jid:x.chat})).filter((v,i,arr)=>arr.findIndex(w=>w.chat_jid===v.chat_jid)===i)
      .slice(0,2)}
  }}
  return {db,queries}
}

test('private beta login resumes a previously group-bound session from same JID',async()=>{
  const {db,queries}=fakeDb([{jid:player,chat,expiresAt:60000}])
  const authorized=await recoverAuthorizedBetaGroup(db,player,
    (jid,group)=>jid===player && group===chat,5000)
  assert.equal(authorized,chat)
  assert.deepEqual(queries[0].args,[player,5000])
  assert.match(queries[0].sql,/WHERE jid=\$1 AND chat_jid IS NOT NULL AND expires_at>\$2/)
})

test('cannot borrow a group session belonging to another player',async()=>{
  const {db}=fakeDb([{jid:'5511888880000@s.whatsapp.net',chat,expiresAt:60000}])
  assert.equal(await recoverAuthorizedBetaGroup(db,player,()=>true,5000),null)
})

test('missing, expired, or unverified clan membership denies login',async()=>{
  const {db}=fakeDb([{jid:player,chat,expiresAt:60000}])
  assert.equal(await recoverAuthorizedBetaGroup(db,player,()=>false,5000),null)
  assert.equal(await recoverAuthorizedBetaGroup(db,player,()=>true,65000),null)
})

test('multiple group contexts are ambiguous and fail closed',async()=>{
  const {db}=fakeDb([
    {jid:player,chat,expiresAt:60000},
    {jid:player,chat:'120363999999999999@g.us',expiresAt:60000}
  ])
  assert.equal(await recoverAuthorizedBetaGroup(db,player,()=>true,5000),null)
})

test('unknown JIDs and invalid groups never grant access',async()=>{
  const {db}=fakeDb([{jid:player,chat:'fake-group',expiresAt:60000}])
  assert.equal(await recoverAuthorizedBetaGroup(db,player,()=>true,5000),null)
  assert.equal(await recoverAuthorizedBetaGroup(db,'123@lid',()=>true,5000),null)
})

test('exchanged tokens inherit only the verified prior group and remain isolated',()=>{
  const source=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  const start=source.indexOf('async function exchangeWebLinkCode(code)')
  const end=source.indexOf('async function webAuthSelfTest()',start)
  const block=source.slice(start,end)
  assert.ok(start>=0 && end>start)
  assert.match(block,/betaWebAuthorization\(row\.jid,row\.chat_jid,client\)/)
  assert.match(block,/const sessionGroup=auth\.group/)
  assert.match(block,/\[tokenHash,row\.jid,sessionGroup\|\|null,expiresAt,now\(\)\]/)
  assert.match(block,/return \{token,expiresAt,groupLinked:Boolean\(sessionGroup\)\}/)
  assert.doesNotMatch(block,/INSERT INTO web_sessions[\s\S]*?\[tokenHash,row\.jid,row\.chat_jid\|\|null/)
})
