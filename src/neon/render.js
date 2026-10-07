import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { handleWebApi } from './web-api.js'

const port = Number(process.env.PORT || 10000)
const webFiles={
  '/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css',
  '/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js',
  '/rpg':'index.html','/rpg/':'index.html','/rpg/index.html':'index.html',
  '/pet-art-audit.html':'pet-art-audit.html','/rpg/pet-art-audit.html':'pet-art-audit.html',
  '/rpg/app.js':'app.js','/rpg/styles.css':'styles.css',
  '/rpg/manifest.webmanifest':'manifest.webmanifest','/rpg/sw.js':'sw.js'
}
const webTypes={
  html:'text/html; charset=utf-8',
  js:'text/javascript; charset=utf-8',
  css:'text/css; charset=utf-8',
  json:'application/json; charset=utf-8',
  webmanifest:'application/manifest+json; charset=utf-8',
  webp:'image/webp',
  png:'image/png',
  jpg:'image/jpeg',
  jpeg:'image/jpeg',
  svg:'image/svg+xml'
}
function resolveWebFile(pathname){
  if(webFiles[pathname]) return webFiles[pathname]
  const asset=String(pathname||'').match(/^\/(?:rpg\/)?assets\/([A-Za-z0-9._\/-]+)$/)
  if(!asset || asset[1].includes('..')) return null
  return 'assets/'+asset[1]
}
async function serveWeb(req,res){
  const pathname=new URL(req.url||'/', 'http://localhost').pathname
  const file=resolveWebFile(pathname)
  if(!file) return false
  try{
    const data=await readFile(new URL('../../web/'+file,import.meta.url))
    const ext=file.split('.').pop()
    const cacheControl=file==='sw.js'?'no-store, no-cache, must-revalidate':
      ['html','js','css','webmanifest'].includes(ext)?'no-store':'public, max-age=86400'
    const headers={'content-type':webTypes[ext]||'application/octet-stream','cache-control':cacheControl}
    if(file==='sw.js') headers['service-worker-allowed']='/'
    res.writeHead(200,headers)
    res.end(data)
  }catch(err){
    console.error('[HTTP] falha ao servir RPG Web',err)
    res.writeHead(500,{'content-type':'text/plain; charset=utf-8'})
    res.end('Falha ao carregar Alpha RPG Web')
  }
  return true
}
const health=globalThis.__trevoHealth || (globalThis.__trevoHealth={
  whatsapp:'starting',
  lastChange:Date.now(),
  lastOpen:0,
  everConnected:false
})

http.createServer(async (req, res) => {
  if(await serveWeb(req,res)) return

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
