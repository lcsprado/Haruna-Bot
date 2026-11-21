import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createBolsaFamiliaAlphaAutoRunner,bolsaFamiliaAlphaAutoReceipt} from '../src/neon/bolsa-familia-alpha-auto.js'

const JID='5511999999999@s.whatsapp.net'
const OTHER='5511888888888@s.whatsapp.net'
const make=({claim=async()=>({ok:true,cash:300,potions:2}),candidates=async()=>[JID],
  connected=true,send=async()=>{},now=()=>1000000,logs=[],interval=60000}={})=>
  createBolsaFamiliaAlphaAutoRunner({
    claim,candidates,sendDirect:send,isConnected:()=>connected,
    now,logError:(stage,error)=>logs.push(stage+':'+error.message),checkIntervalMs:interval
  })

test('o recibo automático informa que o kit já foi creditado no privado',()=>{
 const text=bolsaFamiliaAlphaAutoReceipt({cash:300,potions:2})
 assert.match(text,/AUXÍLIO AUTOMÁTICO/)
 assert.match(text,/R\$ 300/)
 assert.match(text,/2 Poções Médias/)
 assert.match(text,/Não é necessário solicitar/)
})

test('comando comum pode gerar concessão e exatamente um aviso privado',async()=>{
 const sends=[]
 let claims=0
 const runner=make({claim:async jid=>{claims++;assert.equal(jid,JID);return {ok:true,cash:300,potions:2}},
   send:async(jid,message)=>sends.push({jid,message})})
 const r=await runner.check(JID)
 assert.equal(r.ok,true)
 assert.equal(claims,1)
 assert.equal(sends.length,1)
 assert.equal(sends[0].jid,JID)
 assert.equal((await runner.check(JID)).status,'throttled')
 assert.equal(claims,1)
})

test('nunca envia mensagem para inelegíveis e ignora identidades não verificadas',async()=>{
 let sent=0
 const runner=make({claim:async()=>({ok:false,status:'balance'}),send:async()=>sent++})
 assert.equal((await runner.check(JID)).status,'balance')
 assert.equal((await runner.check('alguem@lid')).status,'offline-or-identity')
 assert.equal(sent,0)
})

test('varredura periódica contempla jogadores que não enviaram comando',async()=>{
 const sends=[]
 const runner=make({
  candidates:async()=>[JID,OTHER],
  claim:async jid=>jid===JID?{ok:true,cash:300,potions:2}:{ok:false,status:'cooldown'},
  send:async(jid)=>sends.push(jid)
 })
 const result=await runner.scan()
 assert.deepEqual(result,{status:'ok',candidates:2,granted:1})
 assert.deepEqual(sends,[JID])
})

test('falha na notificação não repete o crédito; erro do banco não mata varredura',async()=>{
 let claims=0
 const logs=[]
 const runner=make({
  claim:async()=>{claims++;return {ok:true,cash:300,potions:2}},
  send:async()=>{throw Error('offline no envio')},logs
 })
 assert.equal((await runner.check(JID)).ok,true)
 assert.equal(claims,1)
 assert.deepEqual(logs,['notify:offline no envio'])
 assert.equal((await runner.check(JID)).status,'throttled')
})

test('bloqueia sessão desconectada sem chamadas e não expõe controles para usuários anônimos',async()=>{
 let count=0
 const runner=make({connected:false,claim:async()=>{count++},candidates:async()=>{count++}})
 assert.equal((await runner.check(JID)).status,'offline-or-identity')
 assert.equal((await runner.scan()).status,'skipped')
 assert.equal(count,0)
})

test('integração: aviso é privado, não há dependência de comando e existe varredura leve',()=>{
 const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
 const app=src('src/neon/index.js')
 const backend=src('src/neon/bolsa-familia-alpha.js')
 assert.match(app,/createBolsaFamiliaAlphaAutoRunner\(/)
 assert.match(app,/sendDirect:\(jid,text\)=>sock\.sendMessage\(jid,\{text\}\)/)
 assert.match(app,/setInterval\(\(\)=>\{void bolsaFamiliaAlphaAuto\.scan\(\)\},5\*60\*1000\)/)
 assert.match(app,/void bolsaFamiliaAlphaAuto\.check\(sender\)/)
 assert.match(app,/clearInterval\(bolsaFamiliaAlphaAutoTimer\)/)
 assert.match(backend,/activeBolsaFamiliaAlphaCandidates\(limit=20\)/)
 assert.match(backend,/u\.updated_at >= EXTRACT\(EPOCH FROM NOW\(\)\)::bigint-24\*3600/)
 assert.match(backend,/AND tr\.type='transfer'/)
})
