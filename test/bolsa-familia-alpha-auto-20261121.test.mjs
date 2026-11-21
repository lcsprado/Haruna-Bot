import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createBolsaFamiliaAlphaAutoRunner,bolsaFamiliaAlphaAutoReceipt} from '../src/neon/bolsa-familia-alpha-auto.js'

const JID='5511999999999@s.whatsapp.net'
const OTHER='5511888888888@s.whatsapp.net'
const GROUP='120363429534634131@g.us'
const make=({claim=async()=>({ok:true,cash:600,potions:2}),candidates=async()=>[{jid:JID,chat:GROUP}],
  connected=true,send=async()=>{},now=()=>1000000,logs=[],interval=60000}={})=>
  createBolsaFamiliaAlphaAutoRunner({
    claim,candidates,sendGroup:send,isConnected:()=>connected,
    now,logError:(stage,error)=>logs.push(stage+':'+error.message),checkIntervalMs:interval
  })

test('recibo chamativo no grupo anuncia apenas kit efetivamente creditado',()=>{
 const text=bolsaFamiliaAlphaAutoReceipt({cash:600,potions:2},JID)
 assert.match(text,/BOLSA FAMÍLIA ALPHA/)
 assert.match(text,/BENEFÍCIO LIBERADO/)
 assert.match(text,/R\$ 600/)
 assert.match(text,/2 POÇÕES MÉDIAS/)
 assert.match(text,/JÁ CREDITADO NA CONTA/)
 assert.match(text,/@5511999999999/)
 assert.doesNotMatch(text,/saldo atual/i)
})

test('um crédito efetivo gera uma mensagem no grupo com menção e nenhuma mensagem privada',async()=>{
 const sends=[]
 let claims=0
 const runner=make({claim:async jid=>{claims++;assert.equal(jid,JID);return {ok:true,cash:600,potions:2}},
   send:async(chat,message,mentions)=>sends.push({chat,message,mentions})})
 const result=await runner.check(JID,{chat:GROUP})
 assert.equal(result.ok,true)
 assert.equal(claims,1)
 assert.equal(sends.length,1)
 assert.equal(sends[0].chat,GROUP)
 assert.deepEqual(sends[0].mentions,[JID])
 assert.match(sends[0].message,/BENEFÍCIO LIBERADO/)
 assert.equal((await runner.check(JID,{chat:GROUP})).status,'throttled')
 assert.equal(claims,1)
})

test('jogador não elegível não gera nenhum aviso no grupo',async()=>{
 let sent=0
 const runner=make({claim:async()=>({ok:false,status:'balance'}),send:async()=>sent++})
 assert.equal((await runner.check(JID,{chat:GROUP})).status,'balance')
 assert.equal((await runner.check('alguem@lid',{chat:GROUP})).status,'offline-or-identity')
 assert.equal(sent,0)
})

test('sem grupo válido não concede automaticamente e nunca usa o privado',async()=>{
 let count=0
 const runner=make({claim:async()=>{count++;return {ok:true,cash:600,potions:2}}})
 assert.equal((await runner.check(JID)).status,'no-group')
 assert.equal((await runner.check(JID,{chat:JID})).status,'no-group')
 assert.equal(count,0)
})

test('varredura leve procura grupo de origem e publica apenas quando aprovado',async()=>{
 const sends=[]
 const runner=make({
  candidates:async()=>[{jid:JID,chat:GROUP},{jid:OTHER,chat:GROUP}],
  claim:async jid=>jid===JID?{ok:true,cash:600,potions:2}:{ok:false,status:'cooldown'},
  send:async(chat,text,mentions)=>sends.push({chat,mentions})
 })
 const result=await runner.scan()
 assert.deepEqual(result,{status:'ok',candidates:2,granted:1})
 assert.deepEqual(sends,[{chat:GROUP,mentions:[JID]}])
})

test('falha no envio não repete o crédito no período de throttling',async()=>{
 let claims=0
 const logs=[]
 const runner=make({claim:async()=>{claims++;return {ok:true,cash:600,potions:2}},
   send:async()=>{throw Error('erro de rede')},logs})
 assert.equal((await runner.check(JID,{chat:GROUP})).ok,true)
 assert.equal(claims,1)
 assert.deepEqual(logs,['notify:erro de rede'])
 assert.equal((await runner.check(JID,{chat:GROUP})).status,'throttled')
})

test('offline não concede nem notifica',async()=>{
 let calls=0
 const runner=make({connected:false,claim:async()=>{calls++},candidates:async()=>{calls++}})
 assert.equal((await runner.check(JID,{chat:GROUP})).status,'offline-or-identity')
 assert.equal((await runner.scan()).status,'skipped')
 assert.equal(calls,0)
})

test('integração usa anúncio no grupo apenas após benefício elegível; 5min scan',()=>{
 const source=path=>readFileSync(new URL('../'+path,import.meta.url'),'utf8')
 const wa=source('src/neon/index.js')
 const backend=source('src/neon/bolsa-familia-alpha.js')
 const runner=source('src/neon/bolsa-familia-alpha-auto.js')
 assert.match(wa,/sendGroup:\(chat,text,mentions\)=>sock\.sendMessage\(chat,\{text,mentions\}\)/)
 assert.match(wa,/bolsaFamiliaAlphaAuto\.check\(sender,\{chat\}\)/)
 assert.match(wa,/setInterval\(\(\)=>\{void bolsaFamiliaAlphaAuto\.scan\(\)\},5\*60\*1000\)/)
 assert.match(wa,/clearInterval\(bolsaFamiliaAlphaAutoTimer\)/)
 assert.match(backend,/activeBolsaFamiliaAlphaCandidates\(limit=20\)/)
 assert.match(backend,/SELECT u\.jid, grp\.chat_jid/)
 assert.match(backend,/FROM group_activity ga/)
 assert.match(backend,/AND tr\.type='transfer'/)
 assert.match(runner,/if\(result\?\.ok\)/)
 assert.match(runner,/await sendGroup\(chat,bolsaFamiliaAlphaAutoReceipt\(result,jid\),\[jid\]\)/)
})
