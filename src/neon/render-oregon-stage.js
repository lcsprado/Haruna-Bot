import http from 'node:http'

// The Oregon instance must NEVER connect to WhatsApp until the Ohio instance
// is stopped and its exact database/auth configuration has been copied.
// This entrypoint is intentionally inert by default.
if(process.env.ALPHA_WHATSAPP_ENABLE!=='1'){
  const port=Number(process.env.PORT||10000)
  http.createServer((request,response)=>{
    const ready=request.url?.split('?')[0]==='/ready'
    response.writeHead(ready?503:200,{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    })
    response.end(JSON.stringify({
      ok:!ready,service:'alpha-bot-whatsapp-oregon',
      state:'STANDBY',whatsappConnected:false
    }))
  }).listen(port,'0.0.0.0',()=>{
    console.log('[Oregon Standby] Serviço online SEM iniciar WhatsApp')
  })
}else{
  const required=['DATABASE_URL','OWNER_NUMBER','SESSION_ID']
  const missing=required.filter(key=>!String(process.env[key]||'').trim())
  if(missing.length)throw new Error('[Oregon Standby] bloqueado: configure '+missing.join(', '))
  console.log('[Oregon Cutover] inicialização habilitada; exclusividade da sessão deve estar garantida')
  await import('./render-whatsapp.js')
}
