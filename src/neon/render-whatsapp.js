import http from 'node:http'

// Entrada dedicada ao WhatsApp. Não injeta módulos de Cidade/NPC/Karma.
const port=Number(process.env.PORT||10000)
const health=globalThis.__trevoHealth||(globalThis.__trevoHealth={whatsapp:'starting',lastChange:Date.now(),lastOpen:0,everConnected:false})

http.createServer((req,res)=>{
  if(req.url==='/health'){
    const connected=health.whatsapp==='open'
    res.writeHead(connected?200:503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
    return res.end(JSON.stringify({ok:connected,service:'alpha-bot-whatsapp',whatsapp:health.whatsapp,lastOpen:health.lastOpen||null}))
  }
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'})
  res.end('Alpha Bot WhatsApp online')
}).listen(port,'0.0.0.0',()=>console.log('[HTTP] Alpha Bot WhatsApp-only listening on port '+port))

await import('./index.js')
