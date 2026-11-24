import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createWhatsAppOfflineRecovery} from '../src/neon/whatsapp-offline-recovery.js'

function clockFixture(){
  let tasks=[],counter=0,connected=true,buffering=true
  const sends=[],flushed=[],actions=[]
  const socket={
    sendNode:async node=>{sends.push(node)},
    ev:{isBuffering:()=>buffering,flush:()=>{flushed.push(true);buffering=false;return true}}
  }
  const schedule=(cb,ms)=>{const t={id:++counter,cb,ms,cancelled:false};tasks.push(t);return t}
  const cancel=t=>{t.cancelled=true}
  const tick=async(ms)=>{
    const ready=tasks.filter(t=>!t.cancelled&&t.ms===ms)
    for(const t of ready){t.cancelled=true;await t.cb()}
  }
  const recovery=createWhatsAppOfflineRecovery({
    socket,isOpen:()=>connected,onAction:(...args)=>actions.push(args),schedule,cancel,
    batchDelayMs:8,flushDelayMs:30,maxBatchRequests:2
  })
  return {socket,sends,flushed,actions,recovery,tick,setConnected:x=>connected=x,
    tasks,setBuffering:x=>buffering=x}
}

test('se preview chegou, pede no máximo 2 lotes de 100 sem fabricar resposta do servidor',async()=>{
 const t=clockFixture()
 t.recovery.onPreview()
 t.recovery.onOpen()
 await t.tick(8)
 await t.tick(8)
 await t.tick(8)
 assert.deepEqual(t.sends,[
   {tag:'ib',attrs:{},content:[{tag:'offline_batch',attrs:{count:'100'}}]},
   {tag:'ib',attrs:{},content:[{tag:'offline_batch',attrs:{count:'100'}}]}
 ])
 assert.deepEqual(t.actions.filter(a=>a[0]==='batch'),[['batch',1],['batch',2]])
 assert.equal(t.recovery.snapshot().batches,2)
})

test('receber lote concluído impede novas solicitações; buffer continua sob controle do Baileys',async()=>{
 const t=clockFixture()
 t.recovery.onPreview()
 t.recovery.onOpen()
 await t.tick(8)
 t.recovery.onComplete()
 await t.tick(8)
 assert.equal(t.sends.length,1)
 assert.equal(t.recovery.snapshot().completed,true)
})

test('receber mensagens parciais não interrompe backlog; terminador impede novas solicitações',async()=>{
 const t=clockFixture()
 t.recovery.onPreview()
 t.recovery.onOpen()
 t.recovery.onMessage()
 await t.tick(8)
 assert.equal(t.sends.length,1) // lote solicitado ao servidor, não mensagem enviada a jogador
 t.recovery.onComplete()
 await t.tick(8)
 await t.tick(30)
 assert.equal(t.sends.length,1) // sem solicitações após terminador
 assert.equal(t.flushed.length,1) // um único flush no terminador
 assert.equal(t.recovery.snapshot().receivedMessages,true)
})

test('se o buffer ficou preso após conexão, libera localmente sem sinal offline inventado',async()=>{
 const t=clockFixture()
 t.recovery.onOpen()
 await t.tick(30)
 assert.equal(t.flushed.length,1)
 assert.deepEqual(t.actions,[['flush',1]])
 await t.tick(30)
 assert.equal(t.flushed.length,1)
})

test('não libera buffer que já foi esvaziado pelo próprio Baileys',async()=>{
 const t=clockFixture()
 t.setBuffering(false)
 t.recovery.onOpen()
 await t.tick(30)
 assert.equal(t.flushed.length,0)
})

test('desconexão cancela timers sem apagar sessão ou reiniciar processo',async()=>{
 const t=clockFixture()
 t.recovery.onPreview()
 t.recovery.onOpen()
 t.recovery.stop()
 await t.tick(8)
 await t.tick(30)
 assert.equal(t.sends.length,0)
 assert.equal(t.flushed.length,0)
})

test('não executa tarefas do WhatsApp sem conexão',async()=>{
 const t=clockFixture()
 t.recovery.onPreview()
 t.recovery.onOpen()
 t.setConnected(false)
 await t.tick(8)
 await t.tick(30)
 assert.equal(t.sends.length,0)
 assert.equal(t.flushed.length,0)
})

test('comandos antigos continuam ignorados e nenhuma mensagem sintética é inserida no socket',()=>{
 const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 const server=readFileSync(new URL('../src/neon/render-whatsapp.js',import.meta.url),'utf8')
 assert.match(index,/receivedAt-ts>120000/)
 assert.match(index,/Math.abs\(receivedAt-ts\)>45000/)
 assert.match(index,/offlineRecovery\.onMessage\(\)/)
 assert.match(index,/offlineRecovery\.onOpen\(\)/)
 assert.doesNotMatch(index,/sock\.ws\.emit\('CB:ib,,offline'/)
 assert.match(server,/Removing old closed session:/)
})

test('postinstall do Baileys 6.7.24 rejeita origem divergente e corrige offline=0',()=>{
 const script=readFileSync(new URL('../scripts/patch-baileys-media.mjs',import.meta.url),'utf8')
 assert.match(script,/manifest\.version==='6\.7\.24'/)
 assert.match(script,/const isOffline = node\.attrs\.offline === '1'/)
 assert.match(script,/node\.attrs\.offline === '1' \? 'append' : 'notify'/)
 assert.match(script,/patch cancelado por segurança/)
})
