import http from 'node:http'

const port = Number(process.env.PORT || 10000)

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, service: 'trevo-bot' }))
  }

  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('Trevo Bot online')
}).listen(port, '0.0.0.0', () => {
  console.log('[HTTP] Trevo listening on port ' + port)
})

await import('./index.js')
