import test from 'node:test'
import assert from 'node:assert/strict'
import {planAuthJsonPatch,authPatchQuery,planAuthBufferDelta} from '../src/neon/auth-patch.js'

const large={archive:'unchanged'.repeat(12000),current:{counter:1,key:'fixture'}}
test('large auth changes send a small subtree and leave the archive out of SQL parameters',()=>{
  const next=structuredClone(large);next.current.counter=2
  const encoded=JSON.stringify(next),plan=planAuthJsonPatch(JSON.stringify(large),encoded)
  assert.ok(plan&&plan.payloadBytes<encoded.length/100)
  const query=authPatchQuery('test','session','fixture','known-revision',plan.operations)
  assert.match(query.text,/md5\(value::text\)=\$4/)
  assert.ok(!JSON.stringify(query.values).includes(large.archive))
  assert.deepEqual(query.values.slice(0,4),['test','session','fixture','known-revision'])
})

test('small, broad, malformed and root-type changes retain the original full-write path',()=>{
  assert.equal(planAuthJsonPatch('{"a":1}','{"a":2}'),null)
  assert.equal(planAuthJsonPatch('not json',JSON.stringify(large)),null)
  assert.equal(planAuthJsonPatch(JSON.stringify(large),JSON.stringify({archive:'all changed'.repeat(12000)})),null)
  assert.equal(planAuthJsonPatch(JSON.stringify(large),JSON.stringify(['x'.repeat(30000)])),null)
})

test('field order alone is a semantic no-op and missing branches are added as complete subtrees',()=>{
  const before=JSON.stringify({archive:large.archive,a:1,b:2})
  const reordered=JSON.stringify({b:2,a:1,archive:large.archive})
  assert.equal(planAuthJsonPatch(before,reordered).operations.length,0)
  const next={archive:large.archive,added:{nested:{value:3}}}
  const plan=planAuthJsonPatch(before,JSON.stringify(next))
  assert.ok(plan.operations.some(op=>op.path.join('.')==='added'))
  assert.ok(plan.operations.some(op=>op.remove&&op.path[0]==='a'))
})

test('array size changes replace the array atomically and paths remain bound parameters',()=>{
  const before={archive:large.archive,list:[1,2],"a,b{c}'":1}
  const next={archive:large.archive,list:[1,2,3],"a,b{c}'":2}
  const plan=planAuthJsonPatch(JSON.stringify(before),JSON.stringify(next))
  const query=authPatchQuery('test','session','fixture','revision',plan.operations)
  assert.ok(plan.operations.some(op=>op.path[0]==='list'&&op.value==='[1,2,3]'))
  assert.ok(!query.text.includes("a,b{c}'"))
  assert.ok(query.values.some(value=>Array.isArray(value)&&value[0]==="a,b{c}'"))
})

test('opaque Baileys Buffers preserve every byte across insertions, deletions and Base64 shifts',()=>{
  const before=Buffer.from(Array.from({length:50000},(_,i)=>(i*83+Math.floor(i/64))%256))
  for(let i=0;i<64;i++){
    const after=Buffer.concat([before.subarray(0,100+i),Buffer.from([0,255,128,i].slice(0,1+i%4)),before.subarray(103+i,38000),Buffer.from('fim'+i),before.subarray(38004)])
    const delta=planAuthBufferDelta(before.toString('base64'),after.toString('base64'))
    assert.ok(delta&&delta.payloadBytes<after.length/10)
    const restored=Buffer.concat(delta.pieces.map(p=>p.data!==undefined?Buffer.from(p.data,'base64'):before.subarray(p.start-1,p.start-1+p.length)))
    assert.deepEqual(restored,after)
  }
})

test('Buffer SQL uses guarded byte copies with bound parameters and complete-write fallback',()=>{
  const raw=Buffer.from('unchanged archive '.repeat(20000)),next=Buffer.concat([raw.subarray(0,50),Buffer.from('alterado'),raw.subarray(52)])
  const encode=b=>JSON.stringify({type:'Buffer',data:b.toString('base64')})
  const plan=planAuthJsonPatch(encode(raw),encode(next))
  assert.ok(plan.operations[0].bufferDelta)
  const query=authPatchQuery('test','sender-key','fixture','revision',plan.operations)
  assert.match(query.text,/substring\(decode\(value#>>/)
  assert.ok(Buffer.byteLength(JSON.stringify(query.values))<2000)
  assert.equal(planAuthBufferDelta('not base64','x'.repeat(17000)),null)
  assert.equal(planAuthJsonPatch(encode(raw),encode(Buffer.alloc(raw.length,7))),null)
})
