import test from 'node:test'
import assert from 'node:assert/strict'
import {webTokenHash,makeWebPassword} from '../src/neon/web-password-auth.js'
import {getWebCodeMode,registerWebPassword,recoverWebPassword,loginWebPassword} from '../src/neon/web-password-accounts.js'

function dbFixture(){
  const codes=new Map(),accounts=new Map(),sessions=new Map(),limits=new Map(),lidPairs=new Map()
  const addCode=(code,jid,chatJid=null)=>{
    codes.set(webTokenHash(code),{jid,chat_jid:chatJid,used_at:null,expires_at:Date.now()+1800000})
  }
  const query=async(sql,params=[])=>{
    const q=String(sql).trim().replace(/\s+/g,' ').toUpperCase()
    if(q.startsWith('CREATE TABLE'))return {rows:[]}
    if(['BEGIN','COMMIT','ROLLBACK'].includes(q))return {rows:[]}
    if(q.startsWith('SELECT PHONE_JID FROM VERIFIED_WHATSAPP_LID_LINKS')){
      const pn=lidPairs.get(params[0]);return {rows:pn?[{phone_jid:pn}]:[]}
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
      const s=[...sessions.values()].filter(x=>x.jid===params[0]&&x.chat_jid)
      return {rows:s.length?[{chat_jid:s[s.length-1].chat_jid}]:[]}
    }
    if(q.startsWith('INSERT INTO WEB_PASSWORD_ACCOUNTS')){
      if([...accounts.values()].some(x=>x.username===params[1]||x.phone_e164===params[2]))
        throw Object.assign(new Error('duplicate'),{code:'23505'})
      accounts.set(params[0],{
        jid:params[0],username:params[1],phone_e164:params[2],
        password_hash:params[3],password_salt:params[4],chat_jid:params[5]
      })
      return {rows:[]}
    }
    if(q.startsWith('UPDATE WEB_LINK_CODES SET USED_AT=')){
      const c=codes.get(params[1]);c.used_at=params[0];return {rows:[]}
    }
    if(q.startsWith('DELETE FROM WEB_SESSIONS WHERE JID=')){
      for(const [key,value] of sessions)if(value.jid===params[0])sessions.delete(key)
      return {rows:[]}
    }
    if(q.startsWith('INSERT INTO WEB_SESSIONS')){
      sessions.set(params[0],{jid:params[1],chat_jid:params[2],expires_at:params[3]})
      return {rows:[]}
    }
    if(q.startsWith('SELECT USERNAME,CHAT_JID FROM WEB_PASSWORD_ACCOUNTS')){
      const a=accounts.get(params[0]);return {rows:a?[{username:a.username,chat_jid:a.chat_jid}]:[]}
    }
    if(q.startsWith('UPDATE WEB_PASSWORD_ACCOUNTS SET PASSWORD_HASH=')){
      const a=accounts.get(params[5])
      if([...accounts.values()].some(x=>x.jid!==params[5]&&x.phone_e164===params[2]))
        throw Object.assign(new Error('duplicate'),{code:'23505'})
      Object.assign(a,{password_hash:params[0],password_salt:params[1],phone_e164:params[2],chat_jid:params[3]})
      return {rows:[]}
    }
    if(q.startsWith('INSERT INTO WEB_AUTH_RATE_LIMITS')){
      let a=limits.get(params[0])
      if(!a||a.window<params[2])a={count:0,window:params[1]}
      a.count++;limits.set(params[0],a);return {rows:[{attempts:a.count}]}
    }
    if(q.startsWith('SELECT JID,USERNAME,PHONE_E164,PASSWORD_HASH,PASSWORD_SALT,CHAT_JID FROM WEB_PASSWORD_ACCOUNTS')){
      const matches=[...accounts.values()].filter(x=>x.phone_e164===params[0]||(!x.phone_e164&&x.jid===params[1]))
      return {rows:matches.slice(0,2)}
    }
    if(q.startsWith('DELETE FROM WEB_AUTH_RATE_LIMITS')){
      for(const key of params[0])limits.delete(key)
      return {rows:[]}
    }
    throw new Error('Unexpected SQL: '+q.slice(0,130))
  }
  return {query,connect:async()=>({query,release(){}}),codes,accounts,sessions,addCode,lidPairs}
}

test('registration phone is derived from one-time WhatsApp proof, never user input',async()=>{
  const db=dbFixture()
  const alice='5511999991234@s.whatsapp.net',bob='5511988884567@s.whatsapp.net'
  db.addCode('ABCD2345',alice,'111111111111@g.us')
  db.addCode('BCDE2345',bob,'222222222222@g.us')
  assert.deepEqual(await getWebCodeMode(db,'ABCD2345'),{mode:'register',phoneHint:'••••1234'})
  const a=await registerWebPassword(db,{code:'ABCD2345',phone:'5511988884567',password:'Alice secret pass 123'})
  const b=await registerWebPassword(db,{code:'BCDE2345',password:'Bob secret pass 456'})
  assert.equal(a.phone,'5511999991234')
  assert.equal(b.phone,'5511988884567')
  assert.equal(db.sessions.get(webTokenHash(a.token)).jid,alice)
  assert.equal(db.sessions.get(webTokenHash(b.token)).jid,bob)
  assert.notEqual(a.token,b.token)
  await assert.rejects(registerWebPassword(db,{code:'ABCD2345',password:'Another pass 456'}),/Código inválido/)
  await assert.rejects(loginWebPassword(db,{phone:'5511988884567',password:'Alice secret pass 123'}),/incorretos/)
  const good=await loginWebPassword(db,{phone:'(11) 98888-4567',password:'Bob secret pass 456'})
  assert.equal(db.sessions.get(webTokenHash(good.token)).jid,bob)
})

test('recovery requires WhatsApp proof and revokes only sessions from the recovered JID',async()=>{
  const db=dbFixture()
  const alice='5511999991234@s.whatsapp.net',bob='5511988884567@s.whatsapp.net'
  db.addCode('ABCD2345',alice);db.addCode('BCDE2345',bob)
  const a=await registerWebPassword(db,{code:'ABCD2345',password:'Alice secret pass 123'})
  const b=await registerWebPassword(db,{code:'BCDE2345',password:'Bob secret pass 456'})
  db.addCode('CDEF2345',alice)
  assert.equal((await getWebCodeMode(db,'CDEF2345')).mode,'recover')
  const a2=await recoverWebPassword(db,{code:'CDEF2345',password:'New secret pass 789'})
  assert.equal(db.sessions.has(webTokenHash(a.token)),false)
  assert.equal(db.sessions.has(webTokenHash(b.token)),true)
  assert.equal(db.sessions.get(webTokenHash(a2.token)).jid,alice)
  await assert.rejects(loginWebPassword(db,{phone:'11999991234',password:'Alice secret pass 123'}),/incorretos/)
  const login=await loginWebPassword(db,{phone:'11999991234',password:'New secret pass 789'})
  assert.equal(db.sessions.get(webTokenHash(login.token)).jid,alice)
})

test('legacy username and password stay intact while phone becomes the login key',async()=>{
  const db=dbFixture(),jid='5511999991234@s.whatsapp.net'
  const secret=await makeWebPassword('Legacy password 123')
  db.accounts.set(jid,{jid,username:'original_name',phone_e164:null,password_hash:secret.passwordHash,password_salt:secret.passwordSalt,chat_jid:null})
  const login=await loginWebPassword(db,{phone:'5511999991234',password:'Legacy password 123'})
  assert.equal(db.sessions.get(webTokenHash(login.token)).jid,jid)
  assert.equal(db.accounts.get(jid).username,'original_name')
})

test('verified WhatsApp LID mapping supports phone login without exposing numeric LID',async()=>{
  const db=dbFixture(),jid='555512345678@lid'
  db.lidPairs.set(jid,'5511999991234@s.whatsapp.net')
  db.addCode('ABCD2345',jid)
  assert.deepEqual(await getWebCodeMode(db,'ABCD2345'),{mode:'register',phoneHint:'••••1234'})
  const account=await registerWebPassword(db,{code:'ABCD2345',password:'A good password 123'})
  assert.equal(account.phone,'5511999991234')
  const session=await loginWebPassword(db,{phone:'11999991234',password:'A good password 123'})
  assert.equal(db.sessions.get(webTokenHash(session.token)).jid,jid)
})
