import http from 'node:http'
import { handleWebApi } from './web-api.js'

const port = Number(process.env.PORT || 10000)
const health=globalThis.__trevoHealth || (globalThis.__trevoHealth={
  whatsapp:'starting',
  lastChange:Date.now(),
  lastOpen:0,
  everConnected:false
})

http.createServer(async (req, res) => {
  try{
    if(await handleWebApi(req,res)) return
  }catch(err){
    console.error('[HTTP] web api handler failed',err)
    if(!res.headersSent) res.writeHead(500,{'content-type':'application/json'})
    return res.end(JSON.stringify({ok:false,error:'Erro interno.'}))
  }

  if (req.url === '/health') {
    const connected=health.whatsapp==='open'
    res.writeHead(connected ? 200 : 503, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({
      ok: connected,
      service: 'alpha-bot',
      whatsapp: health.whatsapp,
      lastOpen: health.lastOpen || null
    }))
  }

  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('Alpha Bot online')
}).listen(port, '0.0.0.0', () => {
  console.log('[HTTP] Alpha Bot listening on port ' + port)
})

await import('./index.js')
