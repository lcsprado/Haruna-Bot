import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {randomBytes,createCipheriv,createHmac} from 'node:crypto'
import {getHttpStream,getMediaKeys,downloadEncryptedContent} from 'baileys'
import {downloadBoundedMedia} from '../src/neon/resource-guards.js'

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function localServer(t,handler){
  const server=http.createServer(handler)
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))})
  return 'http://127.0.0.1:'+server.address().port
}
async function encryptedFixture(plain){
  const keys=await getMediaKeys(randomBytes(32),'image')
  const cipher=createCipheriv('aes-256-cbc',keys.cipherKey,keys.iv)
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()])
  const mac=createHmac('sha256',keys.macKey).update(keys.iv).update(encrypted).digest().subarray(0,10)
  return {keys,body:Buffer.concat([encrypted,mac])}
}

test('actual Baileys transport returns complete bounded encrypted media',async t=>{
  const plain=Buffer.from('valid media fixture'),{keys,body}=await encryptedFixture(plain)
  const url=await localServer(t,(_req,res)=>{res.writeHead(200,{'content-length':body.length});res.end(body)})
  const output=await downloadBoundedMedia(signal=>downloadEncryptedContent(url,keys,{options:{signal}}),plain.length)
  assert.deepEqual(output,plain)
})

test('actual Baileys HTTP request aborts while waiting for stalled response headers',{timeout:3000},async t=>{
  let closed=false
  const url=await localServer(t,(req)=>{req.on('close',()=>{closed=true})})
  await assert.rejects(downloadBoundedMedia(signal=>getHttpStream(url,{signal}),128,{timeoutMs:250}),/abort/i)
  await delay(30)
  assert.equal(closed,true)
})

test('oversized Baileys media stops its upstream HTTP transfer, not only the decoded stream',{timeout:3000},async t=>{
  const {keys,body}=await encryptedFixture(Buffer.alloc(128*1024,7))
  let sent=0,closed=false
  const url=await localServer(t,(_req,res)=>{
    res.writeHead(200,{'content-type':'application/octet-stream','content-length':body.length})
    const timer=setInterval(()=>{
      const end=Math.min(sent+256,body.length)
      res.write(body.subarray(sent,end));sent=end
      if(sent===body.length){clearInterval(timer);res.end()}
    },5)
    res.on('close',()=>{closed=true;clearInterval(timer)})
  })
  await assert.rejects(downloadBoundedMedia(signal=>downloadEncryptedContent(url,keys,{options:{signal}}),64),/excedeu/)
  await delay(30)
  assert.equal(closed,true)
  assert.ok(sent<body.length,'the HTTP server must not finish sending the oversized file')
})
