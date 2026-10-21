// Fail-closed entrypoint for an independent Alpha Web API hosting service.
// This file must NOT be used by the Render WhatsApp service.
const runtime=String(process.env.ALPHA_RUNTIME||'').trim().toLowerCase()
if(runtime!=='web-api-only')throw Error('WEB API BLOCKED: ALPHA_RUNTIME=web-api-only required')
const raw=String(process.env.DATABASE_URL||'')
let url
try{url=new URL(raw)}catch{throw Error('WEB API BLOCKED: DATABASE_URL missing or invalid')}
if(url.hostname!=='alphabot-lcsh-3393.b.aivencloud.com'||
  url.port!=='26343'||url.pathname!=='/alpha_prod_v2'){
  throw Error('WEB API BLOCKED: DATABASE_URL must target approved Aiven alpha_prod_v2')
}
const ca=String(process.env.ALPHA_AIVEN_CA_PEM||'').replace(/\\n/g,'\n').trim()
if(!ca.startsWith('-----BEGIN CERTIFICATE-----')||
   !ca.endsWith('-----END CERTIFICATE-----')){
  throw Error('WEB API BLOCKED: Aiven CA PEM must be configured')
}
const origins=String(process.env.WEB_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)
if(!origins.length||origins.some(o=>o==='*'||!/^https:\/\/[^/]+$/.test(o))){
  throw Error('WEB API BLOCKED: explicit HTTPS origins required')
}
const memberSecret=String(process.env.WEB_MEMBER_TOKEN_SECRET||'')
if(memberSecret.length<32)throw Error('WEB API BLOCKED: dedicated WEB_MEMBER_TOKEN_SECRET required (32+ chars)')
const pool=Number(process.env.ALPHA_WEB_DB_POOL_MAX||3)
if(!Number.isInteger(pool)||pool<1||pool>3)throw Error('WEB API BLOCKED: ALPHA_WEB_DB_POOL_MAX must be 1 to 3')
// Never load WhatsApp credentials or recovery flags into the isolated API.
for(const name of ['SESSION_ID','PAIRING_NUMBER','ALPHA_QR_SECRET']){
  if(process.env[name])throw Error('WEB API BLOCKED: WhatsApp-only variable must not be shared: '+name)
}
if(process.env.ALPHA_RESTORE_20261019==='yes'||process.env.ALPHA_INVENTORY_RECOVERY_20261019==='yes'){
  throw Error('WEB API BLOCKED: historical recovery must not execute')
}
console.log('[Alpha Web] configuration accepted; Aiven alpha_prod_v2, HTTPS + TLS CA, no WhatsApp runtime')
await import('../src/neon/render.js')
