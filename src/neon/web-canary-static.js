// Read-only static frontend; never serve game records directly.
import {readFile} from 'node:fs/promises'

const types={
  html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',
  css:'text/css; charset=utf-8',webmanifest:'application/manifest+json; charset=utf-8',
  webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',svg:'image/svg+xml'
}
const directFiles=new Map([
  ['/rpg','index.html'],['/rpg/','index.html'],['/rpg/index.html','index.html'],
  ['/app.js','app.js'],['/styles.css','styles.css'],
  ['/manifest.webmanifest','manifest.webmanifest'],['/sw.js','sw.js'],
  ['/rpg/app.js','app.js'],['/rpg/styles.css','styles.css'],
  ['/rpg/manifest.webmanifest','manifest.webmanifest'],['/rpg/sw.js','sw.js']
])
export function isAlphaWebPath(pathname){
  if(directFiles.has(pathname))return true
  const match=String(pathname).match(/^\/(?:rpg\/)?assets\/([A-Za-z0-9._/-]+)$/)
  return Boolean(match && !match[1].split('/').some(part=>!part||part==='.'||part==='..'))
}
export async function serveAlphaWeb(req,res,pathname){
  let file=directFiles.get(pathname)
  if(!file){
    const match=pathname.match(/^\/(?:rpg\/)?assets\/([A-Za-z0-9._/-]+)$/)
    if(!match || match[1].split('/').some(p=>p==='..'||p==='.'||!p)) return false
    file='assets/'+match[1]
  }
  try{
    const data=await readFile(new URL('../../web/'+file,import.meta.url))
    const extension=file.split('.').pop()
    const cache=file==='sw.js'||extension==='html'?'no-store':
      ['js','css','webmanifest'].includes(extension)?'no-cache':'public, max-age=86400'
    res.writeHead(200,{
      'content-type':types[extension]||'application/octet-stream',
      'cache-control':cache,
      'x-content-type-options':'nosniff',
      'referrer-policy':'no-referrer',
      ...(file==='sw.js'?{'service-worker-allowed':'/'}:{})
    })
    res.end(data)
  }catch(err){
    if(err?.code==='ENOENT'){res.writeHead(404);res.end('Not found');return true}
    console.error('[Alpha Web] falha ao carregar arquivo',file,err?.message)
    res.writeHead(500);res.end('Web indisponível')
  }
  return true
}
