import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {isAlphaWebPath,serveAlphaWeb} from '../src/neon/web-canary-static.js'
import {acquireRedisRuntimeLease} from '../src/neon/runtime-redis-lease.js'

test('Web canary exposes the existing root assets but not private paths',()=>{
  for(const path of ['/rpg','/rpg/','/app.js','/styles.css','/sw.js','/assets/pets/leao.webp','/rpg/assets/pets/leao.webp'])
    assert.equal(isAlphaWebPath(path),true,path)
  for(const path of ['/health','/','/api/v1/me/bootstrap','/api/v1/me/live','/rpg/assets/../x','/rpg/assets/x/./y','/.env'])
    assert.equal(isAlphaWebPath(path),false,path)
})

test('Web canary serves real frontend without a database',async()=>{
  const response={status:null,headers:null,body:null,
    writeHead(code,headers){this.status=code;this.headers=headers},
    end(value){this.body=value}}
  assert.equal(await serveAlphaWeb({},response,'/app.js'),true)
  assert.equal(response.status,200)
  assert.match(String(response.body),/async function sync\(/)
  assert.equal(response.headers['cache-control'],'no-cache')
  const image={...response,status:null,headers:null,body:null}
  assert.equal(await serveAlphaWeb({},image,'/assets/pets/leao.webp'),true)
  assert.equal(image.status,200)
  assert.equal(image.headers['cache-control'],'public, max-age=86400')
})

test('Web bundle has no unconditional 15-second full synchronization',async()=>{
  const source=await readFile(new URL('../web/app.js',import.meta.url),'utf8')
  assert.doesNotMatch(source,/setInterval\(\(\)=>\{\s*if\(!document\.hidden && ui\.token && !ui\.syncing\) sync\(true\);\s*\},15000\)/)
  assert.match(source,/\/api\/v1\/me\/live/)
  assert.match(source,/\},60000\)/)
})

test('Redis lease fails closed when credentials are absent',async()=>{
  const oldUrl=process.env.UPSTASH_REDIS_REST_URL
  const oldToken=process.env.UPSTASH_REDIS_REST_TOKEN
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  try{await assert.rejects(acquireRedisRuntimeLease('alpha-test-fail'),/não configurados/)}
  finally{
    if(oldUrl!==undefined)process.env.UPSTASH_REDIS_REST_URL=oldUrl
    if(oldToken!==undefined)process.env.UPSTASH_REDIS_REST_TOKEN=oldToken
  }
})

test('Redis lease uses atomic NX/PX and does not contact PostgreSQL',async()=>{
  const oldFetch=globalThis.fetch
  const oldUrl=process.env.UPSTASH_REDIS_REST_URL
  const oldToken=process.env.UPSTASH_REDIS_REST_TOKEN
  const requests=[]
  process.env.UPSTASH_REDIS_REST_URL='https://example.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN='test-only'
  globalThis.fetch=async(_url,options)=>{
    requests.push(JSON.parse(options.body))
    return {ok:true,json:async()=>({result:'OK'})}
  }
  try{
    await acquireRedisRuntimeLease('alpha-lease-unique-test')
    assert.equal(requests.length,1)
    assert.equal(requests[0][0],'SET')
    assert.equal(requests[0][3],'NX')
    assert.equal(requests[0][4],'PX')
    assert.equal(requests[0][5],60000)
  }finally{
    globalThis.fetch=oldFetch
    if(oldUrl===undefined)delete process.env.UPSTASH_REDIS_REST_URL
    else process.env.UPSTASH_REDIS_REST_URL=oldUrl
    if(oldToken===undefined)delete process.env.UPSTASH_REDIS_REST_TOKEN
    else process.env.UPSTASH_REDIS_REST_TOKEN=oldToken
  }
})
