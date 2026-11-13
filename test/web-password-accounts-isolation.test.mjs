
import test from 'node:test'
import assert from 'node:assert/strict'
import {webTokenHash} from '../src/neon/web-password-auth.js'
import {getWebCodeMode,registerWebPassword,recoverWebPassword,loginWebPassword} from '../src/neon/web-password-accounts.js'

function dbFixture(){
  const codes=new Map(),accounts=new Map(),sessions=new Map(),limits=new Map(),verified=new Map()
  const addCode=(code,jid,chatJid=null)=>codes.set(webTokenHash(code),{jid,chat_jid:chatJid,used_at:null,expires_at:Date.now()+1800000})
  const addVerified=(lid,phone)=>verified.set(lid,phone)
  const query=async(sql,params=[])=>{
    const q=String(sql).trim().replace(/\s+/g,' ').toUpperCase()
    if(q.startsWith('CREATE TABLE')||q==='BEGIN'||q==='COMMIT'||q==='ROLLBACK')return {rows:[]}
    if(q.startsWith('SELECT PHONE_JID FROM VERIFIED_WHATSAPP_LID_LINKS')){
      const phone=verified.get(params[0])
      return {rows:phone?[{phone_jid:phone}]:[]}
    }
    if(q.startsWith('SELECT L.JID, A.JID AS REGISTERED')){
      const c=codes.get(params[0]),a=c&&accounts.get(c.jid)
      return {rows:c&&c.used_at===null&&c.expires_at>params[1]?[{jid:c.jid,registered:a?.jid||null}]:[]}
    }
    if(q.startsWith('SELECT JID,CHAT_JID,USED_AT,EXPIRES_AT FROM WEB_LINK_CODES')){
      const c=codes.get(params[0]);return {rows:c?[{...c}]:[]}
    }
    if(q.startsWith('SELECT JID FROM WEB_PASSWORD_ACCOUNTS WHERE JID=')){
      const a=accounts.get(params[0]);return {rows:a?[{jid:a.jid}]:[]}
    }
    if(q.startsWith('SELECT CHAT_JID FROM WEB_SESSIONS WHERE JID=')){
      const x=[...sessions.values()].filter(v=>v.jid===params[0]&&v.chat_jid)
      return {rows:x.length?[{chat_jid:x.at(-1).chat_jid}]:[]}
    }
    if(q.startsWith('INSERT INTO WEB_PASSWORD_ACCOUNTS')){
      if([...accounts.values()].some(x=>x.phone_e164===params[2]))
        throw Object.assign(new Error('duplicate'),{code:'23505'})
      accounts.set(params[0],{jid:params[0],username:params[1],phone_e164:params[2],password_hash:params[3],password_salt:params[4],chat_jid:params[5]})
      return {rows:[]}
    }
    if(q.startsWith('UPDATE WEB_LINK_CODES SET USED_AT=')){
      const c=codes.get(params[1]);c.used_at=params[0];return {rows:[]}
    }
    if(q.startsWith('DELETE FROM WEB_SESSIONS WHERE JID=')){
      for(const [k,v] of sessions)if(v.jid===params[0])sessions.delete(k)
      return {rows:[]}
    }
    if(q.startsWith('INSERT INTO WEB_SESSIONS')){
      sessions.set(params[0],{jid:params[1],chat_jid:params[2],expires_at:params[3]})
      return {rows:[]}
    }
    if(q.startsWith('SELECT PHONE_E164,CHAT_JID FROM WEB_PASSWORD_ACCOUNTS')){
      const account=accounts.get(params[0]);return {rows:account?[{phone_e164:account.phone_e164,chat_jid:account.chat_jid}]:[]}
    }
    if(q.startsWith('UPDATE WEB_PASSWORD_ACCOUNTS SET PASSWORD_HASH=')){
      const a=accounts.get(params[4]);a.password_hash=params[0];a.password_salt=params[1];a.chat_jid=params[2];a.phone_e164=params[5];return {rows:[]}
    }
    if(q.startsWith('INSERT INTO WEB_AUTH_RATE_LIMITS')){
      let a=limits.get(params[0])
      if(!a||a.window<params[2])a={count:0,window:params[1]}
      a.count++;limits.set(params[0],a);return {rows:[{attempts:a.count}]}
    }
    if(q.startsWith('SELECT JID,PASSWORD_HASH,PASSWORD_SALT,CHAT_JID FROM WEB_PASSWORD_ACCOUNTS')){
      const a=[...accounts.values()].find(x=>x.phone_e164===params[0])
      return {rows:a?[a]:[]}
    }
    if(q.startsWith('DELETE FROM WEB_AUTH_RATE_LIMITS')){
      for(const key of params[0])limits.delete(key)
      return {rows:[]}
    }
    throw new Error('Unexpected SQL: '+q.slice(0,110))
  }
  return {query,connect:async()=>({query,release(){}}),codes,accounts,sessions,addCode,addVerified}
}

const alice='5511999999999@s.whatsapp.net'
const bob='5511988888888@s.whatsapp.net'
const alicePhone='5511999999999'
const bobPhone='5511988888888'

test('number entered must match WhatsApp identity verified by !web; player isolation',async()=>{
  const db=dbFixture()
  db.addCode('ABCD2345',alice,'111111111111@g.us')
  db.addCode('BCDE2345',bob,'222222222222@g.us')
  assert.equal((await getWebCodeMode(db,'ABCD2345')).mode,'register')
  await assert.rejects(registerWebPassword(db,{code:'ABCD2345',phone:bobPhone,password:'Alice secret pass 123'}),/não pertence/)
  assert.equal(db.codes.get(webTokenHash('ABCD2345')).used_at,null)
  const a=await registerWebPassword(db,{code:'ABCD2345',phone:'(11) 99999-9999',password:'Alice secret pass 123'})
  const b=await registerWebPassword(db,{code:'BCDE2345',phone:bobPhone,password:'Bob secret pass 456'})
  assert.equal(db.sessions.get(webTokenHash(a.token)).jid,alice)
  assert.equal(db.sessions.get(webTokenHash(b.token)).jid,bob)
  assert.equal(db.accounts.get(alice).phone_e164,alicePhone)
  assert.notEqual(a.token,b.token)
  await assert.rejects(registerWebPassword(db,{code:'ABCD2345',phone:alicePhone,password:'Another pass 456'}),/Código inválido/)
  await assert.rejects(loginWebPassword(db,{phone:bobPhone,password:'Alice secret pass 123'}),/incorretos/)
  const good=await loginWebPassword(db,{phone:'(11) 98888-8888',password:'Bob secret pass 456'})
  assert.equal(db.sessions.get(webTokenHash(good.token)).jid,bob)
})

test('WhatsApp-only password recovery revokes just that players sessions',async()=>{
  const db=dbFixture()
  db.addCode('ABCD2345',alice);db.addCode('BCDE2345',bob)
  const a=await registerWebPassword(db,{code:'ABCD2345',phone:alicePhone,password:'Alice secret pass 123'})
  const b=await registerWebPassword(db,{code:'BCDE2345',phone:bobPhone,password:'Bob secret pass 456'})
  db.addCode('CDEF2345',alice)
  assert.equal((await getWebCodeMode(db,'CDEF2345')).mode,'recover')
  const a2=await recoverWebPassword(db,{code:'CDEF2345',password:'New secret pass 789'})
  assert.equal(db.sessions.has(webTokenHash(a.token)),false)
  assert.equal(db.sessions.has(webTokenHash(b.token)),true)
  assert.equal(db.sessions.get(webTokenHash(a2.token)).jid,alice)
  await assert.rejects(loginWebPassword(db,{phone:alicePhone,password:'Alice secret pass 123'}),/incorretos/)
  const login=await loginWebPassword(db,{phone:alicePhone,password:'New secret pass 789'})
  assert.equal(db.sessions.get(webTokenHash(login.token)).jid,alice)
})

test('verified LID phone mapping supports registration without using raw LID as phone',async()=>{
  const db=dbFixture(),lid='1234567890123@lid',phone='5511977777777'
  db.addVerified(lid,phone+'@s.whatsapp.net')
  db.addCode('DEFG2345',lid)
  await assert.rejects(registerWebPassword(db,{code:'DEFG2345',phone:alicePhone,password:'Great password 123'}),/não pertence/)
  const a=await registerWebPassword(db,{code:'DEFG2345',phone,password:'Great password 123'})
  assert.equal(db.sessions.get(webTokenHash(a.token)).jid,lid)
  const l=await loginWebPassword(db,{phone,password:'Great password 123'})
  assert.equal(db.sessions.get(webTokenHash(l.token)).jid,lid)
})
