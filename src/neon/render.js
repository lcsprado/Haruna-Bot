import http from 'node:http'

const port = Number(process.env.PORT || 10000)
const health=globalThis.__trevoHealth || (globalThis.__trevoHealth={
  whatsapp:'starting',
  lastChange:Date.now(),
  lastOpen:0,
  everConnected:false
})

http.createServer((req, res) => {
  if (req.url === '/health') {
    const connected=health.whatsapp==='open'
    res.writeHead(connected ? 200 : 503, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({
      ok: connected,
      service: 'trevo-bot',
      whatsapp: health.whatsapp,
      lastOpen: health.lastOpen || null
    }))
  }

  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('Trevo Bot online')
}).listen(port, '0.0.0.0', () => {
  console.log('[HTTP] Trevo listening on port ' + port)
})

await import('./index.js')
