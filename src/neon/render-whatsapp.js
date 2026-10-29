import http from 'node:http'
import {timingSafeEqual} from 'node:crypto'
import QRCode from 'qrcode'
import {qrPageHtml} from './qr-page.js'
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

  if(url.pathname==='/parear' && req.method==='GET'){
    if(!process.env.ALPHA_QR_SECRET){res.writeHead(404);return res.end('Not found')}
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer','x-content-type-options':'nosniff'})
    return res.end(qrPageHtml)
  }
  if(url.pathname==='/api/link-qr' && (req.method==='GET'||req.method==='POST')){
    const token=String(process.env.ALPHA_QR_SECRET||'')
    if(!token){res.writeHead(404);return res.end('Not found')}
    const chunks=[]
    let total=0,tooLarge=false
    // GET com header Authorization evita POST/body incompatível com alguns WebViews.
    // A senha não aparece na URL nem é escrita nos logs.
    if(req.method==='GET'){
      void (async()=>{
        const provided=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'')
        const given=Buffer.from(provided),expected=Buffer.from(token)
        if(given.length!==expected.length||!timingSafeEqual(given,expected)){
          console.warn('[QR] Requisição GET rejeitada: autenticação inválida (sem exibir segredo)')
          res.writeHead(401,{'cache-control':'no-store','access-control-allow-origin':'none'})
          return res.end('Unauthorized')
        }
        try{
          const connected=health.whatsapp==='open'
          const qrState=globalThis.__alphaPairingQr||{}
          const fresh=Date.now()-Number(qrState.updatedAt||0)<45000
          const value=!connected&&fresh?qrState.value:null
          const image=value?await QRCode.toDataURL(value,{width:320,margin:2,errorCorrectionLevel:'M'}):null
          res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate','referrer-policy':'no-referrer'})
          console.log('[QR] Consulta autorizada:',connected?'conectado':image?'QR entregue':'aguardando QR')
          return res.end(JSON.stringify({connected,image}))
        }catch(err){
          console.error('[QR] falha no processamento:',err?.message||'erro_desconhecido')
          if(!res.writableEnded){res.writeHead(500,{'cache-control':'no-store'});res.end('QR unavailable')}
        }
      })()
      return
    }
    req.on('data',chunk=>{
      if(tooLarge)return
      total+=chunk.length
      if(total>1024){
        tooLarge=true
        res.writeHead(413,{'cache-control':'no-store'})
        res.end('Request too large')
        return
      }
      chunks.push(chunk)
    })
    req.on('end',async()=>{
      if(tooLarge||res.writableEnded)return
      let supplied=''
      try{supplied=JSON.parse(Buffer.concat(chunks).toString('utf8')).secret||''}catch{}
      const actual=Buffer.from(String(supplied)),expected=Buffer.from(token)
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){
        res.writeHead(401,{'cache-control':'no-store'})
        return res.end('Unauthorized')
      }
      try{
        const connected=health.whatsapp==='open'
        const qrState=globalThis.__alphaPairingQr||{}
        const value=!connected && Date.now()-Number(qrState.updatedAt||0)<45000?qrState.value:null
        const image=value?await QRCode.toDataURL(value,{width:320,margin:2,errorCorrectionLevel:'M'}):null
        res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'})
        return res.end(JSON.stringify({connected,image}))
      }catch(err){
        console.error('[WhatsApp] QR indisponível:',err?.message||'conversion_failed')
        if(!res.writableEnded){res.writeHead(500,{'cache-control':'no-store'});res.end('QR unavailable')}
      }
    })
    req.on('error',()=>{if(!res.writableEnded){res.writeHead(400);res.end('Bad request')}})
    return
  }

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

if(process.env.ALPHA_WHATSAPP_ENABLE==='0'){
  // Safe migration cutover: keep HTTP diagnostics up without opening another
  // Baileys socket or running automatic RPG jobs. Unset preserves old behavior.
  health.whatsapp='standby'
  health.lastChange=Date.now()
  console.log('[WhatsApp] INSTÂNCIA EM ESPERA: ALPHA_WHATSAPP_ENABLE=0; sessão não iniciada')
}else{
  await import('./index.js')
  // Auditoria privada do lote 2; não altera produção nesta implantação.
  void import('./auction-kaique-refund-20261029.js').then(m=>m.undoKaiqueGuaxinim20261029({apply:false})).catch(e=>console.error('[KAIQUE 47M REFUND] audit import failed',e?.message||e))

  // Auditoria agregada uma única vez; nenhuma migração, concessão ou evento antigo.
  setTimeout(async()=>{
    try{
      const {db}=await import('./db.js')
      await auditDatabaseBandwidth(db)
    }catch(err){console.warn('[Bandwidth DB audit] indisponível',err?.code||'query_failed')}
  },60000).unref?.()
}
