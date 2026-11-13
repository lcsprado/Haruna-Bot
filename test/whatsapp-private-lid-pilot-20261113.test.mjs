import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createVerifiedPrivateLidRouter} from '../src/neon/whatsapp-private-lid-router.js'

const joao='5511987308687@s.whatsapp.net'
const joaoLid='227410096173143@lid'
const other='5511948523167@s.whatsapp.net'
const group='120363429534634131@g.us'

const fakeDb=({enabled=true,mapped=true,wrong=false}={})=>{
 const calls=[]
 const db={query:async(sql,params)=>{
   calls.push({sql,params})
   if(sql.includes('FROM trevo_settings'))
     return {rows:[{value:{enabled,phone_jid:joao,lid_jid:wrong?'999999999999999@lid':joaoLid}}]}
   if(sql.includes('FROM verified_whatsapp_lid_links'))
     return {rows:mapped&&!wrong?[{'?column?':1}]:[]}
   throw Error('Unexpected SQL')
 }}
 return {db,calls}
}
test('somente contato piloto com mapeamento confirmado usa LID, os demais continuam iguais',async()=>{
 const f=fakeDb()
 const router=createVerifiedPrivateLidRouter({db:f.db})
 assert.deepEqual(await router.resolve(joao),{chat:joaoLid,mode:'verified-lid'})
 assert.deepEqual(await router.resolve(other),{chat:other,mode:'unchanged'})
 assert.deepEqual(await router.resolve(group),{chat:group,mode:'unchanged'})
 assert.ok(f.calls.every(x=>!/(UPDATE|INSERT|DELETE)/i.test(x.sql)))
 assert.equal(f.calls.filter(x=>x.sql.includes('FROM verified_whatsapp_lid_links')).length,1)
})
test('não redireciona se piloto desligado, mapping inválido, ausente ou o banco falhar',async()=>{
 for(const arg of [{enabled:false},{mapped:false},{wrong:true}]){
  const f=fakeDb(arg)
  const route=await createVerifiedPrivateLidRouter({db:f.db}).resolve(joao)
  assert.equal(route.chat,joao)
 }
 const route=await createVerifiedPrivateLidRouter({db:{query:async()=>{throw Error('offline')}}}).resolve(joao)
 assert.equal(route.chat,joao)
})
test('consultas configuradas não buscam nem alteram chaves Signal',async()=>{
 const f=fakeDb(),router=createVerifiedPrivateLidRouter({db:f.db})
 await router.resolve(joao)
 for(const c of f.calls){
   assert.doesNotMatch(c.sql,/auth_keys|auth_creds|UPDATE|DELETE|INSERT/)
   assert.doesNotMatch(JSON.stringify(c.params),/token|password|secret/i)
 }
})
test('router é integrado somente ao envio de texto, com rastreio de sucesso',()=>{
 const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(source,/createVerifiedPrivateLidRouter\(/)
 assert.match(source,/await privateLidRouter\.resolve\(chat\)/)
 assert.match(source,/await sendWithoutQueue\(route\.chat,content,options\)/)
 assert.match(source,/await durableOutboundRetry\.remember\(sent,\{chat:route\.chat,content\}\)/)
 assert.match(source,/route\.mode==='verified-lid'/)
})
