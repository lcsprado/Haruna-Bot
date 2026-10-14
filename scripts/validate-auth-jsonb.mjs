// Optional integration check. Supply an external PGlite module path; it is never
// installed in the bot or deployed as a dependency. All data below is synthetic.
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {planAuthJsonPatch,authPatchQuery} from '../src/neon/auth-patch.js'

if(!process.argv[2])throw Error('Usage: node scripts/validate-auth-jsonb.mjs /path/to/@electric-sql/pglite/dist/index.js')
const {PGlite}=await import(pathToFileURL(process.argv[2]).href)
const sql=new PGlite()
process.env.DATABASE_URL='postgresql://test@127.0.0.1:1/never_used'
const {useNeonAuthState}=await import('../src/neon/auth.js')
try{
  await sql.exec(`CREATE TABLE auth_keys(session_id text,type text,id text,value jsonb,updated_at timestamptz DEFAULT now(),PRIMARY KEY(session_id,type,id));
    CREATE TABLE auth_creds(session_id text,key text,value jsonb,updated_at timestamptz DEFAULT now(),PRIMARY KEY(session_id,key));
    CREATE TABLE trevo_settings(key text PRIMARY KEY,value jsonb,updated_at bigint);
    INSERT INTO trevo_settings VALUES('signal_sender_key_buffer_repair_v1','{}',0);
    INSERT INTO auth_creds VALUES('test','creds','{"registered":true}',now());`)
  let patchCalls=0,fullCalls=0,failCommit=false,submittedBytes=0
  const query=async(text,values=[])=>{
    if(typeof text==='object'){values=text.values||[];text=text.text}
    if(text==='COMMIT'&&failCommit){failCommit=false;throw Error('injected commit failure')}
    if(text.startsWith('UPDATE auth_keys'))patchCalls++
    if(text.includes('INSERT INTO auth_keys'))fullCalls++
    if(text.startsWith('UPDATE auth_keys')||text.includes('INSERT INTO auth_keys'))submittedBytes+=Buffer.byteLength(JSON.stringify(values))+Buffer.byteLength(text)
    const result=await sql.query(text,values)
    return {...result,rowCount:result.affectedRows??result.rows.length}
  }
  const pool={query,connect:async()=>({query,release(){}})}
  const base={archive:'unchanged'.repeat(18000),current:{counter:1,key:'fixture'},list:[1,2,3]}
  await sql.query('INSERT INTO auth_keys(session_id,type,id,value) VALUES($1,$2,$3,$4::jsonb)',['test','session','large',JSON.stringify(base)])
  const {state}=await useNeonAuthState('test',pool)
  const current=(await state.keys.get('session',['large'])).large
  current.current.counter=2
  const firstBytes=submittedBytes
  await state.keys.set({session:{large:current}})
  assert.equal(patchCalls,1);assert.equal(fullCalls,0)
  const patchBytes=submittedBytes-firstBytes
  assert.ok(patchBytes<Buffer.byteLength(JSON.stringify(current))/50)
  assert.deepEqual((await sql.query("SELECT value FROM auth_keys WHERE id='large'")).rows[0].value,current)

  // A conflicting database revision uses the original complete upsert.
  await sql.query("UPDATE auth_keys SET value=value||'{\"external\":true}'::jsonb WHERE id='large'")
  current.current.counter=3
  await state.keys.set({session:{large:current}})
  assert.equal(fullCalls,1)
  assert.deepEqual((await sql.query("SELECT value FROM auth_keys WHERE id='large'")).rows[0].value,current)

  // A transaction failure does not advance the committed revision/cache.
  current.current.counter=4;failCommit=true
  await assert.rejects(state.keys.set({session:{large:current}}),/injected/)
  assert.equal((await sql.query("SELECT value FROM auth_keys WHERE id='large'")).rows[0].value.current.counter,3)
  await state.keys.set({session:{large:current},'pre-key':{new:{fixture:true}}})
  assert.deepEqual((await sql.query("SELECT value FROM auth_keys WHERE id='large'")).rows[0].value,current)
  assert.equal((await sql.query("SELECT value FROM auth_keys WHERE id='new'")).rows[0].value.fixture,true)

  // Execute a wide range of nested inserts, removals, nulls and array changes in SQL.
  let cases=0
  for(let i=0;i<128;i++){
    const before={archive:'x'.repeat(24000),branch:{unchanged:'y'.repeat(3000),data:{a:1,b:2}},list:[{v:1},{v:2}],"a,b{c}'":1}
    const after=structuredClone(before)
    switch(i%8){
      case 0:after.branch.data.a=i;break
      case 1:delete after.branch.data.b;break
      case 2:after.branch.added={nested:{value:i}};break
      case 3:after.list.push({v:i});break
      case 4:after.list[0].v=i;break
      case 5:after.branch.data=null;break
      case 6:after["a,b{c}'"]=i;break
      case 7:delete after.list;after.added=[null,false,i];break
    }
    await sql.query("UPDATE auth_keys SET value=$1::jsonb WHERE id='large'",[JSON.stringify(before)])
    const revision=(await sql.query("SELECT md5(value::text) AS revision FROM auth_keys WHERE id='large'")).rows[0].revision
    const plan=planAuthJsonPatch(JSON.stringify(before),JSON.stringify(after))
    assert.ok(plan)
    const statement=authPatchQuery('test','session','large',revision,plan.operations)
    await sql.query(statement.text,statement.values)
    assert.deepEqual((await sql.query("SELECT value FROM auth_keys WHERE id='large'")).rows[0].value,after)
    cases++
  }
  console.log(JSON.stringify({status:'pass',sqlCases:cases,revisionFallback:true,rollbackAndRetry:true,mixedBatch:true,
    fixtureFullJsonBytes:Buffer.byteLength(JSON.stringify(base)),fixturePatchSqlAndParameterBytes:patchBytes}))
}finally{await sql.close()}
