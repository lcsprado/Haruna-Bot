import http from 'node:http'
import {bandwidthSnapshot,trackBandwidthStream,startBandwidthReporting,auditDatabaseBandwidth} from './bandwidth.js'
import { healthPageHtml } from './health-page.js'

// A dependência Signal pode imprimir sessões criptográficas completas em texto.
// Silencia exclusivamente esse diagnóstico verboso, protegendo as chaves e a CPU;
// demais avisos e erros continuam registrados normalmente.
const originalConsoleLog=console.log.bind(console)
console.log=(...args)=>{
  if(typeof args[0]==='string' && args[0].startsWith('Closing session:'))return
  originalConsoleLog(...args)
}


// Entrada dedicada ao WhatsApp. Não injeta módulos de Cidade/NPC/Karma.
const port=Number(process.env.PORT||10000)
const health=globalThis.__trevoHealth||(globalThis.__trevoHealth={whatsapp:'starting',lastChange:Date.now(),lastOpen:0,everConnected:false})

startBandwidthReporting()
http.createServer((req,res)=>{
  trackBandwidthStream('http',req.socket)
  const url=new URL(req.url||'/', 'http://localhost')
  const browserWantsHtml=/text\/html/i.test(String(req.headers.accept||''))
  const showPage=url.pathname==='/'||url.pathname==='/acordar'||
    (url.pathname==='/health'&&browserWantsHtml&&url.searchParams.get('format')!=='json')
  if(showPage){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'})
    return res.end(healthPageHtml)
  }
  // Liveness HTTP independente do socket WhatsApp: monitores externos nao devem
  // marcar a instancia como indisponivel durante uma reconexao do Baileys.
  // /ready preserva o diagnostico estrito: 503 se o WhatsApp nao estiver aberto.
  if(url.pathname==='/health' || url.pathname==='/ready'){
    const connected=health.whatsapp==='open'
    const isReadyCheck=url.pathname==='/ready'
    res.writeHead(isReadyCheck&&!connected?503:200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
    return res.end(JSON.stringify({
      ...(url.searchParams.get('metrics')==='1'?{bandwidth:bandwidthSnapshot()}:{}),
      commit:process.env.RENDER_GIT_COMMIT||null,
      ok:isReadyCheck?connected:true,whatsappConnected:connected,service:'alpha-bot-whatsapp',whatsapp:health.whatsapp,
      lastOpen:health.lastOpen||null,
      uptimeSeconds:Math.floor(process.uptime()),
      messagesSeen:Number(health.messagesSeen||0),
      lastUpsertAt:health.lastUpsertAt||null,
      lastInboundAt:health.lastInboundAt||null,
      lastInboundSecondsAgo:health.lastInboundAt?Math.floor((Date.now()-health.lastInboundAt)/1000):null,
      rawMessagesSeen:Number(health.rawMessagesSeen||0),
      lastRawMessageAt:health.lastRawMessageAt||null,
      pendingNotificationsReceived:health.pendingNotificationsReceived??null,
      offlinePreviewCount:Number(health.offlinePreviewCount||0),
      offlineCompletionCount:Number(health.offlineCompletionCount||0),
      forceFlushCount:Number(health.forceFlushCount||0)
    }))
  }
  res.writeHead(404,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'})
  res.end('Not found')
}).listen(port,'0.0.0.0',()=>console.log('[HTTP] Alpha Bot WhatsApp-only listening on port '+port))

await import('./index.js')

// Auditoria agregada uma única vez; nenhuma migração, concessão ou evento antigo.
setTimeout(async()=>{
  try{
    const {db}=await import('./db.js')
    await auditDatabaseBandwidth(db)
  }catch(err){console.warn('[Bandwidth DB audit] indisponível',err?.code||'query_failed')}
},60000).unref?.()
