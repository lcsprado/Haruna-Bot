import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {webAuthClientIp,webAuthThrottleKey,consumeWebAuthAttempt} from '../src/neon/web-auth-throttle.js'

const source=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const moduleSource=readFileSync(new URL('../src/neon/web-auth-throttle.js',import.meta.url),'utf8')
function request(ip='192.0.2.44',forwarded=ip){
 return {headers:{'x-forwarded-for':forwarded},socket:{remoteAddress:'10.0.0.2'}}
}
function fixture(){
 const counters=new Map(),requests=[]
 return {requests,counters,
 async query(sql,params){
  assert.match(sql,/ON CONFLICT\(scope_hash\) DO UPDATE SET/)
  assert.match(sql,/RETURNING attempts/)
  assert.equal(params.length,2)
  assert.match(params[0],/^[a-f0-9]{64}$/)
  requests.push({sql,params})
  const [key,windowStart]=params
  const old=counters.get(key)
  const count=old&&old.windowStart===windowStart?old.count+1:1
  counters.set(key,{windowStart,count})
  return {rows:[{attempts:count}]}
 }}
}
test('troca de codigo valida em limites de cliente e global compartilhados',async()=>{
 const db=fixture(),time=300000
 for(let i=0;i<15;i++)assert.equal((await consumeWebAuthAttempt(db,request(),time,'test-secret')).allowed,true)
 await assert.rejects(consumeWebAuthAttempt(db,request(),time,'test-secret'),err=>err.code==='WEB_AUTH_RATE_LIMITED'&&err.retryAfterSeconds===300)
 assert.equal(db.requests.length,31,'a tentativa bloqueada nem deve consumir limite global')
 assert.equal(db.counters.size,2)
})
test('limites de clientes diferentes nao bloqueiam jogadores no mesmo servidor',async()=>{
 const db=fixture(),time=300000
 for(let i=0;i<15;i++)await consumeWebAuthAttempt(db,request('192.0.2.4'),time,'test-secret')
 await assert.rejects(consumeWebAuthAttempt(db,request('192.0.2.4'),time,'test-secret'),/Muitas tentativas/)
 assert.equal((await consumeWebAuthAttempt(db,request('198.51.100.5'),time,'test-secret')).allowed,true)
 assert.equal(db.counters.size,3)
})
test('janela de 5 minutos reabre as tentativas sem reiniciar o servidor',async()=>{
 const db=fixture()
 for(let i=0;i<15;i++)await consumeWebAuthAttempt(db,request(),300001,'test-secret')
 await assert.rejects(consumeWebAuthAttempt(db,request(),300001,'test-secret'),err=>err.code==='WEB_AUTH_RATE_LIMITED')
 assert.equal((await consumeWebAuthAttempt(db,request(),600001,'test-secret')).allowed,true)
})
test('limite global detem rotacao de origem de ataques, mesmo com IPs variados',async()=>{
 const db=fixture(),time=300001
 for(let i=0;i<300;i++){
  assert.equal((await consumeWebAuthAttempt(db,request('192.0.2.'+(i%256)),time,'test-secret')).allowed,true)
 }
 await assert.rejects(consumeWebAuthAttempt(db,request('203.0.113.10'),time,'test-secret'),err=>err.code==='WEB_AUTH_RATE_LIMITED')
})
test('endereco encaminhado usa ultimo hop, nao o primeiro controlado pelo cliente',()=>{
 const req=request('198.51.100.12','203.0.113.111, 198.51.100.12')
 assert.equal(webAuthClientIp(req),'198.51.100.12')
 const invalid=request('198.51.100.12','forged-client')
 assert.equal(webAuthClientIp(invalid),'10.0.0.2')
 assert.equal(webAuthClientIp({headers:{},socket:{}}),'unidentified-peer')
})
test('chaves no banco nunca contem IP bruto nem codigo !web',()=>{
 const key=webAuthThrottleKey('client','192.0.2.5','test-secret')
 assert.match(key,/^[a-f0-9]{64}$/)
 assert.doesNotMatch(key,/192\.0\.2\.5/)
 assert.notEqual(key,webAuthThrottleKey('client','192.0.2.6','test-secret'))
 assert.notEqual(key,webAuthThrottleKey('global','192.0.2.5','test-secret'))
})
test('the old code-only exchange endpoint is permanently disabled with HTTP 410',()=>{
 const start=source.indexOf("if(req.method==='POST' && url.pathname==='/api/v1/auth/exchange')")
 const end=source.indexOf('const session=await authSession(req)',start)
 assert.ok(start>0&&end>start)
 const route=source.slice(start,end)
 assert.match(route,/json\(res,410,\{ok:false,error:/)
 assert.doesNotMatch(route,/exchangeWebLinkCode\(body\.code\)/)
 assert.doesNotMatch(route,/consumeWebAuthAttempt\(db,req\)/)
 assert.match(source,/ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'legacy'/)
 assert.match(source,/s\.auth_method=\\'password\\'/)
 assert.match(source,/JOIN web_password_accounts/)
})
