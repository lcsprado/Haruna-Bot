import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable,PassThrough} from 'node:stream'
import {EventEmitter} from 'node:events'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createTtlCache,createByteBudget,createMessageDeduplicator,declaredMediaBytes,readBoundedMedia,downloadBoundedMedia,createSerializedSaver,scheduleUntil} from '../src/neon/resource-guards.js'
import {trackBandwidthStream,bandwidthSnapshot} from '../src/neon/bandwidth.js'

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('concurrent metadata reads share one load, expire, and do not cache failures',async()=>{
  let clock=0,calls=0
  const cache=createTtlCache({ttlMs:100,maxEntries:2,now:()=>clock})
  const load=async()=>{calls++;await delay(1);return {version:calls}}
  const [a,b]=await Promise.all([cache.get('group',load),cache.get('group',load)])
  assert.strictEqual(a,b);assert.equal(calls,1)
  clock=101;assert.equal((await cache.get('group',load)).version,2)
  await assert.rejects(cache.get('bad',()=>{throw Error('offline')}),/offline/)
  assert.equal(await cache.get('bad',()=>3),3)
  await cache.get('third',()=>4);assert.equal(cache.size,2)
})

test('membership invalidation during a pending read never repopulates stale metadata',async()=>{
  const cache=createTtlCache()
  let finish
  const old=cache.get('group',()=>new Promise(resolve=>{finish=resolve}))
  await Promise.resolve()
  cache.delete('group')
  assert.equal(await cache.get('group',()=> 'new member'), 'new member')
  finish('old members');await old
  assert.equal(await cache.get('group',()=>assert.fail('unexpected reload')), 'new member')
})

test('rolling media budget cannot be bypassed by crossing an hourly boundary',()=>{
  let clock=0
  const budget=createByteBudget(100,{windowMs:1000,now:()=>clock})
  assert.equal(budget.reserve(70),true)
  clock=900;assert.equal(budget.reserve(30),true)
  clock=1001;assert.equal(budget.remaining,70)
  assert.equal(budget.reserve(71),false)
  assert.equal(budget.reserve(70),true)
  assert.equal(budget.reserve(-1),false)
  clock=1901;assert.equal(budget.remaining,30)
})

test('message deduplication permits immediate legitimate commands and bounds memory',()=>{
  let clock=0
  const accept=createMessageDeduplicator({ttlMs:100,maxEntries:2,now:()=>clock})
  assert.equal(accept('group|player|command1'),true)
  assert.equal(accept('group|player|command2'),true)
  assert.equal(accept('group|player|command1'),false)
  assert.equal(accept('group|other|command3'),true)
  // The oldest key is evicted at capacity rather than letting the map grow forever.
  assert.equal(accept('group|player|command1'),true)
  clock=101;assert.equal(accept('group|player|command1'),true)
})

test('missing, unsafe or excessive declared sizes are rejected before download',()=>{
  for(const value of [undefined,0,-1,Infinity,Number.MAX_SAFE_INTEGER+1,'not a size',513]){
    assert.throws(()=>declaredMediaBytes({fileLength:value},512))
  }
  assert.equal(declaredMediaBytes({fileLength:{toString:()=> '512'}},512),512)
})

test('media reader stops and closes a stream that exceeds the declared length',async()=>{
  let measured=0
  const stream=Readable.from([Buffer.alloc(32),Buffer.alloc(32)])
  await assert.rejects(readBoundedMedia(stream,40,{onBytes:n=>{measured+=n}}),/excedeu/)
  assert.equal(stream.destroyed,true);assert.equal(measured,64)
  assert.deepEqual(await readBoundedMedia(Readable.from([Buffer.from('safe')]),4),Buffer.from('safe'))
})

test('media limit failures also abort the underlying HTTP download',async()=>{
  let signal
  await assert.rejects(downloadBoundedMedia(async abortSignal=>{
    signal=abortSignal;return Readable.from([Buffer.alloc(100)])
  },10),/excedeu/)
  assert.equal(signal.aborted,true)
})

test('a stalled media stream times out instead of holding the command worker forever',async()=>{
  const stream=new PassThrough()
  const result=assert.rejects(readBoundedMedia(stream,100,{timeoutMs:10}),/Tempo/)
  await Promise.all([result,delay(20)])
  assert.equal(stream.destroyed,true)
})

test('credential snapshots keep write order, skip exact repeats and retry failed writes',async()=>{
  const writes=[];let fail=true,skipped=0
  const save=createSerializedSaver('initial',async value=>{
    if(value==='retry'&&fail){fail=false;throw Error('temporary')}
    await delay(1);writes.push(value)
  },{onSkip:()=>skipped++})
  await Promise.all([save('one'),save('two'),save('two')])
  assert.deepEqual(writes,['one','two']);assert.equal(skipped,1)
  await assert.rejects(save('retry'),/temporary/)
  await save('retry');assert.deepEqual(writes,['one','two','retry'])
})

test('dated scheduler settles once after expiry and retries an unavailable connection',async()=>{
  let calls=0
  const stop=scheduleUntil(async()=>{calls++;return calls>1},0,{intervalMs:5,startupMs:1})
  try{
    await delay(35)
    assert.equal(calls,2)
  }finally{stop()}
})

test('socket accounting does not double-count snapshots, closed streams or registrations',()=>{
  const before=bandwidthSnapshot().socketBytes.postgres
  const socket=Object.assign(new EventEmitter(),{bytesRead:30,bytesWritten:40})
  trackBandwidthStream('postgres',socket);trackBandwidthStream('postgres',socket)
  assert.equal(bandwidthSnapshot().socketBytes.postgres.sent-before.sent,40)
  socket.bytesWritten=60;socket.bytesRead=50;socket.emit('close')
  assert.equal(bandwidthSnapshot().socketBytes.postgres.sent-before.sent,60)
  assert.equal(bandwidthSnapshot().socketBytes.postgres.received-before.received,50)
})

test('unrelated progression and daily data remain frozen while approved hero mechanics evolve',()=>{
  const expected={
    'progression.js':'1ec656d6b60f1148a46f1d0b6ec8715308aa5585e97731d9280cb91135658772',
    'daily-v2.js':'9d2fc74f2fdd58f9e8ebf76c8d3ed326dc97b54943c3282d7712efd02805036c'
  }
  for(const [file,hash] of Object.entries(expected)){
    assert.equal(createHash('sha256').update(readFileSync(new URL('../src/neon/'+file,import.meta.url))).digest('hex'),hash,file)
  }
  const reserved=readFileSync(new URL('../docs/eventos/calcanhar-de-aquiles-RESERVADO.md',import.meta.url),'utf8')
  assert.match(reserved,/Status: PLANEJADO \/ BLOQUEADO/)
  const runtime=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.doesNotMatch(runtime,/calcanhar|aquiles/i)
  assert.match(runtime,/syncFullHistory:false/)
  assert.doesNotMatch(runtime,/shouldSyncHistoryMessage:\(\)=>false/)
  assert.doesNotMatch(runtime.slice(runtime.indexOf("sock.ev.on('messages.upsert'")),/cacheIncomingMessage\(sock,msg\)/)
})
