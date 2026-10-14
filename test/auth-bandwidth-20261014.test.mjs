import test from 'node:test'
import assert from 'node:assert/strict'

// Only a fake pool is used below; no connection to any database is opened.
process.env.DATABASE_URL||='postgresql://test@127.0.0.1:1/no_network'
const {useNeonAuthState}=await import('../src/neon/auth.js')
const {db,getGroupSettings,setGroupSetting,setCommunitySetting,setGroupRules,saveSnipeMessage,getLastDeletedSnipe}=await import('../src/neon/db.js')

function fakePool(){
  const writes=[]
  let failNext=false
  const query=async(text,values=[])=>{
    if(typeof text==='object'){values=text.values||[];text=text.text}
    if(text.includes('SELECT 1 FROM trevo_settings'))return {rows:[{seen:1}],rowCount:1}
    if(text.includes('SELECT value FROM auth_creds'))return {rows:[{value:{registered:true,counter:1}}],rowCount:1}
    if(text.includes('SELECT type,id,value FROM auth_keys'))return {rows:[{type:'session',id:'existing',value:{counter:1}}],rowCount:1}
    if(text.includes('INSERT INTO auth_keys')||text.includes('INSERT INTO auth_creds')){
      if(failNext){failNext=false;throw Error('database unavailable')}
      writes.push({text,values:structuredClone(values)})
    }
    return {rows:[],rowCount:0}
  }
  return {query,connect:async()=>({query,release(){}}),writes,fail(){failNext=true}}
}

test('unchanged Signal keys are skipped, while an object mutated by Baileys is persisted',async()=>{
  const pool=fakePool(),{state}=await useNeonAuthState('test',pool)
  const values=await state.keys.get('session',['existing'])
  await state.keys.set({session:{existing:values.existing}})
  assert.equal(pool.writes.length,0)
  values.existing.counter=2
  await state.keys.set({session:{existing:values.existing}})
  assert.equal(pool.writes.length,1)
  assert.equal(JSON.parse(pool.writes[0].values[3][0]).counter,2)
})

test('Signal writes retain order and failed writes do not enter the committed cache',async()=>{
  const pool=fakePool(),{state}=await useNeonAuthState('test',pool)
  await Promise.all([state.keys.set({session:{new:{counter:1}}}),state.keys.set({session:{new:{counter:2}}})])
  assert.deepEqual(pool.writes.map(x=>JSON.parse(x.values[3][0]).counter),[1,2])
  pool.fail()
  await assert.rejects(state.keys.set({session:{retry:{counter:3}}}),/unavailable/)
  assert.equal((await state.keys.get('session',['retry'])).retry,undefined)
  await state.keys.set({session:{retry:{counter:3}}})
  assert.equal((await state.keys.get('session',['retry'])).retry.counter,3)
})

test('credential updates persist each changed snapshot immediately and skip duplicate events',async()=>{
  const pool=fakePool(),{state,saveCreds}=await useNeonAuthState('test',pool)
  await saveCreds();assert.equal(pool.writes.length,0)
  state.creds.counter=2;const first=saveCreds()
  state.creds.counter=3;const second=saveCreds()
  await Promise.all([first,second,saveCreds()])
  assert.deepEqual(pool.writes.map(x=>JSON.parse(x.values[1]).counter),[2,3])
})

test('group settings reads do not write and every local settings mutation invalidates the cache',async()=>{
  const original=db.query
  let reads=0,updates=0,settings={rpg_enabled:true,welcome_enabled:true,rules_text:''}
  db.query=async(text,values=[])=>{
    if(text.startsWith('SELECT * FROM group_settings')){reads++;return {rows:[{...settings}]}}
    if(text.includes('UPDATE group_settings')){
      updates++
      if(text.includes('SET rpg_enabled='))settings.rpg_enabled=values[0]
      if(text.includes('SET welcome_enabled='))settings.welcome_enabled=values[0]
      if(text.includes('SET rules_text='))settings.rules_text=values[0]
      return {rows:[{...settings}]}
    }
    assert.fail('Unexpected write/read: '+text)
  }
  try{
    await Promise.all([getGroupSettings('test@g.us'),getGroupSettings('test@g.us')])
    assert.equal(reads,1);assert.equal(updates,0)
    await setGroupSetting('test@g.us','rpg_enabled',false)
    assert.equal((await getGroupSettings('test@g.us')).rpg_enabled,false)
    await setCommunitySetting('test@g.us','welcome_enabled',false)
    assert.equal((await getGroupSettings('test@g.us')).welcome_enabled,false)
    await setGroupRules('test@g.us','test rules')
    assert.equal((await getGroupSettings('test@g.us')).rules_text,'test rules')
    assert.equal(reads,4);assert.equal(updates,3)
  }finally{db.query=original}
})

test('alternate Snipe callers cannot persist or fetch binary media from Neon',async()=>{
  const original=db.query,calls=[]
  db.query=async(text,values=[])=>{calls.push({text,values});return {rows:[],rowCount:1}}
  try{
    await saveSnipeMessage({chat:'test@g.us',messageId:'m1',mediaBuffer:Buffer.alloc(1024*1024,7)})
    assert.equal(calls.length,1)
    assert.equal(calls[0].values[8],null)
    assert.ok(!calls[0].values.some(x=>Buffer.isBuffer(x)))
    await getLastDeletedSnipe('test@g.us')
    assert.match(calls[1].text,/NULL::text AS media_data/)
    assert.doesNotMatch(calls[1].text,/SELECT \*/)
  }finally{db.query=original}
})
